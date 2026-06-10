/**
 * Свёртка изображения с ядром 3×3.
 * Поддержка выбора каналов и стратегии обработки краёв.
 */

// ─── Типы ────────────────────────────────────────────────────────────────────

export type EdgeStrategy = 'black' | 'white' | 'copy';

export interface KernelPreset {
  name: string;
  values: number[]; // 9 элементов (row-major 3×3)
  offset?: number;
}

// ─── Пресеты ядер ────────────────────────────────────────────────────────────

export const KERNEL_PRESETS: KernelPreset[] = [
  {
    name: 'Тождественное отображение',
    values: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  },
  {
    name: 'Повышение резкости',
    values: [0, -1, 0, -1, 5, -1, 0, -1, 0],
  },
  {
    name: 'Фильтр Гаусса (3×3)',
    values: [1, 2, 1, 2, 4, 2, 1, 2, 1],
  },
  {
    name: 'Прямоугольное размытие',
    values: [1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  {
    name: 'Оператор Прюитта (горизонтальный)',
    values: [-1, 0, 1, -1, 0, 1, -1, 0, 1],
    offset: 128,
  },
  {
    name: 'Оператор Прюитта (вертикальный)',
    values: [-1, -1, -1, 0, 0, 0, 1, 1, 1],
    offset: 128,
  },
];

// ─── Свёртка ─────────────────────────────────────────────────────────────────

/**
 * Применяет свёртку с ядром 3×3 к выбранным каналам изображения.
 *
 * @param src      — исходные пиксельные данные
 * @param kernel   — 9 значений ядра (row-major: [0..2] — верхняя строка, [3..5] — средняя, [6..8] — нижняя)
 * @param applyTo  — какие каналы обрабатывать (r, g, b)
 * @param edge     — стратегия заполнения краёв
 * @returns новый ImageData с результатом
 */
export function applyConvolution(
  src: ImageData,
  kernel: number[],
  applyTo: { r: boolean; g: boolean; b: boolean; a?: boolean },
  edge: EdgeStrategy,
  offset: number = 0,
): Promise<ImageData> {
  return new Promise((resolve) => {
    const { width: w, height: h, data: sd } = src;
    const dst = new ImageData(new Uint8ClampedArray(sd), w, h);
    const dd = dst.data;

    // Нормализация: если сумма ядра > 0, делим на неё (для blur-ядер).
    // Если сумма ≤ 0 (edge detection), не нормализуем.
    const kernelSum = kernel.reduce((a, b) => a + b, 0);
    const divisor = kernelSum > 0 ? kernelSum : 1;

    // Каналы для обработки (индексы 0=R, 1=G, 2=B)
    const channelIndices: number[] = [];
    if (applyTo.r) channelIndices.push(0);
    if (applyTo.g) channelIndices.push(1);
    if (applyTo.b) channelIndices.push(2);
    if (applyTo.a) channelIndices.push(3);

    // Если ни один канал не выбран — возвращаем копию
    if (channelIndices.length === 0) {
      resolve(dst);
      return;
    }

    // Значение пикселя за пределами изображения
    const edgeVal = edge === 'white' ? 255 : 0; // для 'black' и 'copy' обрабатываем отдельно

    /**
     * Получает значение канала пикселя с учётом стратегии краёв.
     */
    const getPixel = (x: number, y: number, ch: number): number => {
      if (x >= 0 && x < w && y >= 0 && y < h) {
        return sd[(y * w + x) * 4 + ch];
      }
      if (edge === 'copy') {
        // Зеркальное отражение от края — clamp к ближайшему краевому пикселю
        const cx = Math.max(0, Math.min(w - 1, x));
        const cy = Math.max(0, Math.min(h - 1, y));
        return sd[(cy * w + cx) * 4 + ch];
      }
      return edgeVal;
    };

    let y = 0;
    // Оптимальный размер чанка, чтобы браузер успевал отрисовывать UI (обычно ~16ms на кадр)
    // 30 строк для картинки в несколько мегапикселей достаточно, чтобы не вешать вкладку.
    const CHUNK_SIZE = 40;

    function processChunk() {
      const endY = Math.min(y + CHUNK_SIZE, h);

      for (; y < endY; y++) {
        for (let x = 0; x < w; x++) {
          const dstIdx = (y * w + x) * 4;

          for (const ch of channelIndices) {
            let sum = 0;
            // Проходим по ядру 3×3
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const ki = (ky + 1) * 3 + (kx + 1);
                sum += getPixel(x + kx, y + ky, ch) * kernel[ki];
              }
            }
            // Нормализуем и записываем
            const val = sum / divisor + offset;
            dd[dstIdx + ch] = Math.max(0, Math.min(255, Math.round(val)));
          }
          // Альфа-канал всегда копируется без изменений (уже есть в dst, т.к. создали из sd)
        }
      }

      if (y < h) {
        // Передаем управление браузеру для обновления интерфейса, затем продолжаем
        requestAnimationFrame(processChunk);
      } else {
        // Завершили обработку
        resolve(dst);
      }
    }

    // Запускаем первую порцию
    requestAnimationFrame(processChunk);
  });
}
