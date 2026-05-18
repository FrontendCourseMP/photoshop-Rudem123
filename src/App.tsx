import React, { useRef, useState } from 'react';
import { decodeGB7, encodeGB7 } from './utils/gb7';
import {
  MousePointer2, Move, Lasso, Crop, Pipette,
  PaintBucket, Eraser, Type, ZoomIn, Hand,
  Image as ImageIcon, Layers, Download, Search,
  SquareDashed, Paintbrush, PenTool, Home
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
  const [filename, setFilename] = useState<string>('Без имени-1');

  // --- Загрузка файла ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFilename(file.name);
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
        setMeta({ width: imageData.width, height: imageData.height, depth: "8 бит (GB7)" });
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
    let outFilename = filename.split('.')[0] + `_export.${format.split('-')[0]}`;

    if (format === 'png' || format === 'jpeg') {
      downloadUrl = canvas.toDataURL(`image/${format}`);
    } else {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const useMask = format === 'gb7-mask';
      const blob = encodeGB7(imageData, useMask);
      downloadUrl = URL.createObjectURL(blob);
      outFilename = useMask ? `${filename.split('.')[0]}_mask.gb7` : `${filename.split('.')[0]}_nomask.gb7`;
    }

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = outFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="ps-app">
      {/* 1. ГЛАВНОЕ МЕНЮ */}
      <header className="ps-menubar">
        <div className="ps-ps-logo">Ps</div>
        <div className="ps-menu-item" onClick={triggerFileInput}>Файл</div>
        <div className="ps-menu-item">Редактирование</div>
        <div className="ps-menu-item">Изображение</div>
        <div className="ps-menu-item">Слои</div>
        <div className="ps-menu-item">Текст</div>
        <div className="ps-menu-item">Выделение</div>
        <div className="ps-menu-item">Фильтр</div>
        <div className="ps-menu-item">3D</div>
        <div className="ps-menu-item">Просмотр</div>
        <div className="ps-menu-item">Окно</div>
        <div className="ps-menu-item">Справка</div>
      </header>

      {/* 2. ПАНЕЛЬ ПАРАМЕТРОВ ИНСТРУМЕНТА (Options Bar) */}
      <div className="ps-options-bar">
        <div className="ps-opt-icon"><Home size={14} /></div>
        <div className="ps-opt-divider"></div>
        <div className="ps-opt-icon active"><SquareDashed size={14} /></div>
        <div className="ps-opt-divider"></div>
        <div className="ps-opt-item"><span>Растушевка:</span> <input type="text" value="0 пикс." readOnly /></div>
        <div className="ps-opt-item"><input type="checkbox" disabled /> Сглаживание</div>
        <div className="ps-opt-item"><span>Стиль:</span> <select disabled><option>Обычный</option></select></div>
        <button className="ps-btn-mask">Выделение и маска...</button>
      </div>

      <div className="ps-body">
        {/* 3. ЛЕВАЯ ПАНЕЛЬ ИНСТРУМЕНТОВ */}
        <aside className="ps-toolbar">
          <div className="ps-tool"><Move size={16} /></div>
          <div className="ps-tool active"><SquareDashed size={16} /></div>
          <div className="ps-tool"><Lasso size={16} /></div>
          <div className="ps-tool"><Crop size={16} /></div>
          <div className="ps-tool"><Pipette size={16} /></div>
          <div className="ps-tool"><Paintbrush size={16} /></div>
          <div className="ps-tool"><PaintBucket size={16} /></div>
          <div className="ps-tool"><Eraser size={16} /></div>
          <div className="ps-tool"><PenTool size={16} /></div>
          <div className="ps-tool"><Type size={16} /></div>
          <div className="ps-tool"><MousePointer2 size={16} /></div>
          <div className="ps-tool"><Hand size={16} /></div>
          <div className="ps-tool"><ZoomIn size={16} /></div>
          <div className="ps-colors">
            <div className="ps-color-fg"></div>
            <div className="ps-color-bg"></div>
          </div>
        </aside>

        {/* 4. РАБОЧАЯ ОБЛАСТЬ (WORKSPACE) */}
        <main className="ps-workspace">
          {/* Вкладка документа */}
          <div className="ps-doc-tabs">
            <div className="ps-doc-tab active">
              {filename} @ 100% ({meta ? meta.depth : 'RGB/8#'}) <span className="ps-tab-close">×</span>
            </div>
          </div>

          <div className="ps-canvas-area">
            <div className="ps-canvas-wrapper">
              <canvas ref={canvasRef} className="ps-canvas"></canvas>
            </div>
          </div>
        </main>

        {/* 5. ПРАВАЯ ПАНЕЛЬ СВОЙСТВ */}
        <aside className="ps-right-panels">
          {/* Панель Цвета */}
          <div className="ps-panel ps-panel-color">
            <div className="ps-panel-tabs">
              <div className="ps-ptab active">Цвет</div>
              <div className="ps-ptab">Образцы</div>
              <div className="ps-ptab">Градиенты</div>
            </div>
            <div className="ps-panel-body">
              <div className="ps-color-picker-mock"></div>
            </div>
          </div>

          {/* Панель Свойств */}
          <div className="ps-panel ps-panel-properties">
            <div className="ps-panel-tabs">
              <div className="ps-ptab active">Свойства</div>
              <div className="ps-ptab">Коррекция</div>
            </div>
            <div className="ps-panel-body">
              <div className="ps-prop-section"><ImageIcon size={14} style={{ marginRight: 6 }} /> Документ</div>
              <div className="ps-prop-section">
                <div style={{ marginBottom: 10 }}>v Холст</div>
                <div className="ps-canvas-props">
                  <div className="ps-prop-row">
                    <span>Ш</span> <input type="text" value={meta ? `${meta.width} пикс.` : ''} readOnly />
                  </div>
                  <div className="ps-prop-row">
                    <span>В</span> <input type="text" value={meta ? `${meta.height} пикс.` : ''} readOnly />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Панель Экспорта (вместо слоев для удобства лабы) */}
          <div className="ps-panel ps-panel-layers">
            <div className="ps-panel-tabs">
              <div className="ps-ptab active">Экспорт</div>
              <div className="ps-ptab">Слои</div>
              <div className="ps-ptab">Каналы</div>
            </div>
            <div className="ps-panel-body ps-export-actions">
              <button disabled={!meta} onClick={() => handleDownload('png')}><Download size={14} /> Сохранить как PNG</button>
              <button disabled={!meta} onClick={() => handleDownload('jpeg')}><Download size={14} /> Сохранить как JPG</button>
              <button disabled={!meta} onClick={() => handleDownload('gb7-nomask')}><Download size={14} /> Сохранить как GB7 (Без маски)</button>
              <button disabled={!meta} onClick={() => handleDownload('gb7-mask')}><Download size={14} /> Сохранить как GB7 (С маской)</button>
            </div>
          </div>
        </aside>

        {/* Скрытый инпут */}
        <input type="file" ref={fileInputRef} accept=".png, .jpg, .jpeg, .gb7" onChange={handleFileUpload} style={{ display: 'none' }} />
      </div>

      {/* 6. СТРОКА СОСТОЯНИЯ (Обязательное требование) */}
      <footer className="ps-statusbar">
        <div className="ps-status-zoom">100%</div>
        <div className="ps-status-info">
          {meta ? `${meta.width} пикс. x ${meta.height} пикс. (${meta.depth})` : 'Документ не загружен'}
          <span className="ps-status-arrow">&gt;</span>
        </div>
      </footer>
    </div>
  );
}

export default App;