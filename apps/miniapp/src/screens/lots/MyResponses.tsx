import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Inbox, SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { fetchMyResponses, type LotResponse, type ResponseStatus } from '../../api';
import { SelectChip } from '../../components/SelectChip';
import { StatusPill, lotStatusToPill, responseStatusToPill } from '../../components/StatusPill';
import { Button as NmButton } from '../../components/Button';
import { formatBudget, formatDeadline } from './format';

const RESPONSE_FILTER_OPTIONS: Array<{ value: ResponseStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'pending', label: 'На рассмотрении' },
  { value: 'accepted', label: 'Принят' },
  { value: 'rejected', label: 'Отклонён' },
];

function NmEmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '56px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ color: 'var(--nm-ink-3)', marginBottom: 14 }}>{icon}</div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--nm-ink)',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {description && (
        <div style={{ fontSize: 14, color: 'var(--nm-ink-2)', lineHeight: 1.5 }}>
          {description}
        </div>
      )}
    </div>
  );
}

function ResponseItemCard({
  r,
  onOpen,
}: {
  r: LotResponse;
  onOpen: () => void;
}) {
  const { tone: rTone, label: rLabel } = responseStatusToPill(r.status);
  const lotStatus = r.lot?.status;
  const showLotPill = lotStatus && lotStatus !== 'active';
  const lotPill = showLotPill ? lotStatusToPill(lotStatus) : null;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen();
      }}
      style={{
        background: 'var(--nm-surface)',
        borderRadius: 'var(--nm-r-card)',
        border: '1px solid var(--nm-line)',
        boxShadow: 'var(--nm-sh-card)',
        padding: '14px 16px',
        cursor: 'pointer',
        marginBottom: 10,
      }}
    >
      {/* Шапка: название + статус отклика */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15.5,
              fontWeight: 700,
              color: 'var(--nm-ink)',
              lineHeight: 1.3,
              marginBottom: 3,
            }}
          >
            {r.lot?.title ?? `Лот ${r.lotId.slice(0, 8)}…`}
          </div>
          {r.lot && (
            <div style={{ fontSize: 12.5, color: 'var(--nm-ink-2)' }}>
              {formatBudget(r.lot.budget)} · до {formatDeadline(r.lot.deadline)}
            </div>
          )}
        </div>
        <StatusPill tone={rTone}>{rLabel}</StatusPill>
      </div>

      {/* Разделитель */}
      <div style={{ height: 1, background: 'var(--nm-line)', marginBottom: 8 }} />

      {/* Сообщение + статус лота */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <p
          style={{
            fontSize: 13,
            color: 'var(--nm-ink-2)',
            margin: 0,
            lineHeight: 1.4,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {r.message}
        </p>
        {showLotPill && lotPill && (
          <StatusPill tone={lotPill.tone}>{lotPill.label}</StatusPill>
        )}
      </div>
    </div>
  );
}

// Экран «Мои отклики» для блогера: список откликов с инфой лота из /me/responses.
// Лот приходит сервером (lot.title, lot.status, lot.budget, lot.deadline) —
// отдельный вызов GET /lots больше не нужен.
export function MyResponses({
  token,
  onOpenLot,
  onBack,
}: {
  token: string;
  onOpenLot: (id: string) => void;
  onBack?: () => void;
}) {
  const [responses, setResponses] = useState<LotResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ResponseStatus | 'all'>('all');
  const [hideRejected, setHideRejected] = useState(true);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  useEffect(() => {
    let cancelled = false;
    setResponses(null);
    setError(null);
    fetchMyResponses(token)
      .then((rs) => { if (!cancelled) setResponses(rs); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [token]);

  const countsPerStatus = useMemo<Record<string, number>>(() => {
    if (!responses) return {};
    const counts: Record<string, number> = { all: responses.length };
    for (const r of responses) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts;
  }, [responses]);

  const visibleResponses = useMemo<LotResponse[] | null>(() => {
    if (!responses) return null;
    let result: LotResponse[];
    if (statusFilter !== 'all') {
      result = responses.filter((r) => r.status === statusFilter);
    } else if (hideRejected) {
      result = responses.filter((r) => r.status !== 'rejected');
    } else {
      result = responses;
    }
    return [...result].sort((a, b) => {
      const d = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return sortOrder === 'newest' ? d : -d;
    });
  }, [responses, statusFilter, hideRejected, sortOrder]);

  return (
    <div
      style={{
        padding: '16px 16px 32px',
        background: 'var(--nm-bg)',
        minHeight: '100%',
      }}
    >
      {onBack && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 8,
          }}
        >
          <NmButton variant="ghost" size="sm" onClick={onBack}>
            ← Назад
          </NmButton>
          <h2
            style={{
              fontSize: 19,
              fontWeight: 800,
              color: 'var(--nm-ink)',
              margin: 0,
              letterSpacing: '-0.2px',
            }}
          >
            Мои отклики
          </h2>
        </div>
      )}

      {/* Ошибка загрузки */}
      {error && (
        <NmEmptyState
          icon={<AlertTriangle size={40} color="var(--nm-amber)" />}
          title="Не удалось загрузить"
          description={error}
        />
      )}

      {/* Загрузка */}
      {!error && responses === null && (
        <div
          style={{
            padding: '60px 0',
            textAlign: 'center',
            fontSize: 14,
            color: 'var(--nm-ink-2)',
          }}
        >
          Загружаем отклики…
        </div>
      )}

      {/* Пусто совсем */}
      {!error && responses !== null && responses.length === 0 && (
        <NmEmptyState
          icon={<Inbox size={48} />}
          title="Откликов пока нет"
          description="Откликайтесь на проекты рекламодателей — они появятся здесь."
        />
      )}

      {/* Есть отклики */}
      {!error && responses !== null && responses.length > 0 && (
        <>
          {/* Фильтр по статусу */}
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--nm-ink-2)',
                marginBottom: 8,
              }}
            >
              Статус
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {RESPONSE_FILTER_OPTIONS.map(({ value, label }) => (
                <SelectChip
                  key={value}
                  label={label}
                  count={countsPerStatus[value] ?? 0}
                  selected={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                />
              ))}
            </div>
          </div>

          {/* Дополнительные фильтры */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 14,
            }}
          >
            <SelectChip
              label="Скрыть отклонённые"
              selected={hideRejected}
              onClick={() => setHideRejected((v) => !v)}
            />
            <SelectChip
              label={sortOrder === 'newest' ? '↓ Новые' : '↑ Старые'}
              selected
              onClick={() => setSortOrder((v) => (v === 'newest' ? 'oldest' : 'newest'))}
            />
          </div>

          {/* Пусто по фильтру */}
          {visibleResponses!.length === 0 ? (
            <NmEmptyState
              icon={<SlidersHorizontal size={44} />}
              title="Под этот фильтр ничего нет"
              description="Попробуйте изменить статус или снять «Скрыть отклонённые»."
            />
          ) : (
            <div>
              {visibleResponses!.map((r) => (
                <ResponseItemCard
                  key={r.id}
                  r={r}
                  onOpen={() => onOpenLot(r.lotId)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
