import { useState } from 'react';
import { Modal } from '@telegram-apps/telegram-ui';
import { ChevronDown, X } from 'lucide-react';

interface Props {
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
}

// Универсальный мультивыбор: компактный триггер → модалка с сеткой → чипы.
export function MultiSelectField({ label, options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function toggle(o: string) {
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  }

  function close() {
    setOpen(false);
    setQuery('');
  }

  const triggerText =
    value.length === 0 ? `Выбрать ${label.toLowerCase()}` : `${label} · ${value.length}`;

  return (
    <div style={{ marginBottom: 15 }}>
      {/* Кнопка-триггер */}
      <div
        className="nm-inp-row"
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}
        style={{ cursor: 'pointer' }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 15,
            color: value.length === 0 ? 'var(--nm-ink-3)' : 'var(--nm-ink)',
            padding: '13px 0',
            userSelect: 'none',
          }}
        >
          {triggerText}
        </span>
        <ChevronDown size={18} color="var(--nm-ink-3)" style={{ flexShrink: 0 }} aria-hidden />
      </div>

      {/* Выбранные чипами */}
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {value.map((item) => (
            <span
              key={item}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px 4px 10px',
                borderRadius: 'var(--nm-r-pill)',
                background: 'var(--nm-blue-soft)',
                border: '1px solid var(--nm-blue-line)',
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--nm-blue-strong)',
              }}
            >
              {item}
              <button
                type="button"
                onClick={() => toggle(item)}
                aria-label={`Убрать ${item}`}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--nm-blue-strong)',
                  display: 'flex',
                  alignItems: 'center',
                  opacity: 0.7,
                  lineHeight: 1,
                }}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Модалка */}
      <Modal
        header={<Modal.Header />}
        open={open}
        onOpenChange={(o) => { if (!o) close(); }}
      >
        <div style={{ padding: '0 16px 32px' }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--nm-ink)',
              marginBottom: 12,
            }}
          >
            {label}
          </div>

          <input
            type="search"
            placeholder={`Найти в ${label.toLowerCase()}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="nm-field-input"
            style={{ marginBottom: 10 }}
            autoCorrect="off"
            autoCapitalize="none"
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 6,
              marginBottom: 16,
            }}
          >
            {filtered.map((o) => {
              const selected = value.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => toggle(o)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 7,
                    padding: '8px 10px',
                    borderRadius: 'var(--nm-r-field)',
                    border: selected
                      ? '1.5px solid var(--nm-blue)'
                      : '1px solid var(--nm-line)',
                    background: selected ? 'var(--nm-blue-soft)' : 'var(--nm-surface)',
                    color: selected ? 'var(--nm-blue-strong)' : 'var(--nm-ink)',
                    fontSize: 13,
                    fontWeight: selected ? 600 : 400,
                    lineHeight: 1.3,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      marginTop: 1,
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      border: selected ? 'none' : '1.5px solid var(--nm-ink-3)',
                      background: selected ? 'var(--nm-blue)' : 'transparent',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {selected && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path
                          d="M1 3L3 5L7 1"
                          stroke="#fff"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  {o}
                </button>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: 'var(--nm-ink-3)',
                padding: '8px 0',
                textAlign: 'center',
              }}
            >
              Ничего не найдено
            </div>
          )}

          <button
            type="button"
            onClick={close}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 'var(--nm-r-field)',
              border: 'none',
              background: 'var(--nm-blue)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {value.length > 0 ? `Готово (${value.length})` : 'Готово'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
