export function getImageDepth(buffer: ArrayBuffer, type: string): { depth: string, channels: number } {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (type === 'image/jpeg' || type === 'image/jpg') {
    let offset = 2; // Пропускаем FFD8
    while (offset < view.byteLength) {
      if (bytes[offset] !== 0xFF) {
        break; // Неверный формат JPEG
      }
      const marker = bytes[offset + 1];
      if (marker === 0xC0 || marker === 0xC2) {
        // SOF0 или SOF2
        const precision = bytes[offset + 4];
        const components = bytes[offset + 9];
        return { depth: `${precision * components} бит`, channels: components };
      }
      offset += 2 + view.getUint16(offset + 2);
    }
    return { depth: '24 бит', channels: 3 }; // Fallback для JPEG
  }

  if (type === 'image/png') {
    // Сигнатура PNG занимает 8 байт
    // IHDR chunk начинается с 8 байта (4 байта длина, 4 байта тип 'IHDR')
    // Данные IHDR начинаются с 16 байта
    if (view.byteLength > 25) {
      const bitDepth = bytes[24];
      const colorType = bytes[25];
      
      // Ищем чанк tRNS, который добавляет прозрачность
      let hasTransparency = false;
      let offset = 8; // Пропускаем сигнатуру PNG
      while (offset + 8 < view.byteLength) {
        const length = view.getUint32(offset);
        const chunkType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
        if (chunkType === 'tRNS') {
          hasTransparency = true;
          break;
        } else if (chunkType === 'IDAT') {
          break; // Данные пошли, дальше искать нет смысла
        }
        offset += 12 + length; // 4 (len) + 4 (type) + length + 4 (crc)
      }

      let multiplier = 1;
      let channels = 4;
      
      switch (colorType) {
        case 0: multiplier = 1; channels = hasTransparency ? 2 : 1; break; // Grayscale (+ Alpha if tRNS)
        case 2: multiplier = 3; channels = hasTransparency ? 4 : 3; break; // Truecolor (+ Alpha if tRNS)
        case 3: multiplier = 1; channels = hasTransparency ? 4 : 3; break; // Indexed (+ Alpha if tRNS)
        case 4: multiplier = 2; channels = 2; break; // Grayscale + Alpha
        case 6: multiplier = 4; channels = 4; break; // Truecolor + Alpha
      }
      const label = colorType === 3 ? ' (Индекс.)' : '';
      return { depth: `${bitDepth * multiplier} бит${label}`, channels };
    }
    return { depth: '32 бит', channels: 4 }; // Fallback
  }

  return { depth: '32 бит', channels: 4 }; // Для неизвестных
}
