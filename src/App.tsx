import { type ChangeEvent, type MouseEvent as ReactMouseEvent, useRef, useState, useEffect, useCallback } from 'react';
import { decodeGB7, encodeGB7, getGB7Depth } from './utils/gb7';
import { getImageDepth } from './utils/metadata';
import { type InterpolationMethod, resizeImageData, INTERPOLATION_METHODS, INTERPOLATION_KEYS } from './utils/interpolation';
import {
  Pipette, ZoomIn, ZoomOut, Download, Eye, EyeOff
} from 'lucide-react';
import LevelsDialog from './components/LevelsDialog';
import ResizeDialog from './components/ResizeDialog';
import ConvolutionDialog from './components/ConvolutionDialog';
import './App.css';

interface ImageMeta {
  width: number;
  height: number;
  depth: string;
  channels: number;
}

function rgbToLab(r: number, g: number, b: number) {
  let r_ = r / 255, g_ = g / 255, b_ = b / 255;
  r_ = r_ > 0.04045 ? Math.pow((r_ + 0.055) / 1.055, 2.4) : r_ / 12.92;
  g_ = g_ > 0.04045 ? Math.pow((g_ + 0.055) / 1.055, 2.4) : g_ / 12.92;
  b_ = b_ > 0.04045 ? Math.pow((b_ + 0.055) / 1.055, 2.4) : b_ / 12.92;

  let x = (r_ * 0.4124 + g_ * 0.3576 + b_ * 0.1805) / 0.95047;
  let y = (r_ * 0.2126 + g_ * 0.7152 + b_ * 0.0722) / 1.00000;
  let z = (r_ * 0.0193 + g_ * 0.1192 + b_ * 0.9505) / 1.08883;

  x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + 16 / 116;
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + 16 / 116;
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + 16 / 116;

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

  // Храним ImageData в useRef для производительности (без ререндеров и сериализации)
  const originalImgDataRef = useRef<ImageData | null>(null);
  const [imgVersion, setImgVersion] = useState(0);

  // Функция для безопасного обновления картинки и принудительного ререндера
  const setOriginalImgData = useCallback((data: ImageData | null) => {
    originalImgDataRef.current = data;
    setImgVersion(v => v + 1);
  }, []);

  const originalImgData = originalImgDataRef.current;

  const [channels, setChannels] = useState({ r: true, g: true, b: true, a: true });
  const [activeRightTab, setActiveRightTab] = useState<'export' | 'channels'>('channels');
  const [activeTool, setActiveTool] = useState<string>('pipette');
  const [pickedColor, setPickedColor] = useState<{ x: number, y: number, r: number, g: number, b: number, lab: { l: number, a: number, b: number } } | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [zoomMode, setZoomMode] = useState<'in' | 'out'>('in');
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [convolutionOpen, setConvolutionOpen] = useState(false);
  const [displayInterp, setDisplayInterp] = useState<InterpolationMethod>('bilinear');
  const workspaceRef = useRef<HTMLDivElement>(null);

  const rCanvasRef = useRef<HTMLCanvasElement>(null);
  const gCanvasRef = useRef<HTMLCanvasElement>(null);
  const bCanvasRef = useRef<HTMLCanvasElement>(null);
  const aCanvasRef = useRef<HTMLCanvasElement>(null);

  // Вычисляет масштаб, чтобы изображение целиком поместилось в workspace с отступами 50px
  const computeAutoFitZoom = useCallback((imgW: number, imgH: number): number => {
    const ws = workspaceRef.current;
    if (!ws) return 100;
    const availW = ws.clientWidth - 100; // 50px padding с каждой стороны
    const availH = ws.clientHeight - 100;
    if (availW <= 0 || availH <= 0) return 12;
    const scale = Math.min(availW / imgW, availH / imgH, 3); // max 300%
    return Math.max(12, Math.min(300, Math.round(scale * 100)));
  }, []);

  // Загрузка файла (картинка или GB7)
  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = '';
    setFilename(file.name);

    const applyImage = (imageData: ImageData, depth: string, channels: number) => {
      setOriginalImgData(imageData);
      setChannels({ r: true, g: true, b: true, a: true });
      setMeta({ width: imageData.width, height: imageData.height, depth, channels });
      // Auto-fit: подгоняем изображение под workspace с отступами 50px
      setZoom(computeAutoFitZoom(imageData.width, imageData.height));
    };

    if (file.name.toLowerCase().endsWith('.gb7')) {
      const buffer = await file.arrayBuffer();
      try {
        const info = getGB7Depth(buffer);
        applyImage(decodeGB7(buffer), info.depth, info.channels);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Ошибка чтения GB7');
      }
    } else {
      const buffer = await file.arrayBuffer();
      const info = getImageDepth(buffer, file.type);

      const img = new Image();
      const blob = new Blob([buffer], { type: file.type });
      const objectUrl = URL.createObjectURL(blob);
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width = img.width;
        off.height = img.height;
        const offCtx = off.getContext('2d');
        if (!offCtx) return;
        offCtx.drawImage(img, 0, 0);
        applyImage(offCtx.getImageData(0, 0, img.width, img.height), info.depth, info.channels);
        URL.revokeObjectURL(objectUrl);
      };
      img.onerror = () => {
        alert('Не удалось загрузить изображение');
        URL.revokeObjectURL(objectUrl);
      };
      img.src = objectUrl;
    }
  };

  // Экспорт оригинальных данных (без учета отключенных каналов)
  const handleDownload = (format: 'png' | 'jpeg' | 'gb7-mask' | 'gb7-nomask') => {
    if (!originalImgData || !meta) return;

    let downloadUrl = '';
    const baseName = filename.replace(/\.[^/.]+$/, "");
    let outFilename = `${baseName}.${format}`;

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
      outFilename = `${baseName}.gb7`;
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

    // 1. Применяем канальный фильтр на оригинальных данных (только если нужно)
    const ch = meta?.channels || 4;
    let allChannels = false;
    if (ch === 1) allChannels = channels.r;
    else if (ch === 2) allChannels = channels.r && channels.a;
    else if (ch === 3) allChannels = channels.r && channels.g && channels.b;
    else allChannels = channels.r && channels.g && channels.b && channels.a;

    let sourceForResize = originalImgData;

    if (!allChannels) {
      sourceForResize = new ImageData(
        new Uint8ClampedArray(originalImgData.data),
        originalImgData.width,
        originalImgData.height
      );

      const onlyAlpha = (ch === 2 && !channels.r && channels.a) || (ch === 4 && !channels.r && !channels.g && !channels.b && channels.a);
      
      for (let i = 0; i < sourceForResize.data.length; i += 4) {
        if (onlyAlpha) {
          const a = originalImgData.data[i + 3];
          sourceForResize.data[i] = a;
          sourceForResize.data[i + 1] = a;
          sourceForResize.data[i + 2] = a;
          sourceForResize.data[i + 3] = 255;
        } else {
          if (ch <= 2) {
            if (!channels.r) {
               sourceForResize.data[i] = 0;
               sourceForResize.data[i+1] = 0;
               sourceForResize.data[i+2] = 0;
            }
            if (ch === 2 && !channels.a) sourceForResize.data[i+3] = 255;
          } else {
            if (!channels.r) sourceForResize.data[i] = 0;
            if (!channels.g) sourceForResize.data[i + 1] = 0;
            if (!channels.b) sourceForResize.data[i + 2] = 0;
            if (ch === 4 && !channels.a) sourceForResize.data[i + 3] = 255;
          }
        }
      }
    }

    // 2. Масштабируем кастомной интерполяцией
    const scaledW = Math.max(1, Math.round(originalImgData.width * zoom / 100));
    const scaledH = Math.max(1, Math.round(originalImgData.height * zoom / 100));
    const scaled = resizeImageData(sourceForResize, scaledW, scaledH, displayInterp);

    // 3. Устанавливаем canvas = масштабированный размер (без CSS-зума)
    if (canvas.width !== scaledW || canvas.height !== scaledH) {
      canvas.width = scaledW;
      canvas.height = scaledH;
    }

    ctx.putImageData(scaled, 0, 0);
  }, [channels, imgVersion, zoom, displayInterp]);

  useEffect(() => {
    if (!originalImgData || activeRightTab !== 'channels') return;

    // 1. Создаём миниатюру оригинального изображения для быстрого обхода (ширина 160px)
    const scale = Math.min(160 / originalImgData.width, 1);
    const thumbW = Math.max(1, Math.floor(originalImgData.width * scale));
    const thumbH = Math.max(1, Math.floor(originalImgData.height * scale));

    // Быстрый даунскейл для миниатюр
    const baseThumbData = resizeImageData(originalImgData, thumbW, thumbH, 'nearest');

    // 2. Функция применения фильтра к заранее уменьшенной картинке
    const drawThumb = (ref: React.RefObject<HTMLCanvasElement | null>, type: 'r' | 'g' | 'b' | 'a' | 'gray') => {
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
        if (type === 'gray') {
          thumbData.data[i + 3] = 255;
        } else if (type === 'r') {
          thumbData.data[i + 1] = 0; thumbData.data[i + 2] = 0; thumbData.data[i + 3] = 255;
        } else if (type === 'g') {
          thumbData.data[i] = 0; thumbData.data[i + 2] = 0; thumbData.data[i + 3] = 255;
        } else if (type === 'b') {
          thumbData.data[i] = 0; thumbData.data[i + 1] = 0; thumbData.data[i + 3] = 255;
        } else if (type === 'a') {
          const a = thumbData.data[i + 3];
          thumbData.data[i] = a; thumbData.data[i + 1] = a; thumbData.data[i + 2] = a;
          thumbData.data[i + 3] = 255;
        }
      }
      ctx.putImageData(thumbData, 0, 0);
    }

    if (meta?.channels === 1 || meta?.channels === 2) {
      drawThumb(rCanvasRef, 'gray');
    } else {
      drawThumb(rCanvasRef, 'r');
      drawThumb(gCanvasRef, 'g');
      drawThumb(bCanvasRef, 'b');
    }
    if (meta?.channels === 2 || meta?.channels === 4) {
      drawThumb(aCanvasRef, 'a');
    }
  }, [activeRightTab, imgVersion, meta?.channels]);

  const handleCanvasClick = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'pipette') {
      if (!originalImgData || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      // Маппим canvas-координаты обратно в координаты оригинального изображения
      const canvasX = Math.floor((e.clientX - rect.left) * (canvasRef.current.width / rect.width));
      const canvasY = Math.floor((e.clientY - rect.top) * (canvasRef.current.height / rect.height));
      const x = Math.floor(canvasX * 100 / zoom);
      const y = Math.floor(canvasY * 100 / zoom);

      if (x >= 0 && x < originalImgData.width && y >= 0 && y < originalImgData.height) {
        const i = (y * originalImgData.width + x) * 4;
        const r = channels.r ? originalImgData.data[i] : 0;
        const g = channels.g ? originalImgData.data[i + 1] : 0;
        const b = channels.b ? originalImgData.data[i + 2] : 0;
        const lab = rgbToLab(r, g, b);
        setPickedColor({ x, y, r, g, b, lab });
      }
    } else if (activeTool === 'zoom') {
      setZoom(prev => {
        if (zoomMode === 'in') {
          return Math.min(300, Math.round(prev * 1.4));
        } else {
          return Math.max(12, Math.round(prev / 1.4));
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
    const src = data ?? current;
    // Масштабируем превью под текущий зум
    const scaledW = canvasRef.current.width;
    const scaledH = canvasRef.current.height;
    const scaled = resizeImageData(src, scaledW, scaledH, 'nearest');
    ctx.putImageData(scaled, 0, 0);
  }, []);

  const handleLevelsApply = useCallback((data: ImageData) => {
    setOriginalImgData(data);
    setLevelsOpen(false);
  }, []);

  const handleLevelsCancel = useCallback(() => {
    // Просто закрываем — useEffect перерисует оригинал на следующем рендере
    setLevelsOpen(false);
    // Принудительно перерисовываем через imgVersion
    setImgVersion(v => v + 1);
  }, []);

  // ─── Callback для ResizeDialog ─────────────────────────────────────────────
  const handleResizeApply = useCallback((data: ImageData) => {
    setOriginalImgData(data);
    setMeta(prev => ({ 
      width: data.width, 
      height: data.height, 
      depth: prev?.depth ?? '32 бит (RGBA)', 
      channels: prev?.channels ?? 4 
    }));
    setZoom(computeAutoFitZoom(data.width, data.height));
    setResizeOpen(false);
  }, [computeAutoFitZoom, setOriginalImgData]);

  // ─── Callbacks для ConvolutionDialog ───────────────────────────────────────
  const handleConvPreview = useCallback((data: ImageData | null) => {
    const current = originalImgDataRef.current;
    if (!canvasRef.current || !current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const src = data ?? current;
    const scaledW = canvasRef.current.width;
    const scaledH = canvasRef.current.height;
    const scaled = resizeImageData(src, scaledW, scaledH, 'nearest');
    ctx.putImageData(scaled, 0, 0);
  }, []);

  const handleConvApply = useCallback((data: ImageData) => {
    setOriginalImgData(data);
    setConvolutionOpen(false);
  }, []);

  const handleConvCancel = useCallback(() => {
    setConvolutionOpen(false);
    setImgVersion(v => v + 1);
  }, []);

  return (
    <div className="ps-app">
      {/* Главное меню сверху */}
      <header className="ps-menubar">
        <div className="ps-ps-logo">Ps</div>
        <div className="ps-menu-item" onClick={triggerFileInput}>Файл</div>
        <div className="ps-menu-item" onClick={() => meta && setLevelsOpen(true)}>Уровни</div>
        <div className="ps-menu-item" onClick={() => meta && setResizeOpen(true)}>Размер изображения</div>
        <div className="ps-menu-item" onClick={() => meta && setConvolutionOpen(true)}>Фильтр</div>
      </header>

      {/* Панель параметров выбранного инструмента */}
      <div className="ps-options-bar">
        {activeTool === 'pipette' && pickedColor ? (
          <>
            <div className="ps-opt-icon"><Pipette size={14} /></div>
            <div className="ps-opt-divider"></div>
            <div className="ps-opt-item"><span>X:</span> <input type="text" style={{ width: 40 }} value={pickedColor.x} readOnly /></div>
            <div className="ps-opt-item"><span>Y:</span> <input type="text" style={{ width: 40 }} value={pickedColor.y} readOnly /></div>
            <div className="ps-opt-divider"></div>
            <div style={{ width: 16, height: 16, backgroundColor: `rgb(${pickedColor.r},${pickedColor.g},${pickedColor.b})`, border: '1px solid #777' }}></div>
            <div className="ps-opt-item"><span>RGB:</span> <input type="text" style={{ width: 90 }} value={`${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b}`} readOnly /></div>
            <div className="ps-opt-item"><span>LAB:</span> <input type="text" style={{ width: 130 }} value={`${pickedColor.lab.l.toFixed(2)}, ${pickedColor.lab.a.toFixed(2)}, ${pickedColor.lab.b.toFixed(2)}`} readOnly /></div>
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
                min="12"
                max="300"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ width: 120, height: 4, accentColor: '#31a8ff' }}
              />
              <select 
                value={zoom} 
                onChange={e => setZoom(Number(e.target.value))}
                style={{ width: 60, marginLeft: 8, background: '#444', color: '#fff', border: '1px solid #555', borderRadius: 3 }}
              >
                {![12, 25, 50, 100, 200, 300].includes(zoom) && <option value={zoom}>{zoom}%</option>}
                <option value={12}>12%</option>
                <option value={25}>25%</option>
                <option value={50}>50%</option>
                <option value={100}>100%</option>
                <option value={200}>200%</option>
                <option value={300}>300%</option>
              </select>
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
        ) : null}
      </div>

      <div className="ps-body">
        {/* Панель инструментов */}
        <aside className="ps-toolbar">
          <div className={`ps-tool ${activeTool === 'pipette' ? 'active' : ''}`} onClick={() => setActiveTool('pipette')}><Pipette size={16} /></div>
          <div className={`ps-tool ${activeTool === 'zoom' ? 'active' : ''}`} onClick={() => setActiveTool('zoom')}><ZoomIn size={16} /></div>
        </aside>

        {/* Рабочая зона с холстом */}
        <main className="ps-workspace" ref={workspaceRef}>
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
                    cursor: activeTool === 'pipette' ? 'crosshair' : activeTool === 'zoom' ? (zoomMode === 'in' ? 'zoom-in' : 'zoom-out') : 'default'
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
                  {meta && (meta.channels === 1 || meta.channels === 2) && (
                    <div className={`ps-channel-item ${!channels.r ? 'disabled' : ''}`} onClick={() => setChannels(c => ({ ...c, r: !c.r }))}>
                      <div className="ps-channel-eye" style={{ marginRight: 8, display: 'flex', alignItems: 'center' }}>
                        {channels.r ? <Eye size={16} color="#ccc" /> : <EyeOff size={16} color="#666" />}
                      </div>
                      <canvas ref={rCanvasRef} className="ps-channel-thumb"></canvas>
                      <span className="ps-channel-name">Серый (Gray)</span>
                    </div>
                  )}
                  {meta && (meta.channels === 3 || meta.channels === 4) && (
                    <>
                      <div className={`ps-channel-item ${!channels.r ? 'disabled' : ''}`} onClick={() => setChannels(c => ({ ...c, r: !c.r }))}>
                        <div className="ps-channel-eye" style={{ marginRight: 8, display: 'flex', alignItems: 'center' }}>
                          {channels.r ? <Eye size={16} color="#ccc" /> : <EyeOff size={16} color="#666" />}
                        </div>
                        <canvas ref={rCanvasRef} className="ps-channel-thumb"></canvas>
                        <span className="ps-channel-name">Красный (R)</span>
                      </div>
                      <div className={`ps-channel-item ${!channels.g ? 'disabled' : ''}`} onClick={() => setChannels(c => ({ ...c, g: !c.g }))}>
                        <div className="ps-channel-eye" style={{ marginRight: 8, display: 'flex', alignItems: 'center' }}>
                          {channels.g ? <Eye size={16} color="#ccc" /> : <EyeOff size={16} color="#666" />}
                        </div>
                        <canvas ref={gCanvasRef} className="ps-channel-thumb"></canvas>
                        <span className="ps-channel-name">Зеленый (G)</span>
                      </div>
                      <div className={`ps-channel-item ${!channels.b ? 'disabled' : ''}`} onClick={() => setChannels(c => ({ ...c, b: !c.b }))}>
                        <div className="ps-channel-eye" style={{ marginRight: 8, display: 'flex', alignItems: 'center' }}>
                          {channels.b ? <Eye size={16} color="#ccc" /> : <EyeOff size={16} color="#666" />}
                        </div>
                        <canvas ref={bCanvasRef} className="ps-channel-thumb"></canvas>
                        <span className="ps-channel-name">Синий (B)</span>
                      </div>
                    </>
                  )}
                  {meta && (meta.channels === 2 || meta.channels === 4) && (
                    <div className={`ps-channel-item ${!channels.a ? 'disabled' : ''}`} onClick={() => setChannels(c => ({ ...c, a: !c.a }))}>
                      <div className="ps-channel-eye" style={{ marginRight: 8, display: 'flex', alignItems: 'center' }}>
                        {channels.a ? <Eye size={16} color="#ccc" /> : <EyeOff size={16} color="#666" />}
                      </div>
                      <canvas ref={aCanvasRef} className="ps-channel-thumb"></canvas>
                      <span className="ps-channel-name">Альфа (A)</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Инпут для выбора файла, который кликаем программно */}
        <input type="file" ref={fileInputRef} accept=".png, .jpg, .jpeg, .gb7" onChange={handleFileUpload} style={{ display: 'none' }} />
      </div>

      {/* Статус-бар с метаданными и управлением масштабом */}
      <footer className="ps-statusbar">
        <div className="ps-status-zoom">
          <input
            type="range"
            min="12"
            max="300"
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="ps-status-range"
            title="Масштаб отображения"
          />
          <select 
            value={zoom} 
            onChange={e => setZoom(Number(e.target.value))}
            className="ps-status-select"
            title="Пресеты масштаба"
          >
            {![12, 25, 50, 100, 200, 300].includes(zoom) && <option value={zoom}>{zoom}%</option>}
            <option value={12}>12%</option>
            <option value={25}>25%</option>
            <option value={50}>50%</option>
            <option value={100}>100%</option>
            <option value={200}>200%</option>
            <option value={300}>300%</option>
          </select>
        </div>
        <div className="ps-status-interp">
          <select
            value={displayInterp}
            onChange={e => setDisplayInterp(e.target.value as InterpolationMethod)}
            className="ps-status-select"
            title="Метод интерполяции отображения"
          >
            {INTERPOLATION_KEYS.map(k => (
              <option key={k} value={k}>{INTERPOLATION_METHODS[k].label}</option>
            ))}
          </select>
        </div>
        <div className="ps-status-info">
          {activeTool === 'pipette' ? 'Инструмент: пипетка. Кликните по изображению... | ' :
           activeTool === 'zoom' ? 'Инструмент: лупа. Кликните для масштабирования... | ' : ''}
          {meta ? `${meta.width} × ${meta.height} пикс. (${meta.depth})` : 'Документ не загружен'}
        </div>
      </footer>

      {/* Диалог «Уровни» */}
      <LevelsDialog
        open={levelsOpen}
        originalImgData={originalImgData}
        isGB7={meta?.depth.includes('7 бит') || meta?.depth.includes('8 бит (7 Gray')}
        onPreview={handleLevelsPreview}
        onApply={handleLevelsApply}
        onCancel={handleLevelsCancel}
      />

      {/* Диалог «Размер изображения» */}
      <ResizeDialog
        open={resizeOpen}
        originalImgData={originalImgData}
        onApply={handleResizeApply}
        onCancel={() => setResizeOpen(false)}
      />

      {/* Диалог «Фильтр (Свёртка)» */}
      <ConvolutionDialog
        open={convolutionOpen}
        originalImgData={originalImgData}
        onPreview={handleConvPreview}
        onApply={handleConvApply}
        onCancel={handleConvCancel}
      />
    </div>
  );
}

export default App;