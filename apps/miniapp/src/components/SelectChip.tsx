import { Check } from 'lucide-react';

// Фильтр-чип мультивыбора. API не изменился — добавлен опциональный count.
export function SelectChip({
  label,
  selected,
  onClick,
  count,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: 'none',
        cursor: 'pointer',
        border: selected ? '1px solid var(--nm-blue)' : '1px solid var(--nm-line)',
        background: selected ? 'var(--nm-blue)' : 'var(--nm-surface)',
        color: selected ? '#fff' : 'var(--nm-ink)',
        borderRadius: 'var(--nm-r-pill)',
        padding: '9px 14px',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.2,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      }}
    >
      {selected && <Check size={14} strokeWidth={2.5} aria-hidden />}
      {label}
      {count !== undefined && (
        <span style={{ color: selected ? 'rgba(255,255,255,.7)' : 'var(--nm-ink-3)' }}>
          {count}
        </span>
      )}
    </button>
  );
}
