import React, { useRef, useState } from 'react';
import { decodeGB7, encodeGB7 } from './utils/gb7';
import { 
  Menu, MousePointer2, Hand, ZoomIn, Crop, 
  Type, PaintBucket, Eraser, Download, Upload, 
  Image as ImageIcon, Layers 
} from 'lucide-react';
import './App.css';

interface ImageMeta {
  width: number;
  height: number;
  depth: string;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<ImageMeta | null>(null);

  // --- Загрузка файла ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    if (file.name.toLowerCase().endsWith('.gb7')) {
      const buffer = await file.arrayBuffer();
      try {
        const imageData = decodeGB7(buffer);
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        ctx.putImageData(imageData, 0, 0);
        setMeta({ width: imageData.width, height: imageData.height, depth: "8 бит (7+1 маска)" });
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Ошибка чтения GB7');
      }
    } else {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        setMeta({ width: img.width, height: img.height, depth: "32 бит (RGBA)" });
      };
      img.src = URL.createObjectURL(file);
    }
  };

  // --- Скачивание файла ---
  const handleDownload = (format: 'png' | 'jpeg' | 'gb7-mask' | 'gb7-nomask') => {
    const canvas = canvasRef.current;
    if (!canvas || !meta) return;

    let downloadUrl = '';
    let filename = `untitled.${format.split('-')[0]}`;

    if (format === 'png' || format === 'jpeg') {
      downloadUrl = canvas.toDataURL(`image/${format}`);
    } else {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const useMask = format === 'gb7-mask';
      const blob = encodeGB7(imageData, useMask);
      downloadUrl = URL.createObjectURL(blob);
      filename = useMask ? 'untitled-mask.gb7' : 'untitled-nomask.gb7';
    }

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  // Триггер скрытого инпута
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="ps-app">
      {/* ВЕРХНЕЕ МЕНЮ */}
      <header className="ps-menubar">
        <div className="ps-menu-logo">
          <Menu size={16} />
        </div>
        <div className="ps-menu-item" onClick={triggerFileInput}>Файл</div>
        <div className="ps-menu-item">Редактирование</div>
        <div className="ps-menu-item">Изображение</div>
        <div className="ps-menu-item">Слои</div>
        <div className="ps-menu-item">Фильтры</div>
        <div className="ps-menu-item">Справка</div>
      </header>

      <div className="ps-body">
        {/* ЛЕВАЯ ПАНЕЛЬ ИНСТРУМЕНТОВ (Пока визуал для будущих лаб) */}
        <aside className="ps-toolbar">
          <button className="ps-tool active"><MousePointer2 size={18} /></button>
          <button className="ps-tool"><Hand size={18} /></button>
          <button className="ps-tool"><ZoomIn size={18} /></button>
          <button className="ps-tool"><Crop size={18} /></button>
          <button className="ps-tool"><PaintBucket size={18} /></button>
          <button className="ps-tool"><Eraser size={18} /></button>
          <button className="ps-tool"><Type size={18} /></button>
        </aside>

        {/* РАБОЧАЯ ОБЛАСТЬ (ХОЛСТ) */}
        <main className="ps-workspace">
          <div className="ps-canvas-wrapper">
            <canvas ref={canvasRef} className="ps-canvas"></canvas>
          </div>
        </main>

        {/* ПРАВАЯ ПАНЕЛЬ СВОЙСТВ */}
        <aside className="ps-properties">
          <div className="ps-panel">
            <div className="ps-panel-header">
              <ImageIcon size={14} /> Свойства
            </div>
            <div className="ps-panel-content">
              {meta ? (
                <div className="ps-meta-info">
                  <div className="ps-meta-row"><span>Ширина:</span> {meta.width} px</div>
                  <div className="ps-meta-row"><span>Высота:</span> {meta.height} px</div>
                  <div className="ps-meta-row"><span>Глубина:</span> {meta.depth}</div>
                </div>
              ) : (
                <p className="ps-placeholder">Изображение не загружено</p>
              )}
            </div>
          </div>

          <div className="ps-panel">
            <div className="ps-panel-header">
              <Layers size={14} /> Экспорт
            </div>
            <div className="ps-panel-content ps-export-actions">
              <button disabled={!meta} onClick={() => handleDownload('png')}><Download size={14} /> PNG</button>
              <button disabled={!meta} onClick={() => handleDownload('jpeg')}><Download size={14} /> JPG</button>
              <button disabled={!meta} onClick={() => handleDownload('gb7-nomask')}><Download size={14} /> GB7 (без маски)</button>
              <button disabled={!meta} onClick={() => handleDownload('gb7-mask')}><Download size={14} /> GB7 (с маской)</button>
            </div>
          </div>

          {/* Скрытый инпут для файлов */}
          <input 
            type="file" 
            ref={fileInputRef} 
            accept=".png, .jpg, .jpeg, .gb7" 
            onChange={handleFileUpload} 
            style={{ display: 'none' }} 
          />
        </aside>
      </div>

      {/* НИЖНЯЯ СТРОКА СОСТОЯНИЯ */}
      <footer className="ps-statusbar">
        <div className="ps-status-left">
          {meta ? `Документ: ${meta.width}x${meta.height} пикселей` : 'Готово'}
        </div>
        <div className="ps-status-right">
          Масштаб: По размеру экрана
        </div>
      </footer>
    </div>
  );
}

export default App;