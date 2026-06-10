import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  LevelsChannel, LevelsState, ChannelLevels,
  makeDefaultLevels, applyLevels, computeHistogram,
  gammaToDisplayVal, displayValToGamma
} from '../utils/levels';

// ─── Гистограмма ─────────────────────────────────────────────────────────────
const HIST_COLORS: Record<LevelsChannel, string> = {
  master: '#b0b0b0', r: '#e05555', g: '#55cc55', b: '#5588ff', a: '#909090',
};

function drawHist(
  canvas: HTMLCanvasElement,
  counts: number[],
  logScale: boolean,
  channel: LevelsChannel,
  isGB7: boolean
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(0, 0, w, h);

  let displayCounts = counts;
  if (isGB7) {
    displayCounts = new Array(128).fill(0);
    for (let i = 0; i < 256; i++) {
      displayCounts[Math.floor(i / 2)] += counts[i];
    }
  }

  const maxRaw = Math.max(...displayCounts);
  if (maxRaw === 0) return;
  const toHeight = (v: number) => logScale
    ? (Math.log1p(v) / Math.log1p(maxRaw)) * h
    : (v / maxRaw) * h;

  const numBins = displayCounts.length;
  const bw = w / numBins;
  ctx.fillStyle = HIST_COLORS[channel];
  for (let i = 0; i < numBins; i++) {
    const bh = toHeight(displayCounts[i]);
    ctx.fillRect(i * bw, h - bh, Math.max(1, bw), bh);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  [numBins / 4, numBins / 2, (numBins * 3) / 4].forEach(x => {
    ctx.beginPath(); ctx.moveTo(x * bw, 0); ctx.lineTo(x * bw, h); ctx.stroke();
  });
}

// ─── Ползунок с тремя маркерами ──────────────────────────────────────────────
interface SliderProps {
  ch: ChannelLevels;
  onChange: (upd: Partial<ChannelLevels>) => void;
}

function LevelsSlider({ ch, onChange }: SliderProps) {
  const { inBlack, inGamma, inWhite } = ch;
  const trackRef = useRef<HTMLDivElement>(null);

  const gammaDisplayVal = gammaToDisplayVal(inBlack, inWhite, inGamma);
  const pct = (v: number) => `${(v / 255) * 100}%`;

  const valFromMouse = useCallback((clientX: number): number => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 255);
  }, []);

  // Сохраняем текущие пропсы и gammaDV в ref чтобы использовать из closure mousemove
  const propsRef = useRef({ inBlack, inGamma, inWhite, gammaDisplayVal, onChange });
  useEffect(() => { propsRef.current = { inBlack, inGamma, inWhite, gammaDisplayVal, onChange }; });

  useEffect(() => {
    // Локальная переменная для отслеживания drag — только внутри closure
    let activeDrag: 'black' | 'gamma' | 'white' | null = null;

    let lastMoveTime = 0;

    const move = (e: MouseEvent) => {
      if (!activeDrag) return;

      // Троттлинг: обновляем состояние не чаще чем раз в ~30 мс (около 30 кадров в сек)
      // чтобы не заваливать React обновлениями и не вешать браузер (ошибка "Страница не отвечает")
      const now = performance.now();
      if (now - lastMoveTime < 32) return;
      lastMoveTime = now;

      const { inBlack: b, inWhite: w, onChange: cb } = propsRef.current;
      const val = valFromMouse(e.clientX);
      if (activeDrag === 'black') {
        const nb = Math.min(val, w - 2);
        cb({ inBlack: nb });
      } else if (activeDrag === 'white') {
        const nw = Math.max(val, b + 2);
        cb({ inWhite: nw });
      } else {
        const clamped = Math.max(b + 1, Math.min(w - 1, val));
        cb({ inGamma: displayValToGamma(b, w, clamped) });
      }
    };
    const up = () => { activeDrag = null; };

    // Пробрасываем setter через data-атрибут на trackRef
    const track = trackRef.current;
    if (!track) return;
    const startHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const marker = target.dataset.marker as typeof activeDrag;
      if (marker) { e.preventDefault(); activeDrag = marker; }
    };
    track.addEventListener('mousedown', startHandler);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      track.removeEventListener('mousedown', startHandler);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [valFromMouse]);

  return (
    <div className="lv-slider-wrap" ref={trackRef}>
      <div className="lv-slider-track" />
      <div className="lv-marker lv-marker-black" data-marker="black"
        style={{ left: pct(inBlack) }} title={`Точка чёрного: ${inBlack}`} />
      <div className="lv-marker lv-marker-gray" data-marker="gamma"
        style={{ left: pct(gammaDisplayVal) }} title={`Гамма: ${inGamma.toFixed(2)}`} />
      <div className="lv-marker lv-marker-white" data-marker="white"
        style={{ left: pct(inWhite) }} title={`Точка белого: ${inWhite}`} />
    </div>
  );
}

