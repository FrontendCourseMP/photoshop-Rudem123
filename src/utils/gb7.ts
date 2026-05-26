// Сигнатура "GB7" + управляющий символ 0x1D
const SIGNATURE = [0x47, 0x42, 0x37, 0x1D];
const VERSION = 0x01;

// ─── Предвычисленные LUT (создаются 1 раз при загрузке модуля) ───────────────
// Для Uint32Array записи в ImageData (Little-Endian: байты в памяти = R, G, B, A)
// Uint32 значение: A << 24 | B << 16 | G << 8 | R
const GRAY7_OPAQUE = new Uint32Array(128);      // alpha = 255
const GRAY7_TRANSPARENT = new Uint32Array(128);  // alpha = 0
const GRAY7_TO_8 = new Uint8Array(128);          // gray7 → gray8 (для encode/другого использования)

for (let i = 0; i < 128; i++) {
    const g = Math.round(i * 255 / 127);
    GRAY7_TO_8[i] = g;
    // LE memory layout: [R, G, B, A] = [g, g, g, 0xFF]
    GRAY7_OPAQUE[i] = g | (g << 8) | (g << 16) | (0xFF << 24);
    GRAY7_TRANSPARENT[i] = g | (g << 8) | (g << 16); // alpha = 0
}

export function decodeGB7(buffer: ArrayBuffer): ImageData {
    const bytes = new Uint8Array(buffer);

    // Валидация сигнатуры
    for (let i = 0; i < 4; i++) {
        if (bytes[i] !== SIGNATURE[i]) {
            throw new Error("Неверная сигнатура файла");
        }
    }

    if (buffer.byteLength < 12) {
        throw new Error("Файл слишком короткий — заголовок обрезан");
    }

    const version = bytes[4];
    if (version !== VERSION) console.warn("Неизвестная версия формата");

    const flag = bytes[5];
    const hasMask = (flag & 1) === 1;

    // Big-Endian чтение ширины и высоты (2 байта DataView нужны только здесь, для заголовка)
    const width = (bytes[6] << 8) | bytes[7];
    const height = (bytes[8] << 8) | bytes[9];

    if (width === 0 || height === 0) {
        throw new Error("Некорректные размеры изображения");
    }

    // Авто-определение stride (шага строки с учётом выравнивания)
    let stride = width;
    let foundExact = false;

    for (const align of [4, 8, 16, 32, 64, 128]) {
        const testStride = Math.ceil(width / align) * align;
        if (12 + testStride * height === buffer.byteLength) {
            stride = testStride;
            foundExact = true;
            break;
        }
    }

    if (!foundExact && buffer.byteLength > 12 + width * height) {
        const testStride = Math.ceil(width / 4) * 4;
        if (12 + testStride * height <= buffer.byteLength) {
            stride = testStride;
        }
    }

    if (buffer.byteLength < 12 + stride * height) {
        throw new Error(`Файл повреждён: ожидается ${12 + stride * height} байт, получено ${buffer.byteLength}`);
    }

    const imageData = new ImageData(width, height);
    // Uint32Array view поверх того же буфера — запись 4 байт (RGBA) за 1 операцию
    const pixels32 = new Uint32Array(imageData.data.buffer);

    let offset = 12;
    const padding = stride - width;

    // Выносим ветвление hasMask ЗА цикл — убираем branch на каждый пиксель
    if (hasMask) {
        for (let y = 0; y < height; y++) {
            const rowEnd = offset + width;
            if (rowEnd > buffer.byteLength) {
                throw new Error(`Файл повреждён: данные обрезаны на строке ${y}`);
            }
            let pxIdx = y * width;
            for (let x = 0; x < width; x++) {
                const byte = bytes[offset++];
                const gray7 = byte & 0x7F;
                // Старший бит → выбор LUT с alpha=255 или alpha=0
                pixels32[pxIdx++] = (byte & 0x80) ? GRAY7_OPAQUE[gray7] : GRAY7_TRANSPARENT[gray7];
            }
            offset += padding;
        }
    } else {
        for (let y = 0; y < height; y++) {
            const rowEnd = offset + width;
            if (rowEnd > buffer.byteLength) {
                throw new Error(`Файл повреждён: данные обрезаны на строке ${y}`);
            }
            let pxIdx = y * width;
            for (let x = 0; x < width; x++) {
                // Без маски: всегда alpha=255, один LUT lookup + одна запись
                pixels32[pxIdx++] = GRAY7_OPAQUE[bytes[offset++] & 0x7F];
            }
            offset += padding;
        }
    }

    return imageData;
}

export function encodeGB7(imageData: ImageData, useMask: boolean): Blob {
    const { width, height, data } = imageData;
    const bufSize = 12 + width * height;
    const buffer = new ArrayBuffer(bufSize);
    const out = new Uint8Array(buffer);

    // Заголовок (12 байт — используем прямую запись в Uint8Array)
    out[0] = SIGNATURE[0];
    out[1] = SIGNATURE[1];
    out[2] = SIGNATURE[2];
    out[3] = SIGNATURE[3];
    out[4] = VERSION;
    out[5] = useMask ? 1 : 0;
    // Big-Endian width/height
    out[6] = (width >> 8) & 0xFF;
    out[7] = width & 0xFF;
    out[8] = (height >> 8) & 0xFF;
    out[9] = height & 0xFF;
    out[10] = 0; // Резерв
    out[11] = 0;

    // Предвычисленная LUT для gray8 → gray7
    // (127 уникальных входных значений можно кэшировать для 256 входов)
    const GRAY8_TO_7 = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        GRAY8_TO_7[i] = Math.round(i * 127 / 255);
    }

    let offset = 12;
    const totalPixels = width * height;

    if (useMask) {
        for (let i = 0; i < totalPixels; i++) {
            const pxIdx = i * 4;
            const gray8 = Math.round(0.299 * data[pxIdx] + 0.587 * data[pxIdx + 1] + 0.114 * data[pxIdx + 2]);
            let byte = GRAY8_TO_7[gray8] & 0x7F;
            if (data[pxIdx + 3] > 127) byte |= 0x80;
            out[offset++] = byte;
        }
    } else {
        for (let i = 0; i < totalPixels; i++) {
            const pxIdx = i * 4;
            const gray8 = Math.round(0.299 * data[pxIdx] + 0.587 * data[pxIdx + 1] + 0.114 * data[pxIdx + 2]);
            out[offset++] = GRAY8_TO_7[gray8] & 0x7F;
        }
    }

    return new Blob([buffer], { type: "application/octet-stream" });
}