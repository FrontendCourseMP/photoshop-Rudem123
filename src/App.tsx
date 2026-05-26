import { type ChangeEvent, type MouseEvent as ReactMouseEvent, useRef, useState, useEffect, useCallback } from 'react';
import { decodeGB7, encodeGB7 } from './utils/gb7';
import {
  MousePointer2, Move, Lasso, Crop, Pipette,
  PaintBucket, Eraser, Type, ZoomIn, ZoomOut, Hand,
  Image as ImageIcon, Download,
  SquareDashed, Paintbrush, PenTool, Home
} from 'lucide-react';
import LevelsDialog from './components/LevelsDialog';
import './App.css';

interface ImageMeta {
  width: number;
  height: number;
  depth: string;
}

function rgbToLab(r: number, g: number, b: number) {
  let r_ = r / 255, g_ = g / 255, b_ = b / 255;
  r_ = r_ > 0.04045 ? Math.pow((r_ + 0.055) / 1.055, 2.4) : r_ / 12.92;
  g_ = g_ > 0.04045 ? Math.pow((g_ + 0.055) / 1.055, 2.4) : g_ / 12.92;
  b_ = b_ > 0.04045 ? Math.pow((b_ + 0.055) / 1.055, 2.4) : b_ / 12.92;

  let x = (r_ * 0.4124 + g_ * 0.3576 + b_ * 0.1805) / 0.95047;
  let y = (r_ * 0.2126 + g_ * 0.7152 + b_ * 0.0722) / 1.00000;
  let z = (r_ * 0.0193 + g_ * 0.1192 + b_ * 0.9505) / 1.08883;

  x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
  y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
  z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;

  return {
    l: Math.max(0, (116 * y) - 16),
    a: (x - y) * 500,
    b: (y - z) * 200
  };
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<ImageMeta | null>(null);
  const [filename, setFilename] = useState<string>('Без имени-1');

  const [originalImgData, setOriginalImgData] = useState<ImageData | null>(null);
  const originalImgDataRef = useRef<ImageData | null>(null);
  // Синхронизируем ref с state для доступа из стабильных callback'ов
  useEffect(() => { originalImgDataRef.current = originalImgData; }, [originalImgData]);

  const [channels, setChannels] = useState({ r: true, g: true, b: true, a: true });
  const [activeRightTab, setActiveRightTab] = useState<'export'|'channels'>('channels');
  const [activeTool, setActiveTool] = useState<string>('pipette');
  const [pickedColor, setPickedColor] = useState<{x: number, y: number, r: number, g: number, b: number, lab: {l: number, a: number, b: number}} | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [zoomMode, setZoomMode] = useState<'in'|'out'>('in');
  const [levelsOpen, setLevelsOpen] = useState(false);

  const rCanvasRef = useRef<HTMLCanvasElement>(null);
  const gCanvasRef = useRef<HTMLCanvasElement>(null);
  const bCanvasRef = useRef<HTMLCanvasElement>(null);
  const aCanvasRef = useRef<HTMLCanvasElement>(null);

  // Загрузка файла (картинка или GB7)
  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Сбрасываем value инпута чтобы повторная загрузка того же файла вызывала onChange
    event.target.value = '';

    setFilename(file.name);

    if (file.name.toLowerCase().endsWith('.gb7')) {
      const buffer = await file.arrayBuffer();
      try {
        const imageData = decodeGB7(buffer);
        // НЕ трогаем canvasRef здесь — он указывает на скрытый canvas,
        // который будет уничтожен React'ом при setMeta.
        // Видимый canvas получит правильные размеры в useEffect.
        setOriginalImgData(imageData);
        setChannels({ r: true, g: true, b: true, a: true });
        setMeta({ width: imageData.width, height: imageData.height, depth: "8 бит (GB7)" });
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Ошибка чтения GB7');
      }
    } else {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        // Используем offscreen canvas для извлечения пиксельных данных,
        // а не canvasRef (который указывает на скрытый элемент)
        const off = document.createElement('canvas');
        off.width = img.width;
        off.height = img.height;
        const offCtx = off.getContext('2d');
        if (!offCtx) return;
        offCtx.drawImage(img, 0, 0);
        const imageData = offCtx.getImageData(0, 0, img.width, img.height);
        setOriginalImgData(imageData);
        setChannels({ r: true, g: true, b: true, a: true });
        setMeta({ width: img.width, height: img.height, depth: "32 бит (RGBA)" });
        URL.revokeObjectURL(objectUrl);
      };
      img.onerror = () => {
        alert('Не удалось загрузить изображение');
        URL.revokeObjectURL(objectUrl);
      };
      img.src = objectUrl;
    }
  };

  // Скачивание и сохранение файла
  // ВАЖНО: экспортируем из originalImgData, а НЕ с canvas, т.к. canvas
  // может содержать отфильтрованные каналы (R/G/B обнулены).
  const handleDownload = (format: 'png' | 'jpeg' | 'gb7-mask' | 'gb7-nomask') => {
    if (!originalImgData || !meta) return;

    let downloadUrl = '';
    let outFilename = filename.split('.')[0] + `_export.${format.split('-')[0]}`;

    if (format === 'png' || format === 'jpeg') {
      // Рисуем оригинальные данные на временный offscreen canvas для чистого экспорта
      const offscreen = document.createElement('canvas');
      offscreen.width = originalImgData.width;
      offscreen.height = originalImgData.height;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return;
      offCtx.putImageData(originalImgData, 0, 0);

      downloadUrl = offscreen.toDataURL(`image/${format}`);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = outFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    } else {
      const useMask = format === 'gb7-mask';
      const blob = encodeGB7(originalImgData, useMask);
      downloadUrl = URL.createObjectURL(blob);
      outFilename = useMask ? `${filename.split('.')[0]}_mask.gb7` : `${filename.split('.')[0]}_nomask.gb7`;
    }

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = outFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Небольшая задержка перед revoke — браузер должен успеть начать скачивание
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  useEffect(() => {
    if (!originalImgData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Устанавливаем внутреннее разрешение canvas если оно не совпадает.
    // Это критически важно: при первой загрузке React монтирует НОВЫЙ canvas
    // элемент (вместо скрытого), и его дефолтный размер 300×150.
    if (canvas.width !== originalImgData.width || canvas.height !== originalImgData.height) {
      canvas.width = originalImgData.width;
      canvas.height = originalImgData.height;
    }
    
    const newImgData = new ImageData(
      new Uint8ClampedArray(originalImgData.data),
      originalImgData.width,
      originalImgData.height
    );
    
    const onlyAlpha = !channels.r && !channels.g && !channels.b && channels.a;
    
    for (let i = 0; i < newImgData.data.length; i += 4) {
      if (onlyAlpha) {
        const a = originalImgData.data[i+3];
        newImgData.data[i] = a;
        newImgData.data[i+1] = a;
        newImgData.data[i+2] = a;
        newImgData.data[i+3] = 255;
      } else {
        if (!channels.r) newImgData.data[i] = 0;
        if (!channels.g) newImgData.data[i+1] = 0;
        if (!channels.b) newImgData.data[i+2] = 0;
        if (!channels.a) newImgData.data[i+3] = 255; // if alpha off, opaque
      }
    }
    
    ctx.putImageData(newImgData, 0, 0);
  }, [channels, originalImgData]);

  useEffect(() => {
    if (!originalImgData || activeRightTab !== 'channels') return;

    // 1. Создаём миниатюру оригинального изображения для быстрого обхода (ширина 160px)
    const scale = Math.min(160 / originalImgData.width, 1);
    const thumbW = Math.max(1, Math.floor(originalImgData.width * scale));
    const thumbH = Math.max(1, Math.floor(originalImgData.height * scale));

    const off = document.createElement('canvas');
    off.width = originalImgData.width;
    off.height = originalImgData.height;
    off.getContext('2d')!.putImageData(originalImgData, 0, 0);

    const small = document.createElement('canvas');
    small.width = thumbW;
    small.height = thumbH;
    const smallCtx = small.getContext('2d')!;
    smallCtx.drawImage(off, 0, 0, thumbW, thumbH);
    const baseThumbData = smallCtx.getImageData(0, 0, thumbW, thumbH);

    // 2. Функция применения фильтра к заранее уменьшенной картинке
    const drawThumb = (ref: React.RefObject<HTMLCanvasElement | null>, type: 'r' | 'g' | 'b' | 'a') => {
      const canvas = ref.current;
      if (!canvas) return;
      canvas.width = thumbW;
      canvas.height = thumbH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const thumbData = new ImageData(
        new Uint8ClampedArray(baseThumbData.data),
        thumbW,
        thumbH
      );

      for (let i = 0; i < thumbData.data.length; i += 4) {
          if (type === 'r') {
             thumbData.data[i+1] = 0; thumbData.data[i+2] = 0; thumbData.data[i+3] = 255;
          } else if (type === 'g') {
             thumbData.data[i] = 0; thumbData.data[i+2] = 0; thumbData.data[i+3] = 255;
          } else if (type === 'b') {
             thumbData.data[i] = 0; thumbData.data[i+1] = 0; thumbData.data[i+3] = 255;
          } else if (type === 'a') {
             const a = thumbData.data[i+3];
             thumbData.data[i] = a; thumbData.data[i+1] = a; thumbData.data[i+2] = a;
             thumbData.data[i+3] = 255;
          }
      }
      ctx.putImageData(thumbData, 0, 0);
    }

    drawThumb(rCanvasRef, 'r');
    drawThumb(gCanvasRef, 'g');
    drawThumb(bCanvasRef, 'b');
    drawThumb(aCanvasRef, 'a');
  }, [originalImgData, activeRightTab]);

  const handleCanvasClick = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'pipette') {
      if (!originalImgData || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      
      const x = Math.floor((e.clientX - rect.left) * scaleX);
      const y = Math.floor((e.clientY - rect.top) * scaleY);
      
      if (x >= 0 && x < originalImgData.width && y >= 0 && y < originalImgData.height) {
         const i = (y * originalImgData.width + x) * 4;
         const r = originalImgData.data[i];
         const g = originalImgData.data[i+1];
         const b = originalImgData.data[i+2];
         const lab = rgbToLab(r, g, b);
         setPickedColor({ x, y, r, g, b, lab });
      }
    } else if (activeTool === 'zoom') {
      setZoom(prev => {
        if (zoomMode === 'in') {
          return Math.min(1600, Math.round(prev * 1.4));
        } else {
          return Math.max(10, Math.round(prev / 1.4));
        }
      });
    }
  };

  // ─── Callbacks для LevelsDialog (стабильные ссылки) ───────────────────────
  const handleLevelsPreview = useCallback((data: ImageData | null) => {
    const current = originalImgDataRef.current;
    if (!canvasRef.current || !current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(data ?? current, 0, 0);
  }, []);

  const handleLevelsApply = useCallback((data: ImageData) => {
    setOriginalImgData(data);
    setLevelsOpen(false);
  }, []);

  const handleLevelsCancel = useCallback(() => {
    const current = originalImgDataRef.current;
    if (canvasRef.current && current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.putImageData(current, 0, 0);
    }
    setLevelsOpen(false);
  }, []);

  return (
    <div className="ps-app">
      {/* Главное меню сверху */}
      <header className="ps-menubar">
        <div className="ps-ps-logo">Ps</div>
        <div className="ps-menu-item" onClick={triggerFileInput}>Файл</div>
        <div className="ps-menu-item">Редактирование</div>
        <div className="ps-menu-item" onClick={() => meta && setLevelsOpen(true)}>Изображение ▸ Уровни</div>
        <div className="ps-menu-item">Слои</div>
        <div className="ps-menu-item">Текст</div>
        <div className="ps-menu-item">Выделение</div>
        <div className="ps-menu-item">Фильтр</div>
        <div className="ps-menu-item">3D</div>
        <div className="ps-menu-item">Просмотр</div>
        <div className="ps-menu-item">Окно</div>
        <div className="ps-menu-item">Справка</div>
      </header>

      {/* Панель параметров выбранного инструмента */}
      <div className="ps-options-bar">
        {activeTool === 'pipette' && pickedColor ? (
          <>
            <div className="ps-opt-icon"><Pipette size={14} /></div>
            <div className="ps-opt-divider"></div>
            <div className="ps-opt-item"><span>X:</span> <input type="text" style={{width: 40}} value={pickedColor.x} readOnly /></div>
            <div className="ps-opt-item"><span>Y:</span> <input type="text" style={{width: 40}} value={pickedColor.y} readOnly /></div>
            <div className="ps-opt-divider"></div>
            <div style={{width: 16, height: 16, backgroundColor: `rgb(${pickedColor.r},${pickedColor.g},${pickedColor.b})`, border: '1px solid #777'}}></div>
            <div className="ps-opt-item"><span>RGB:</span> <input type="text" style={{width: 90}} value={`${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b}`} readOnly /></div>
            <div className="ps-opt-item"><span>LAB:</span> <input type="text" style={{width: 130}} value={`${pickedColor.lab.l.toFixed(1)}, ${pickedColor.lab.a.toFixed(1)}, ${pickedColor.lab.b.toFixed(1)}`} readOnly /></div>
          </>
        ) : activeTool === 'zoom' ? (
          <>
            <div className="ps-opt-icon"><ZoomIn size={14} /></div>
            <div className="ps-opt-divider"></div>
            <div className="ps-opt-item">
              <button 
                className={`ps-zoom-btn ${zoomMode === 'in' ? 'active' : ''}`}
                onClick={() => setZoomMode('in')}
                title="Приближение"
              >
                <ZoomIn size={14} />
              </button>
              <button 
                className={`ps-zoom-btn ${zoomMode === 'out' ? 'active' : ''}`}
                onClick={() => setZoomMode('out')}
                title="Отдаление"
              >
                <ZoomOut size={14} />
              </button>
            </div>
            <div className="ps-opt-divider"></div>
            <div className="ps-opt-item">
              <span>Масштаб:</span>
              <input 
                type="range" 
                min="10" 
                max="1600" 
                value={zoom} 
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ width: 120, height: 4, accentColor: '#31a8ff' }}
              />
              <span style={{ width: 45, textAlign: 'right', display: 'inline-block' }}>{zoom}%</span>
            </div>
            <div className="ps-opt-divider"></div>
            <button className="ps-btn-opt" onClick={() => setZoom(100)}>100%</button>
            <button className="ps-btn-opt" onClick={() => {
              if (!meta || !canvasRef.current) return;
              const parent = canvasRef.current.parentElement;
              if (!parent) return;
              const w = parent.clientWidth - 40;
              const h = parent.clientHeight - 40;
              const scale = Math.min(w / meta.width, h / meta.height, 1) * 100;
              setZoom(Math.round(scale));
            }}>Подогнать</button>
          </>
        ) : (
          <>
            <div className="ps-opt-icon"><Home size={14} /></div>
            <div className="ps-opt-divider"></div>
            <div className="ps-opt-icon active"><SquareDashed size={14} /></div>
            <div className="ps-opt-divider"></div>
            <div className="ps-opt-item"><span>Растушевка:</span> <input type="text" value="0 пикс." readOnly /></div>
            <div className="ps-opt-item"><input type="checkbox" disabled /> Сглаживание</div>
            <div className="ps-opt-item"><span>Стиль:</span> <select disabled><option>Обычный</option></select></div>
            <button className="ps-btn-mask">Выделение и маска...</button>
          </>
        )}
      </div>

      <div className="ps-body">
        {/* Боковая панель инструментов (как в Photoshop) */}
        <aside className="ps-toolbar">
          <div className={`ps-tool ${activeTool === 'move' ? 'active' : ''}`} onClick={() => setActiveTool('move')}><Move size={16} /></div>
          <div className={`ps-tool ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setActiveTool('select')}><SquareDashed size={16} /></div>
          <div className={`ps-tool ${activeTool === 'lasso' ? 'active' : ''}`} onClick={() => setActiveTool('lasso')}><Lasso size={16} /></div>
          <div className={`ps-tool ${activeTool === 'crop' ? 'active' : ''}`} onClick={() => setActiveTool('crop')}><Crop size={16} /></div>
          <div className={`ps-tool ${activeTool === 'pipette' ? 'active' : ''}`} onClick={() => setActiveTool('pipette')}><Pipette size={16} /></div>
          <div className={`ps-tool ${activeTool === 'brush' ? 'active' : ''}`} onClick={() => setActiveTool('brush')}><Paintbrush size={16} /></div>
          <div className={`ps-tool ${activeTool === 'bucket' ? 'active' : ''}`} onClick={() => setActiveTool('bucket')}><PaintBucket size={16} /></div>
          <div className={`ps-tool ${activeTool === 'eraser' ? 'active' : ''}`} onClick={() => setActiveTool('eraser')}><Eraser size={16} /></div>
          <div className={`ps-tool ${activeTool === 'pen' ? 'active' : ''}`} onClick={() => setActiveTool('pen')}><PenTool size={16} /></div>
          <div className={`ps-tool ${activeTool === 'type' ? 'active' : ''}`} onClick={() => setActiveTool('type')}><Type size={16} /></div>
          <div className={`ps-tool ${activeTool === 'pointer' ? 'active' : ''}`} onClick={() => setActiveTool('pointer')}><MousePointer2 size={16} /></div>
          <div className={`ps-tool ${activeTool === 'hand' ? 'active' : ''}`} onClick={() => setActiveTool('hand')}><Hand size={16} /></div>
          <div className={`ps-tool ${activeTool === 'zoom' ? 'active' : ''}`} onClick={() => setActiveTool('zoom')}><ZoomIn size={16} /></div>
          <div className="ps-colors">
            <div className="ps-color-fg"></div>
            <div className="ps-color-bg"></div>
          </div>
        </aside>

        {/* Рабочая зона с холстом */}
        <main className="ps-workspace">
          {/* Вкладки сверху */}
          <div className="ps-doc-tabs">
            <div className="ps-doc-tab active">
              {filename} @ {zoom}% ({meta ? meta.depth : 'RGB/8#'}) <span className="ps-tab-close">×</span>
            </div>
          </div>

          <div className="ps-canvas-area">
            {meta ? (
              <div className="ps-canvas-scroll">
                <canvas 
                  ref={canvasRef} 
                  className="ps-canvas" 
                  onClick={handleCanvasClick} 
                  style={{ 
                    cursor: activeTool === 'pipette' ? 'crosshair' : activeTool === 'zoom' ? (zoomMode === 'in' ? 'zoom-in' : 'zoom-out') : 'default',
                    width: `${meta.width * (zoom / 100)}px`,
                    height: `${meta.height * (zoom / 100)}px`
                  }}
                ></canvas>
              </div>
            ) : (
              <>
                {/* Скрытый канвас для ref пока файл не открыт */}
                <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
                <div className="ps-canvas-scroll">
                  <div className="ps-empty-state">
                    <div className="ps-empty-icon">📂</div>
                    <p>Откройте файл через меню «Файл»</p>
                    <span>PNG, JPG или .gb7</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>

        {/* Боковые панели справа */}
        <aside className="ps-right-panels">
          {/* Выбор цвета */}
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

          {/* Панель со свойствами холста */}
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

          {/* Функции экспорта и каналы */}
          <div className="ps-panel ps-panel-layers">
            <div className="ps-panel-tabs">
              <div className={`ps-ptab ${activeRightTab === 'export' ? 'active' : ''}`} onClick={() => setActiveRightTab('export')}>Экспорт</div>
              <div className={`ps-ptab ${activeRightTab === 'channels' ? 'active' : ''}`} onClick={() => setActiveRightTab('channels')}>Каналы</div>
            </div>
            
            <div className="ps-panel-body">
              {activeRightTab === 'export' ? (
                <div className="ps-export-actions">
                  <button disabled={!meta} onClick={() => handleDownload('png')}><Download size={14} /> Сохранить как PNG</button>
                  <button disabled={!meta} onClick={() => handleDownload('jpeg')}><Download size={14} /> Сохранить как JPG</button>
                  <button disabled={!meta} onClick={() => handleDownload('gb7-nomask')}><Download size={14} /> Сохранить как GB7 (Без маски)</button>
                  <button disabled={!meta} onClick={() => handleDownload('gb7-mask')}><Download size={14} /> Сохранить как GB7 (С маской)</button>
                </div>
              ) : (
                <div className="ps-channels-list">
                  <div className={`ps-channel-item ${!channels.r ? 'disabled' : ''}`} onClick={() => setChannels(c => ({...c, r: !c.r}))}>
                    <canvas ref={rCanvasRef} className="ps-channel-thumb"></canvas>
                    <span className="ps-channel-name">Красный (R)</span>
                  </div>
                  <div className={`ps-channel-item ${!channels.g ? 'disabled' : ''}`} onClick={() => setChannels(c => ({...c, g: !c.g}))}>
                    <canvas ref={gCanvasRef} className="ps-channel-thumb"></canvas>
                    <span className="ps-channel-name">Зеленый (G)</span>
                  </div>
                  <div className={`ps-channel-item ${!channels.b ? 'disabled' : ''}`} onClick={() => setChannels(c => ({...c, b: !c.b}))}>
                    <canvas ref={bCanvasRef} className="ps-channel-thumb"></canvas>
                    <span className="ps-channel-name">Синий (B)</span>
                  </div>
                  <div className={`ps-channel-item ${!channels.a ? 'disabled' : ''}`} onClick={() => setChannels(c => ({...c, a: !c.a}))}>
                    <canvas ref={aCanvasRef} className="ps-channel-thumb"></canvas>
                    <span className="ps-channel-name">Альфа (A)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Инпут для выбора файла, который кликаем программно */}
        <input type="file" ref={fileInputRef} accept=".png, .jpg, .jpeg, .gb7" onChange={handleFileUpload} style={{ display: 'none' }} />
      </div>

      {/* Статус-бар с метаданными */}
      <footer className="ps-statusbar">
        <div className="ps-status-zoom">{zoom}%</div>
        <div className="ps-status-info">
          {meta ? `${meta.width} пикс. x ${meta.height} пикс. (${meta.depth})` : 'Документ не загружен'}
          <span className="ps-status-arrow">&gt;</span>
        </div>
      </footer>
      {/* Диалог «Уровни» */}
      <LevelsDialog
        open={levelsOpen}
        originalImgData={originalImgData}
        onPreview={handleLevelsPreview}
        onApply={handleLevelsApply}
        onCancel={handleLevelsCancel}
      />
    </div>
  );
}

export default App;