// ─── Числовой ввод ────────────────────────────────────────────────────────────
function NumInput({ value, min, max, step = 1, onChange }: {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      className="lv-num-input"
      type="number" min={min} max={max} step={step}
      value={step === 1 ? value : value.toFixed(2)}
      onChange={e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
      }}
    />
  );
}

// ─── Основной компонент ───────────────────────────────────────────────────────
const CHANNEL_LABELS: Record<LevelsChannel, string> = {
  master: 'RGB (Master)', r: 'Красный', g: 'Зелёный', b: 'Синий', a: 'Альфа',
};

interface Props {
  open: boolean;
  originalImgData: ImageData | null;
  isGB7?: boolean;
  onPreview: (data: ImageData | null) => void;
  onApply: (data: ImageData) => void;
  onCancel: () => void;
}

export default function LevelsDialog({ open, originalImgData, isGB7 = false, onPreview, onApply, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const histRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const previewBufferRef = useRef<ImageData | null>(null);

  const [activeChannel, setActiveChannel] = useState<LevelsChannel>('master');
  const [levels, setLevels] = useState<LevelsState>(makeDefaultLevels);
  const [logScale, setLogScale] = useState(false);
  const [preview, setPreview] = useState(true);

  // Сбрасываем буфер превью, если изменилась исходная картинка
  useEffect(() => {
    previewBufferRef.current = null;
  }, [originalImgData]);

  // Открытие/закрытие диалога
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      setLevels(makeDefaultLevels());
      setActiveChannel('master');
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open]);

  // Отрисовка гистограммы
  useEffect(() => {
    if (!open || !originalImgData || !histRef.current) return;
    const counts = computeHistogram(originalImgData, activeChannel);
    drawHist(histRef.current, counts, logScale, activeChannel, isGB7);
  }, [open, originalImgData, activeChannel, logScale, isGB7]);

  // Предпросмотр (через rAF — не перегружаем и переиспользуем буфер памяти)
  useEffect(() => {
    if (!open || !originalImgData) return;
    if (!preview) { onPreview(null); return; }

    if (!previewBufferRef.current || previewBufferRef.current.width !== originalImgData.width || previewBufferRef.current.height !== originalImgData.height) {
      previewBufferRef.current = new ImageData(originalImgData.width, originalImgData.height);
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      onPreview(applyLevels(originalImgData, levels, previewBufferRef.current!));
    });
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [levels, preview, open, originalImgData, onPreview]);

  const updateChannel = useCallback((upd: Partial<ChannelLevels>) => {
    setLevels(prev => ({ ...prev, [activeChannel]: { ...prev[activeChannel], ...upd } }));
  }, [activeChannel]);

  const ch = levels[activeChannel];

  const handleReset = () => setLevels(makeDefaultLevels());

  const handleCancel = () => {
    onPreview(null);
    onCancel();
  };

  const handleApply = () => {
    if (!originalImgData) return;
    onApply(applyLevels(originalImgData, levels));
  };

  return (
    <dialog ref={dialogRef} className="lv-dialog" onCancel={handleCancel}>
      <div className="lv-header">
        <span className="lv-title">Уровни</span>
        {/* Выбор канала */}
        <select className="lv-channel-select" value={activeChannel}
          onChange={e => setActiveChannel(e.target.value as LevelsChannel)}>
          {(Object.keys(CHANNEL_LABELS) as LevelsChannel[]).map(k => (
            <option key={k} value={k}>{CHANNEL_LABELS[k]}</option>
          ))}
        </select>
      </div>

      {/* Гистограмма */}
      <div className="lv-hist-wrap">
        <canvas ref={histRef} className="lv-hist-canvas" width={256} height={120} />
        <div className="lv-hist-controls">
          <label className="lv-check">
            <input type="checkbox" checked={logScale} onChange={e => setLogScale(e.target.checked)} />
            Лог. шкала
          </label>
        </div>
      </div>

      {/* Ползунок Input Levels */}
      <div className="lv-section-label">Входные уровни</div>
      <LevelsSlider ch={ch} onChange={updateChannel} />

      <div className="lv-inputs-row">
        <NumInput value={ch.inBlack} min={0} max={254} onChange={v => {
          const nb = Math.min(v, ch.inWhite - 2);
          updateChannel({ inBlack: nb });
        }} />
        <NumInput value={ch.inGamma} min={0.10} max={9.99} step={0.01}
          onChange={v => updateChannel({ inGamma: v })} />
        <NumInput value={ch.inWhite} min={1} max={255} onChange={v => {
          const nw = Math.max(v, ch.inBlack + 2);
          updateChannel({ inWhite: nw });
        }} />
      </div>

      {/* Кнопки */}
      <div className="lv-footer">
        <label className="lv-check lv-preview-check">
          <input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)} />
          Просмотр
        </label>
        <div className="lv-btn-group">
          <button className="lv-btn lv-btn-secondary" onClick={handleReset}>Сброс</button>
          <button className="lv-btn lv-btn-secondary" onClick={handleCancel}>Отмена</button>
          <button className="lv-btn lv-btn-primary" onClick={handleApply}>Применить</button>
        </div>
      </div>
    </dialog>
  );
}
