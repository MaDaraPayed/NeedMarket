import { useRef, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Calendar, ChevronDown, UploadCloud, Minus, Plus } from 'lucide-react';

function FieldLabel({ label, optional }: { label: string; optional?: boolean }) {
  return (
    <label
      style={{
        display: 'block',
        fontSize: 12.5,
        fontWeight: 600,
        color: 'var(--nm-ink-2)',
        marginBottom: 8,
      }}
    >
      {label}
      {optional && (
        <em style={{ fontStyle: 'normal', color: 'var(--nm-ink-3)', fontWeight: 500 }}>
          {' · необязательно'}
        </em>
      )}
    </label>
  );
}

// ── TextField ────────────────────────────────────────────
interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  optional?: boolean;
}
export function TextField({ label, optional, className = '', ...props }: TextFieldProps) {
  return (
    <div style={{ marginBottom: 15 }}>
      <FieldLabel label={label} optional={optional} />
      <input className={`nm-field-input ${className}`} {...props} />
    </div>
  );
}

// ── FormTextarea ─────────────────────────────────────────
interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  optional?: boolean;
}
export function FormTextarea({ label, optional, className = '', ...props }: FormTextareaProps) {
  return (
    <div style={{ marginBottom: 15 }}>
      <FieldLabel label={label} optional={optional} />
      <textarea className={`nm-field-input nm-field-textarea ${className}`} {...props} />
    </div>
  );
}

// ── BudgetRow ─────────────────────────────────────────────
export function BudgetRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ marginBottom: 15 }}>
      <FieldLabel label={label} />
      <div className="nm-inp-row">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          placeholder={placeholder ?? 'например, 150 000'}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            border: 'none',
            background: 'none',
            padding: '13px 0',
            fontSize: 15,
            fontFamily: 'inherit',
            color: 'var(--nm-ink)',
            outline: 'none',
            minWidth: 0,
            appearance: 'none',
            WebkitAppearance: 'none',
          }}
        />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--nm-ink-2)', flexShrink: 0 }}>
          ₸
        </span>
      </div>
    </div>
  );
}

// ── DateRow ───────────────────────────────────────────────
function formatDateRu(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function DateRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const display = value ? formatDateRu(value) : null;

  function handleContainerClick() {
    try {
      inputRef.current?.showPicker?.();
    } catch {
      /* showPicker не поддерживается в данном WebView */
    }
  }

  return (
    <div style={{ marginBottom: 15 }}>
      <FieldLabel label={label} />
      {/* position:relative гарантируется .nm-inp-row в nm-tokens.css */}
      <div className="nm-inp-row" onClick={handleContainerClick} style={{ cursor: 'pointer' }}>
        {/* Визуальный слой — pointer-events:none, тапы проходят сквозь к input */}
        <Calendar
          size={19}
          color="var(--nm-ink-3)"
          style={{ flexShrink: 0, pointerEvents: 'none' }}
          aria-hidden
        />
        <span
          style={{
            flex: 1,
            fontSize: 15,
            color: display ? 'var(--nm-ink)' : 'var(--nm-ink-3)',
            userSelect: 'none',
            padding: '13px 0',
            pointerEvents: 'none',
          }}
        >
          {display ?? 'выберите дату'}
        </span>
        <ChevronDown
          size={18}
          color="var(--nm-ink-3)"
          style={{ flexShrink: 0, pointerEvents: 'none' }}
          aria-hidden
        />
        {/* Прозрачный input растянут на весь контейнер и перехватывает тапы */}
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            margin: 0,
            opacity: 0,
            cursor: 'pointer',
            zIndex: 2,
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────
export function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
  min = 1,
  max = 20,
  hint,
}: {
  label: string;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: 15 }}>
      <FieldLabel label={label} />
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          border: '1px solid var(--nm-line)',
          borderRadius: 'var(--nm-r-field)',
          overflow: 'hidden',
          background: 'var(--nm-surface)',
        }}
      >
        <button
          type="button"
          onClick={onDecrement}
          disabled={value <= min}
          aria-label="минус"
          style={{
            width: 46,
            height: 48,
            border: 'none',
            background: 'var(--nm-surface)',
            color: 'var(--nm-blue)',
            display: 'grid',
            placeItems: 'center',
            cursor: value <= min ? 'not-allowed' : 'pointer',
            opacity: value <= min ? 0.4 : 1,
          }}
        >
          <Minus size={18} />
        </button>
        <span
          style={{
            minWidth: 50,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--nm-ink)',
          }}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={onIncrement}
          disabled={value >= max}
          aria-label="плюс"
          style={{
            width: 46,
            height: 48,
            border: 'none',
            background: 'var(--nm-surface)',
            color: 'var(--nm-blue)',
            display: 'grid',
            placeItems: 'center',
            cursor: value >= max ? 'not-allowed' : 'pointer',
            opacity: value >= max ? 0.4 : 1,
          }}
        >
          <Plus size={18} />
        </button>
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', marginTop: 8 }}>{hint}</div>
      )}
    </div>
  );
}

// ── UploadZone ────────────────────────────────────────────
export function UploadZone({
  label,
  optional,
  description,
  onClick,
  children,
}: {
  label?: string;
  optional?: boolean;
  description?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 15 }}>
      {label && <FieldLabel label={label} optional={optional} />}
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        style={{
          border: '1.5px dashed var(--nm-blue-line)',
          borderRadius: 15,
          padding: '22px 16px',
          textAlign: 'center',
          background: 'var(--nm-blue-soft)',
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 13,
            background: 'var(--nm-surface)',
            color: 'var(--nm-blue)',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 11px',
          }}
        >
          <UploadCloud size={22} />
        </div>
        <b
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--nm-blue-strong)',
            display: 'block',
          }}
        >
          Прикрепить файлы
        </b>
        {description && (
          <span
            style={{ fontSize: 12, color: 'var(--nm-ink-2)', display: 'block', marginTop: 3 }}
          >
            {description}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

// ── FormHint ──────────────────────────────────────────────
// Живая подсказка с перечнем незаполненных обязательных полей.
// Пропадает когда список пуст. Не ошибка — не красный.
export function FormHint({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <div
      style={{
        fontSize: 13,
        color: 'var(--nm-ink-2)',
        lineHeight: 1.5,
        padding: '10px 0 2px',
      }}
    >
      Чтобы продолжить, заполните:{' '}
      <span style={{ fontWeight: 600 }}>{missing.join(', ')}</span>
    </div>
  );
}

// ── FormSection ───────────────────────────────────────────
export function FormSection({
  title,
  children,
  first = false,
}: {
  title: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <div style={{ marginTop: first ? 8 : 20 }}>
      <h5
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: 'var(--nm-ink)',
          letterSpacing: '-0.1px',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          margin: 0,
          marginBottom: 13,
        }}
      >
        <i
          style={{
            fontStyle: 'normal',
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--nm-blue)',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        {title}
      </h5>
      {children}
    </div>
  );
}
