// src/utils/gb7.ts

// Сигнатура "GB7·" (0x1D - управляющий символ)
const SIGNATURE = [0x47, 0x42, 0x37, 0x1D];
const VERSION = 0x01;

export function decodeGB7(buffer: ArrayBuffer): ImageData {
    const view = new DataView(buffer);

    // 1. Проверка сигнатуры
    for (let i = 0; i < 4; i++) {
        if (view.getUint8(i) !== SIGNATURE[i]) {
            throw new Error("Неверная сигнатура файла: это не GB7");
        }
    }

    // 2. Чтение заголовка
    const version = view.getUint8(4);
    if (version !== VERSION) console.warn("Неизвестная версия GB7");

    const flag = view.getUint8(5);
    const hasMask = (flag & 1) === 1; // Проверяем 0-й бит

    const width = view.getUint16(6, false); // false = Big-Endian
    const height = view.getUint16(8, false);
    // 10-11 байты - зарезервированы, пропускаем

    // 3. Чтение данных изображения
    const imageData = new ImageData(width, height);
    let offset = 12;

    for (let i = 0; i < width * height; i++) {
        const byte = view.getUint8(offset++);

        // Извлекаем 7 младших бит для оттенка серого
        const gray7 = byte & 0x7F;
        // Масштабируем 7 бит (0-127) в 8 бит (0-255)
        const gray8 = (gray7 << 1) | (gray7 >> 6);

        // Извлекаем старший бит (маску)
        const maskBit = (byte & 0x80) >> 7;
        const alpha = hasMask ? (maskBit === 1 ? 255 : 0) : 255;

        // Записываем в ImageData (RGBA формат)
        const pxIdx = i * 4;
        imageData.data[pxIdx] = gray8;     // R
        imageData.data[pxIdx + 1] = gray8; // G
        imageData.data[pxIdx + 2] = gray8; // B
        imageData.data[pxIdx + 3] = alpha; // A
    }

    return imageData;
}

export function encodeGB7(imageData: ImageData, useMask: boolean): Blob {
    const { width, height, data } = imageData;
    const buffer = new ArrayBuffer(12 + width * height);
    const view = new DataView(buffer);

    // 1. Запись заголовка
    view.setUint8(0, SIGNATURE[0]);
    view.setUint8(1, SIGNATURE[1]);
    view.setUint8(2, SIGNATURE[2]);
    view.setUint8(3, SIGNATURE[3]);
    view.setUint8(4, VERSION);
    view.setUint8(5, useMask ? 1 : 0); // Флаг
    view.setUint16(6, width, false); // Big-Endian
    view.setUint16(8, height, false);
    view.setUint16(10, 0, false); // Резерв

    // 2. Запись данных
    let offset = 12;
    for (let i = 0; i < width * height; i++) {
        const pxIdx = i * 4;
        const r = data[pxIdx];
        const g = data[pxIdx + 1];
        const b = data[pxIdx + 2];
        const a = data[pxIdx + 3];

        // Перевод RGB в градации серого (Luma) и масштабирование из 0-255 в 0-127
        const gray8 = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const gray7 = gray8 >> 1;

        let byte = gray7 & 0x7F; // 7 младших бит

        if (useMask) {
            // Если пиксель непрозрачен (alpha > 127), ставим 1 в старший бит
            const isOpaque = a > 127 ? 1 : 0;
            byte |= (isOpaque << 7);
        }

        view.setUint8(offset++, byte);
    }

    return new Blob([buffer], { type: "application/octet-stream" });
}