import { useState, useEffect, useRef, useCallback } from 'react';
import {
  type EdgeStrategy,
  KERNEL_PRESETS,
  applyConvolution,
} from '../utils/convolution';
import './ConvolutionDialog.css';

interface ConvolutionDialogProps {
  open: boolean;
  originalImgData: ImageData | null;
  onPreview: (data: ImageData | null) => void;
  onApply: (data: ImageData) => void;
  onCancel: () => void;
}

const EDGE_OPTIONS: { value: EdgeStrategy; label: string }[] = [
  { value: 'black', label: 'Чёрный' },
  { value: 'white', label: 'Белый' },
  { value: 'copy', label: 'Копирование края' },
];

export default function ConvolutionDialog({
  open,
  originalImgData,
  onPreview,
  onApply,
  onCancel,
}: ConvolutionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [kernel, setKernel] = useState<number[]>([0, 0, 0, 0, 1, 0, 0, 0, 0]);
  const [presetIdx, setPresetIdx] = useState(0);
  const [edge, setEdge] = useState<EdgeStrategy>('copy');
  const [applyChannels, setApplyChannels] = useState({ r: true, g: true, b: true });
  const [preview, setPreview] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Синхронизация <dialog>
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  // Сброс при открытии
  useEffect(() => {
    if (open) {
      setKernel([...KERNEL_PRESETS[0].values]);
      setPresetIdx(0);
      setPreview(false);
      setProcessing(false);
      setApplyChannels({ r: true, g: true, b: true });
      setEdge('copy');
    }
  }, [open]);

  // Превью при изменении параметров
  useEffect(() => {
    if (!preview || !originalImgData || !open) return;
    const result = applyConvolution(originalImgData, kernel, applyChannels, edge);
    onPreview(result);
  }, [preview, kernel, applyChannels, edge, originalImgData, open, onPreview]);

  const handlePresetChange = useCallback((idx: number) => {
    setPresetIdx(idx);
    setKernel([...KERNEL_PRESETS[idx].values]);
  }, []);

  const handleKernelChange = useCallback((idx: number, raw: string) => {
    const v = parseFloat(raw);
    setKernel(prev => {
      const next = [...prev];
      next[idx] = isNaN(v) ? 0 : v;
      return next;
    });
    setPresetIdx(-1); // Пользовательские значения — сбрасываем пресет
  }, []);

  const handleChannelToggle = useCallback((ch: 'r' | 'g' | 'b') => {
    setApplyChannels(prev => ({ ...prev, [ch]: !prev[ch] }));
  }, []);

  const handleReset = useCallback(() => {
    handlePresetChange(0);
    setEdge('copy');
    setApplyChannels({ r: true, g: true, b: true });
    if (preview) onPreview(null);
  }, [handlePresetChange, preview, onPreview]);

  const handleApply = useCallback(() => {
    if (!originalImgData) return;
    setProcessing(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const result = applyConvolution(originalImgData, kernel, applyChannels, edge);
        onApply(result);
        setProcessing(false);
      }, 10);
    });
  }, [originalImgData, kernel, applyChannels, edge, onApply]);

  const handleClose = useCallback(() => {
    if (preview) onPreview(null);
    onCancel();
  }, [preview, onPreview, onCancel]);

  if (!open) return null;

  return (
    <dialog ref={dialogRef} className="cv-dialog" onCancel={handleClose}>
      <div className="cv-header">
        <span className="cv-title">Фильтр (Свёртка)</span>
        <button className="cv-close" onClick={handleClose} aria-label="Закрыть">×</button>
      </div>

      <div className="cv-body">
        {/* Пресеты */}
        <div className="cv-field-row">
          <label className="cv-label">Пресет:</label>
          <select
            className="cv-select"
            value={presetIdx}
            onChange={e => handlePresetChange(Number(e.target.value))}
          >
            {KERNEL_PRESETS.map((p, i) => (
              <option key={i} value={i}>{p.name}</option>
            ))}
            {presetIdx === -1 && <option value={-1}>Пользовательское</option>}
          </select>
        </div>

        {/* Сетка 3×3 */}
        <div className="cv-kernel-grid">
          {kernel.map((v, i) => (
            <input
              key={i}
              type="number"
              className="cv-kernel-cell"
              value={v}
              step="any"
              onChange={e => handleKernelChange(i, e.target.value)}
            />
          ))}
        </div>

        <div className="cv-separator" />

        {/* Каналы */}
        <div className="cv-field-row">
          <label className="cv-label">Каналы:</label>
          <div className="cv-channels">
            <label className="cv-ch-label">
              <input type="checkbox" checked={applyChannels.r} onChange={() => handleChannelToggle('r')} />
              <span className="cv-ch-r">R</span>
            </label>
            <label className="cv-ch-label">
              <input type="checkbox" checked={applyChannels.g} onChange={() => handleChannelToggle('g')} />
              <span className="cv-ch-g">G</span>
            </label>
            <label className="cv-ch-label">
              <input type="checkbox" checked={applyChannels.b} onChange={() => handleChannelToggle('b')} />
              <span className="cv-ch-b">B</span>
            </label>
          </div>
        </div>

        {/* Стратегия краёв */}
        <div className="cv-field-row">
          <label className="cv-label">Край:</label>
          <select
            className="cv-select"
            value={edge}
            onChange={e => setEdge(e.target.value as EdgeStrategy)}
          >
            {EDGE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Футер */}
      <div className="cv-footer">
        <label className="cv-preview-label">
          <input
            type="checkbox"
            checked={preview}
            onChange={e => {
              setPreview(e.target.checked);
              if (!e.target.checked) onPreview(null);
            }}
          />
          Просмотр
        </label>
        <div className="cv-btn-group">
          <button className="cv-btn cv-btn-secondary" onClick={handleReset} disabled={processing}>
            Сбросить
          </button>
          <button className="cv-btn cv-btn-secondary" onClick={handleClose} disabled={processing}>
            Закрыть
          </button>
          <button className="cv-btn cv-btn-primary" onClick={handleApply} disabled={processing}>
            {processing ? 'Обработка...' : 'Применить'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
