import { useState, useEffect, useRef, useCallback } from 'react';
import {
  type InterpolationMethod,
  INTERPOLATION_METHODS,
  INTERPOLATION_KEYS,
  resizeImageData,
} from '../utils/interpolation';
import './ResizeDialog.css';

// ─── Типы ────────────────────────────────────────────────────────────────────

type SizeUnit = 'pixels' | 'percent';

interface ResizeDialogProps {
  open: boolean;
  originalImgData: ImageData | null;
  onApply: (result: ImageData) => void;
  onCancel: () => void;
}

// ─── Вспомогательные функции ─────────────────────────────────────────────────

function formatMegapixels(w: number, h: number): string {
  const mp = (w * h) / 1_000_000;
  if (mp < 0.01) return `${(w * h).toLocaleString()} пикс.`;
  return `${mp.toFixed(2)} Мпикс. (${(w * h).toLocaleString()} пикс.)`;
}

function clampDimension(value: number): number {
  return Math.max(1, Math.min(30000, Math.round(value)));
}

// ─── Компонент ───────────────────────────────────────────────────────────────

export default function ResizeDialog({ open, originalImgData, onApply, onCancel }: ResizeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [unit, setUnit] = useState<SizeUnit>('pixels');
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [keepAspect, setKeepAspect] = useState(true);
  const [method, setMethod] = useState<InterpolationMethod>('bilinear');
  const [processing, setProcessing] = useState(false);

  // Исходные размеры (для расчёта пропорций и процентов)
  const srcW = originalImgData?.width ?? 1;
  const srcH = originalImgData?.height ?? 1;
  const aspect = srcW / srcH;

  // ─── Синхронизация открытия/закрытия <dialog> ──────────────────────────
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // ─── Инициализация при открытии ────────────────────────────────────────
  useEffect(() => {
    if (open && originalImgData) {
      setWidth(unit === 'pixels' ? srcW : 100);
      setHeight(unit === 'pixels' ? srcH : 100);
      setProcessing(false);
    }
  }, [open, originalImgData, srcW, srcH, unit]);

  // ─── Размеры результата в пикселях ─────────────────────────────────────
  const resultW = clampDimension(unit === 'percent' ? srcW * width / 100 : width);
  const resultH = clampDimension(unit === 'percent' ? srcH * height / 100 : height);

  // ─── Обработчики изменения размеров ────────────────────────────────────
  const handleWidthChange = useCallback((raw: string) => {
    const v = parseFloat(raw);
    if (isNaN(v) || v <= 0) {
      setWidth(0);
      return;
    }
    setWidth(v);
    if (keepAspect) {
      if (unit === 'percent') {
        setHeight(v);
      } else {
        setHeight(clampDimension(v / aspect));
      }
    }
  }, [keepAspect, unit, aspect]);

  const handleHeightChange = useCallback((raw: string) => {
    const v = parseFloat(raw);
    if (isNaN(v) || v <= 0) {
      setHeight(0);
      return;
    }
    setHeight(v);
    if (keepAspect) {
      if (unit === 'percent') {
        setWidth(v);
      } else {
        setWidth(clampDimension(v * aspect));
      }
    }
  }, [keepAspect, unit, aspect]);

  // ─── Смена единиц ─────────────────────────────────────────────────────
  const handleUnitChange = useCallback((newUnit: SizeUnit) => {
    if (newUnit === unit) return;
    if (newUnit === 'percent') {
      setWidth(Math.round((width / srcW) * 10000) / 100);
      setHeight(Math.round((height / srcH) * 10000) / 100);
    } else {
      setWidth(clampDimension(srcW * width / 100));
      setHeight(clampDimension(srcH * height / 100));
    }
    setUnit(newUnit);
  }, [unit, width, height, srcW, srcH]);

  // ─── Применение ────────────────────────────────────────────────────────
  const handleApply = useCallback(() => {
    if (!originalImgData || resultW < 1 || resultH < 1) return;
    setProcessing(true);

    // Запускаем интерполяцию через setTimeout,
    // чтобы UI успел показать индикатор загрузки до блокировки потока
    requestAnimationFrame(() => {
      setTimeout(() => {
        const result = resizeImageData(originalImgData, resultW, resultH, method);
        onApply(result);
        setProcessing(false);
      }, 10);
    });
  }, [originalImgData, resultW, resultH, method, onApply]);

  // ─── Валидация ─────────────────────────────────────────────────────────
  const isValid = (() => {
    if (unit === 'pixels') {
      return width >= 1 && width <= 30000 && height >= 1 && height <= 30000;
    }
    return width > 0 && width <= 10000 && height > 0 && height <= 10000;
  })();

  const widthError = (() => {
    if (width <= 0) return 'Значение должно быть > 0';
    if (unit === 'pixels' && width > 30000) return 'Макс. 30 000 пикс.';
    if (unit === 'percent' && width > 10000) return 'Макс. 10 000%';
    return '';
  })();

  const heightError = (() => {
    if (height <= 0) return 'Значение должно быть > 0';
    if (unit === 'pixels' && height > 30000) return 'Макс. 30 000 пикс.';
    if (unit === 'percent' && height > 10000) return 'Макс. 10 000%';
    return '';
  })();

  if (!open) return null;

  return (
    <dialog ref={dialogRef} className="rs-dialog" onCancel={onCancel}>
      {/* Заголовок */}
      <div className="rs-header">
        <span className="rs-title">Размер изображения</span>
        <button className="rs-close" onClick={onCancel} aria-label="Закрыть">×</button>
      </div>

      <div className="rs-body">
        {/* Информация о пикселях */}
        <div className="rs-info-row">
          <div className="rs-info-label">Исходный размер:</div>
          <div className="rs-info-value">{srcW} × {srcH} — {formatMegapixels(srcW, srcH)}</div>
        </div>
        <div className="rs-info-row">
          <div className="rs-info-label">Новый размер:</div>
          <div className="rs-info-value">
            {resultW} × {resultH} — {formatMegapixels(resultW, resultH)}
          </div>
        </div>

        <div className="rs-separator" />

        {/* Единицы измерения */}
        <div className="rs-field-row">
          <label className="rs-label">Единицы:</label>
          <select
            className="rs-select"
            value={unit}
            onChange={e => handleUnitChange(e.target.value as SizeUnit)}
          >
            <option value="pixels">Пиксели</option>
            <option value="percent">Проценты (%)</option>
          </select>
        </div>

        {/* Ширина */}
        <div className="rs-field-row">
          <label className="rs-label">Ширина:</label>
          <div className="rs-input-wrap">
            <input
              type="number"
              className={`rs-input ${widthError ? 'rs-input-error' : ''}`}
              value={width || ''}
              min={unit === 'pixels' ? 1 : 0.01}
              max={unit === 'pixels' ? 30000 : 10000}
              step={unit === 'pixels' ? 1 : 0.1}
              onChange={e => handleWidthChange(e.target.value)}
            />
            <span className="rs-unit">{unit === 'pixels' ? 'пикс.' : '%'}</span>
          </div>
          {widthError && <span className="rs-error-msg">{widthError}</span>}
        </div>

        {/* Связь пропорций */}
        <div className="rs-aspect-row">
          <label className="rs-aspect-label">
            <input
              type="checkbox"
              checked={keepAspect}
              onChange={e => setKeepAspect(e.target.checked)}
            />
            <svg className="rs-link-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              {keepAspect ? (
                <>
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </>
              ) : (
                <>
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <line x1="1" y1="1" x2="23" y2="23" strokeDasharray="4 2" opacity="0.5" />
                </>
              )}
            </svg>
            Сохранять пропорции
          </label>
        </div>

        {/* Высота */}
        <div className="rs-field-row">
          <label className="rs-label">Высота:</label>
          <div className="rs-input-wrap">
            <input
              type="number"
              className={`rs-input ${heightError ? 'rs-input-error' : ''}`}
              value={height || ''}
              min={unit === 'pixels' ? 1 : 0.01}
              max={unit === 'pixels' ? 30000 : 10000}
              step={unit === 'pixels' ? 1 : 0.1}
              onChange={e => handleHeightChange(e.target.value)}
            />
            <span className="rs-unit">{unit === 'pixels' ? 'пикс.' : '%'}</span>
          </div>
          {heightError && <span className="rs-error-msg">{heightError}</span>}
        </div>

        <div className="rs-separator" />

        {/* Алгоритм интерполяции */}
        <div className="rs-field-row">
          <label className="rs-label">Интерполяция:</label>
          <div className="rs-interp-wrap">
            <select
              className="rs-select"
              value={method}
              onChange={e => setMethod(e.target.value as InterpolationMethod)}
            >
              {INTERPOLATION_KEYS.map(key => (
                <option key={key} value={key}>
                  {INTERPOLATION_METHODS[key].label}
                </option>
              ))}
            </select>
            {/* Тултип с описанием */}
            <div className="rs-tooltip-anchor">
              <span className="rs-tooltip-icon">?</span>
              <div className="rs-tooltip">
                <strong>{INTERPOLATION_METHODS[method].label}</strong>
                <p>{INTERPOLATION_METHODS[method].description}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Футер */}
      <div className="rs-footer">
        <button className="rs-btn rs-btn-secondary" onClick={onCancel} disabled={processing}>
          Отмена
        </button>
        <button
          className="rs-btn rs-btn-primary"
          onClick={handleApply}
          disabled={!isValid || processing}
        >
          {processing ? 'Обработка...' : 'Применить'}
        </button>
      </div>
    </dialog>
  );
}
