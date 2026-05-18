// src/App.tsx
import React, { useRef, useState } from 'react';
import { decodeGB7, encodeGB7 } from './utils/gb7';
import './App.css';

interface ImageMeta {
  width: number;
  height: number;
  depth: string;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [meta, setMeta] = useState<ImageMeta | null>(null);

  // --- Загрузка файла ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Если это наш кастомный формат GB7
    if (file.name.toLowerCase().endsWith('.gb7')) {
      const buffer = await file.arrayBuffer();
      try {
        const imageData = decodeGB7(buffer);
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        ctx.putImageData(imageData, 0, 0);
        
        setMeta({ width: imageData.width, height: imageData.height, depth: "8 бит (7 бит цвет + 1 бит маска)" });
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Ошибка чтения GB7');
      }
    } 
    // Если это стандартный формат (PNG, JPG)
    else {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        setMeta({ width: img.width, height: img.height, depth: "32 бит (RGBA браузера)" });
      };
      img.src = URL.createObjectURL(file);
    }
  };

  // --- Скачивание файла ---
  const handleDownload = (format: 'png' | 'jpeg' | 'gb7-mask' | 'gb7-nomask') => {
    const canvas = canvasRef.current;
    if (!canvas || !meta) return;

    let downloadUrl = '';
    let filename = `image.${format.split('-')[0]}`;

    if (format === 'png' || format === 'jpeg') {
      downloadUrl = canvas.toDataURL(`image/${format}`);
    } else {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const useMask = format === 'gb7-mask';
      const blob = encodeGB7(imageData, useMask);
      downloadUrl = URL.createObjectURL(blob);
      filename = useMask ? 'image-mask.gb7' : 'image-nomask.gb7';
    }

    // Создаем невидимую ссылку для триггера скачивания
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="app-container">
      <header>
        <h1>Обработка изображений: Лаб 1</h1>
        <div className="toolbar">
          <input type="file" accept=".png, .jpg, .jpeg, .gb7" onChange={handleFileUpload} />
          
          <button disabled={!meta} onClick={() => handleDownload('png')}>Скачать PNG</button>
          <button disabled={!meta} onClick={() => handleDownload('jpeg')}>Скачать JPG</button>
          <button disabled={!meta} onClick={() => handleDownload('gb7-nomask')}>Скачать GB7 (без маски)</button>
          <button disabled={!meta} onClick={() => handleDownload('gb7-mask')}>Скачать GB7 (с маской)</button>
        </div>
      </header>

      <main className="canvas-wrapper">
        <canvas ref={canvasRef} className="image-canvas"></canvas>
      </main>

      <footer>
        <div className="status-bar">
          {meta ? (
            <>
              <span>Ширина: <strong>{meta.width} px</strong></span> | 
              <span>Высота: <strong>{meta.height} px</strong></span> | 
              <span>Глубина цвета: <strong>{meta.depth}</strong></span>
            </>
          ) : (
            <span>Загрузите изображение для просмотра информации</span>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;