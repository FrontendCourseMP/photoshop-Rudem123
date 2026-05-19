// Сигнатура "GB7" + управляющий символ 0x1D
const SIGNATURE = [0x47, 0x42, 0x37, 0x1D];
const VERSION = 0x01;

export function decodeGB7(buffer: ArrayBuffer): ImageData {
    const view = new DataView(buffer);

    // Валидация сигнатуры
    for (let i = 0; i < 4; i++) {
        if (view.getUint8(i) !== SIGNATURE[i]) {
            throw new Error("Неверная сигнатура файла");
        }
    }

    // Проверяем что заголовок хотя бы целый
    if (buffer.byteLength < 12) {
        throw new Error("Файл слишком короткий — заголовок обрезан");
    }

    const version = view.getUint8(4);
    if (version !== VERSION) console.warn("Неизвестная версия формата");

    const flag = view.getUint8(5);
    const hasMask = (flag & 1) === 1; // 0-й бит указывает на наличие маски

    // Размеры в Big-Endian (сетевой порядок)
    const width = view.getUint16(6, false);
    const height = view.getUint16(8, false);

    // Проверяем что данные изображения не обрезаны
    if (buffer.byteLength < 12 + width * height) {
        throw new Error(`Файл повреждён: ожидается ${12 + width * height} байт, получено ${buffer.byteLength}`);
    }

    const imageData = new ImageData(width, height);
    let offset = 12;

    for (let i = 0; i < width * height; i++) {
        const byte = view.getUint8(offset++);

        // Вытаскиваем 7 бит для оттенка серого
        const gray7 = byte & 0x7F;
        
        // Масштабируем 7 бит (0-127) до 8 бит (0-255)
        const gray8 = (gray7 << 1) | (gray7 >> 6);

        // 7-й бит отвечает за маску
        const maskBit = (byte & 0x80) >> 7;
        const alpha = hasMask ? (maskBit === 1 ? 255 : 0) : 255;

        // Заполняем RGBA пиксель для канваса
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

    // Пишем заголовок
    view.setUint8(0, SIGNATURE[0]);
    view.setUint8(1, SIGNATURE[1]);
    view.setUint8(2, SIGNATURE[2]);
    view.setUint8(3, SIGNATURE[3]);
    view.setUint8(4, VERSION);
    view.setUint8(5, useMask ? 1 : 0);
    view.setUint16(6, width, false); // Big-Endian
    view.setUint16(8, height, false);
    view.setUint16(10, 0, false);    // Резерв

    let offset = 12;
    for (let i = 0; i < width * height; i++) {
        const pxIdx = i * 4;
        const r = data[pxIdx];
        const g = data[pxIdx + 1];
        const b = data[pxIdx + 2];
        const a = data[pxIdx + 3];

        // Переводим в серое через Luma и сжимаем до 7 бит
        const gray8 = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const gray7 = gray8 >> 1;

        let byte = gray7 & 0x7F;

        if (useMask) {
            // Записываем маску в старший бит, если альфа > 127
            const isOpaque = a > 127 ? 1 : 0;
            byte |= (isOpaque << 7);
        }

        view.setUint8(offset++, byte);
    }

    return new Blob([buffer], { type: "application/octet-stream" });
}