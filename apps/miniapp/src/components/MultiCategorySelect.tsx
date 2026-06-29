import { useState } from 'react';
import { CATEGORIES } from '@needmarket/shared';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

// Мультивыбор категорий: 2–3 колонки, быстрый поиск, живой счётчик.
// Заголовков групп нет — порядок массива CATEGORIES задаёт кластеры.
export function MultiCategorySelect({ value, onChange }: Props) {
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? CATEGORIES.filter((c) => c.toLowerCase().includes(query.trim().toLowerCase()))
    : CATEGORIES;

  function toggle(c: string) {
    onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  }

  return (
    <div>
      {/* Поиск */}
      <input
        type="search"
        placeholder="Найти категорию..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="nm-field-input"
        style={{ marginBottom: 8 }}
        autoCorrect="off"
        autoCapitalize="none"
      />

      {/* Счётчик выбранных */}
      {value.length > 0 && (
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--nm-blue-strong)',
            fontWeight: 600,
            marginBottom: 8,
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}
        >
          Выбрано ({value.length}): {value.join(', ')}
        </div>
      )}

      {/* Сетка 2–3 колонки */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 6,
        }}
      >
        {filtered.map((c) => {
          const selected = value.includes(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggle(c)}
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
              {/* Чекбокс-индикатор */}
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
              {c}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--nm-ink-3)',
            padding: '12px 0',
            textAlign: 'center',
          }}
        >
          Ничего не найдено
        </div>
      )}
    </div>
  );
}
