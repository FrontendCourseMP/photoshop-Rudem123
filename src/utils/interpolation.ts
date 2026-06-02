/**
 * Модуль двумерной интерполяции для масштабирования изображений.
 *
 * Реализованы два метода:
 *  - Nearest Neighbor (ближайший сосед)
 *  - Bilinear (билинейная интерполяция)
 *
 * Интерфейс спроектирован для лёгкого добавления новых методов
 * (например, бикубической) — достаточно добавить запись в INTERPOLATION_METHODS
 * и соответствующую ветку в resizeImageData.
 */

// ─── Типы и метаданные ──────────────────────────────────────────────────────

export type InterpolationMethod = 'nearest' | 'bilinear';

export interface InterpolationInfo {
  label: string;
  description: string;
}

/** Реестр доступных алгоритмов (для UI-селекторов и тултипов) */
export const INTERPOLATION_METHODS: Record<InterpolationMethod, InterpolationInfo> = {
  nearest: {
    label: 'Ближайший сосед',
    description:
      'Самый быстрый метод. Каждый пиксель результата берёт значение ближайшего пикселя исходного изображения. ' +
      'Сохраняет чёткие границы и пиксельную структуру, но при увеличении создаёт ступенчатые артефакты (алиасинг). ' +
      'Идеален для пиксель-арта и когда нужна максимальная резкость.',
  },
  bilinear: {
    label: 'Билинейная',
    description:
      'Вычисляет цвет каждого пикселя как взвешенное среднее четырёх ближайших соседей исходного изображения. ' +
      'Даёт плавные градиенты и переходы, устраняя ступенчатость. Немного размывает мелкие детали. ' +
      'Оптимальный баланс качества и скорости для большинства задач.',
  },
};

export const INTERPOLATION_KEYS = Object.keys(INTERPOLATION_METHODS) as InterpolationMethod[];

// ─── Главная функция ─────────────────────────────────────────────────────────

/**
 * Масштабирует ImageData до заданных размеров выбранным методом интерполяции.
 *
 * @param src       — исходные пиксельные данные
 * @param newWidth  — ширина результата (целое, ≥1)
 * @param newHeight — высота результата (целое, ≥1)
 * @param method    — алгоритм интерполяции (по умолчанию 'bilinear')
 * @returns новый ImageData с результатом
 */
export function resizeImageData(
  src: ImageData,
  newWidth: number,
  newHeight: number,
  method: InterpolationMethod = 'bilinear',
): ImageData {
  const w = Math.max(1, Math.round(newWidth));
  const h = Math.max(1, Math.round(newHeight));

  // Если размер не изменился — быстрое копирование
  if (w === src.width && h === src.height) {
    return new ImageData(new Uint8ClampedArray(src.data), w, h);
  }

  const dst = new ImageData(w, h);

  switch (method) {
    case 'nearest':
      resizeNearest(src, dst);
      break;
    case 'bilinear':
      resizeBilinear(src, dst);
      break;
    default: {
      // Защита от неизвестных методов — fallback к bilinear
      const _exhaustive: never = method;
      void _exhaustive;
      resizeBilinear(src, dst);
    }
  }

  return dst;
}

// ─── Nearest Neighbor ────────────────────────────────────────────────────────

function resizeNearest(src: ImageData, dst: ImageData): void {
  const { width: sw, height: sh, data: sd } = src;
  const { width: dw, height: dh, data: dd } = dst;

  // Используем Uint32Array для копирования сразу 4 байт (RGBA) за такт процессора
  const src32 = new Uint32Array(sd.buffer, sd.byteOffset, sd.byteLength / 4);
  const dst32 = new Uint32Array(dd.buffer, dd.byteOffset, dd.byteLength / 4);

  const xRatio = sw / dw;
  const yRatio = sh / dh;

  for (let y = 0; y < dh; y++) {
    // Вычисляем строку-источник один раз для всей строки
    const srcY = Math.min(Math.floor((y + 0.5) * yRatio), sh - 1);
    const srcRowOffset = srcY * sw;
    const dstRowOffset = y * dw;

    for (let x = 0; x < dw; x++) {
      const srcX = Math.min(Math.floor((x + 0.5) * xRatio), sw - 1);
      dst32[dstRowOffset + x] = src32[srcRowOffset + srcX];
    }
  }
}

// ─── Bilinear ────────────────────────────────────────────────────────────────

function resizeBilinear(src: ImageData, dst: ImageData): void {
  const { width: sw, height: sh, data: sd } = src;
  const { width: dw, height: dh, data: dd } = dst;

  // Маппинг центров пикселей: (i + 0.5) * (srcSize / dstSize) - 0.5
  // Это даёт корректное выравнивание при любых соотношениях размеров
  const xScale = sw / dw;
  const yScale = sh / dh;

  for (let y = 0; y < dh; y++) {
    const srcY = (y + 0.5) * yScale - 0.5;
    const y0 = Math.max(0, Math.floor(srcY));
    const y1 = Math.min(y0 + 1, sh - 1);
    const yFrac = srcY - y0;
    const yFracInv = 1 - yFrac;

    const dstRowOffset = y * dw;
    const srcRow0 = y0 * sw;
    const srcRow1 = y1 * sw;

    for (let x = 0; x < dw; x++) {
      const srcX = (x + 0.5) * xScale - 0.5;
      const x0 = Math.max(0, Math.floor(srcX));
      const x1 = Math.min(x0 + 1, sw - 1);
      const xFrac = srcX - x0;
      const xFracInv = 1 - xFrac;

      // Индексы четырёх соседей
      const i00 = (srcRow0 + x0) << 2;
      const i10 = (srcRow0 + x1) << 2;
      const i01 = (srcRow1 + x0) << 2;
      const i11 = (srcRow1 + x1) << 2;

      // Веса для каждого из 4 соседей
      const w00 = xFracInv * yFracInv;
      const w10 = xFrac * yFracInv;
      const w01 = xFracInv * yFrac;
      const w11 = xFrac * yFrac;

      const di = (dstRowOffset + x) << 2;

      // Интерполяция по 4 каналам (RGBA)
      dd[di]     = sd[i00]     * w00 + sd[i10]     * w10 + sd[i01]     * w01 + sd[i11]     * w11 + 0.5;
      dd[di + 1] = sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11 + 0.5;
      dd[di + 2] = sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11 + 0.5;
      dd[di + 3] = sd[i00 + 3] * w00 + sd[i10 + 3] * w10 + sd[i01 + 3] * w01 + sd[i11 + 3] * w11 + 0.5;
    }
  }
}
