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
  channelsCount: number;
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
  channelsCount,
}: ConvolutionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [kernel, setKernel] = useState<number[]>([0, 0, 0, 0, 1, 0, 0, 0, 0]);
  const [offset, setOffset] = useState<number>(0);
  const [presetIdx, setPresetIdx] = useState(0);
  const [edge, setEdge] = useState<EdgeStrategy>('copy');
  const [applyChannels, setApplyChannels] = useState({ r: true, g: true, b: true, a: false });
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
      /* eslint-disable react-hooks/set-state-in-effect */
      setKernel([...KERNEL_PRESETS[0].values]);
      setOffset(KERNEL_PRESETS[0].offset || 0);
      setPresetIdx(0);
      setPreview(false);
      setProcessing(false);
      setApplyChannels({ r: true, g: true, b: true, a: false });
      setEdge('copy');
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open]);

  // Превью при изменении параметров
  useEffect(() => {
    if (!preview || !originalImgData || !open) return;

    const abortController = new AbortController();

    // Подготавливаем каналы для алгоритма.
    // Если картинка серая (channelsCount <= 2), отправляем r,g,b = applyChannels.r (чекбокс "Серый" маппится на 'r')
    const actualChannels = channelsCount <= 2
      ? { r: applyChannels.r, g: applyChannels.r, b: applyChannels.r, a: applyChannels.a }
      : applyChannels;

    applyConvolution(originalImgData, kernel, actualChannels, edge, offset, abortController.signal).then(result => {
      if (!abortController.signal.aborted) onPreview(result);
    }).catch(() => { /* Игнорируем прерванные промисы */ });

    return () => abortController.abort();
  }, [preview, kernel, offset, applyChannels, edge, originalImgData, open, channelsCount, onPreview]);

  const handlePresetChange = useCallback((idx: number) => {
    setPresetIdx(idx);
    setKernel([...KERNEL_PRESETS[idx].values]);
    setOffset(KERNEL_PRESETS[idx].offset || 0);
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

  const handleChannelToggle = useCallback((ch: 'r' | 'g' | 'b' | 'a') => {
    setApplyChannels(prev => ({ ...prev, [ch]: !prev[ch as keyof typeof prev] }));
  }, []);

  const handleReset = useCallback(() => {
    handlePresetChange(0);
    setEdge('copy');
    setApplyChannels({ r: true, g: true, b: true, a: false });
    if (preview) onPreview(null);
  }, [handlePresetChange, preview, onPreview]);

  const handleApply = useCallback(() => {
    if (!originalImgData) return;
    setProcessing(true);
    const actualChannels = channelsCount <= 2
      ? { r: applyChannels.r, g: applyChannels.r, b: applyChannels.r, a: applyChannels.a }
      : applyChannels;

    applyConvolution(originalImgData, kernel, actualChannels, edge, offset).then(result => {
      onApply(result);
      setProcessing(false);
    });
  }, [originalImgData, kernel, offset, applyChannels, edge, channelsCount, onApply]);

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

        <div className="cv-field-row" style={{ marginTop: 8 }}>
          <label className="cv-label">Смещение:</label>
          <input
            type="number"
            value={offset}
            onChange={e => {
              setOffset(Number(e.target.value));
              setPresetIdx(-1);
            }}
            style={{ width: 80, padding: '4px 8px', background: '#505050', color: '#e0e0e0', border: '1px solid #333', borderRadius: 3, outline: 'none' }}
          />
        </div>

        <div className="cv-separator" />

        {/* Каналы */}
        <div className="cv-field-row">
          <label className="cv-label">Каналы:</label>
          <div className="cv-channels">
            {channelsCount <= 2 ? (
              <label className="cv-ch-label" style={{ marginRight: 8 }}>
                <input type="checkbox" checked={applyChannels.r} onChange={() => handleChannelToggle('r')} />
                <span className="cv-ch-r" style={{ color: '#ccc' }}>Серый</span>
              </label>
            ) : (
              <>
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
              </>
            )}

            {(channelsCount === 2 || channelsCount === 4) && (
              <label className="cv-ch-label">
                <input type="checkbox" checked={applyChannels.a} onChange={() => handleChannelToggle('a')} />
                <span className="cv-ch-a" style={{ color: '#aaa' }}>A</span>
              </label>
            )}
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
