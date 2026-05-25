// Утилиты для инструмента "Уровни"

export type LevelsChannel = 'master' | 'r' | 'g' | 'b' | 'a';

export interface ChannelLevels {
  inBlack: number;  // 0–254
  inGamma: number;  // 0.10–9.99
  inWhite: number;  // 1–255
}

export type LevelsState = Record<LevelsChannel, ChannelLevels>;

export const DEFAULT_CH: ChannelLevels = { inBlack: 0, inGamma: 1.0, inWhite: 255 };

export function makeDefaultLevels(): LevelsState {
  return {
    master: { ...DEFAULT_CH },
    r:      { ...DEFAULT_CH },
    g:      { ...DEFAULT_CH },
    b:      { ...DEFAULT_CH },
    a:      { ...DEFAULT_CH },
  };
}

/** Таблица подстановки (LUT) по входным уровням */
export function buildLUT(inBlack: number, inWhite: number, gamma: number): Uint8Array {
  const lut = new Uint8Array(256);
  const range = Math.max(1, inWhite - inBlack);
  for (let i = 0; i < 256; i++) {
    let v = (i - inBlack) / range;
    v = Math.max(0, Math.min(1, v));
    if (gamma !== 1.0) v = Math.pow(v, 1 / gamma);
    lut[i] = Math.round(v * 255);
  }
  return lut;
}

/** Применяем уровни ко всем каналам без мутации оригинала */
export function applyLevels(original: ImageData, s: LevelsState): ImageData {
  const result = new ImageData(
    new Uint8ClampedArray(original.data),
    original.width,
    original.height
  );
  const mLUT = buildLUT(s.master.inBlack, s.master.inWhite, s.master.inGamma);
  const rLUT = buildLUT(s.r.inBlack, s.r.inWhite, s.r.inGamma);
  const gLUT = buildLUT(s.g.inBlack, s.g.inWhite, s.g.inGamma);
  const bLUT = buildLUT(s.b.inBlack, s.b.inWhite, s.b.inGamma);
  const aLUT = buildLUT(s.a.inBlack, s.a.inWhite, s.a.inGamma);
  for (let i = 0; i < result.data.length; i += 4) {
    result.data[i]   = rLUT[mLUT[original.data[i]]];
    result.data[i+1] = gLUT[mLUT[original.data[i+1]]];
    result.data[i+2] = bLUT[mLUT[original.data[i+2]]];
    result.data[i+3] = aLUT[original.data[i+3]];
  }
  return result;
}

/** Считаем гистограмму по каналу (256 значений) */
export function computeHistogram(imgData: ImageData, channel: LevelsChannel): number[] {
  const counts = new Array<number>(256).fill(0);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    let v: number;
    switch (channel) {
      case 'master': v = Math.round(0.2126 * d[i] + 0.7152 * d[i+1] + 0.0722 * d[i+2]); break;
      case 'r': v = d[i]; break;
      case 'g': v = d[i+1]; break;
      case 'b': v = d[i+2]; break;
      default:   v = d[i+3]; break;
    }
    counts[v]++;
  }
  return counts;
}

/** Вычисляем позицию маркера гаммы в пространстве 0–255 */
export function gammaToDisplayVal(inBlack: number, inWhite: number, gamma: number): number {
  return inBlack + Math.pow(0.5, 1 / gamma) * (inWhite - inBlack);
}

/** Вычисляем гамму из позиции маркера */
export function displayValToGamma(inBlack: number, inWhite: number, displayVal: number): number {
  const range = Math.max(1, inWhite - inBlack);
  const ratio = Math.max(0.0001, Math.min(0.9999, (displayVal - inBlack) / range));
  return Math.max(0.1, Math.min(9.99, Math.log(0.5) / Math.log(ratio)));
}
