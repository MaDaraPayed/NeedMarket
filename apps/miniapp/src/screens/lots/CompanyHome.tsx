import { useEffect, useMemo, useState } from 'react';
import { Spinner, Placeholder } from '@telegram-apps/telegram-ui';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../components/Button';
import { fetchMyLots, deleteLot, type ApiUser, type Lot, type LotStatus } from '../../api';
import { LotCard } from './LotCard';
import { SelectChip } from '../../components/SelectChip';
import { statusLabel } from './format';

// Кнопка удаления лота с inline-подтверждением. Показывается только у awaiting_payment/active.
function DeleteLotButton({
  token,
  lotId,
  onDeleted,
}: {
  token: string;
  lotId: string;
  onDeleted: (id: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      await deleteLot(token, lotId);
      onDeleted(lotId);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
      setConfirm(false);
    }
  }

  if (!confirm) {
    return (
      <div style={{ padding: '0 0 8px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="ghost"
          size="sm"
          style={{ color: 'var(--nm-red)', borderColor: 'transparent' }}
          onClick={() => setConfirm(true)}
        >
          Удалить
        </Button>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 12px 0' }}>
      <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginBottom: 8, textAlign: 'center' }}>
        Удалить лот? Действие необратимо.
      </div>
      {error && (
        <div style={{ fontSize: 12, color: 'var(--nm-red)', marginBottom: 6, textAlign: 'center' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <Button variant="ghost" size="sm" disabled={loading} onClick={() => setConfirm(false)}>
          Отмена
        </Button>
        <Button
          variant="fill"
          size="sm"
          style={{ background: 'var(--nm-red)', boxShadow: 'none', opacity: loading ? 0.65 : 1 }}
          disabled={loading}
          onClick={() => void handleDelete()}
        >
          {loading ? 'Удаляем...' : 'Удалить'}
        </Button>
      </div>
    </div>
  );
}

const STATUS_FILTER_OPTIONS: Array<{ value: LotStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'awaiting_payment', label: statusLabel('awaiting_payment') },
  { value: 'active', label: statusLabel('active') },
  { value: 'in_progress', label: statusLabel('in_progress') },
  { value: 'awaiting_payout', label: statusLabel('awaiting_payout') },
  { value: 'completed', label: statusLabel('completed') },
];

export function CompanyHome({
  token,
  user,
  onOpenLot,
  refreshKey,
}: {
  token: string;
  user: ApiUser;
  onOpenLot: (id: string) => void;
  refreshKey: number;
}) {
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<LotStatus | 'all'>('all');
  const [hideCompleted, setHideCompleted] = useState(true);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  useEffect(() => {
    let cancelled = false;
    setLots(null);
    setError(null);
    fetchMyLots(token)
      .then((l) => !cancelled && setLots(l))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  const countsPerStatus = useMemo<Record<string, number>>(() => {
    if (!lots) return {};
    const counts: Record<string, number> = { all: lots.length };
    for (const l of lots) {
      counts[l.status] = (counts[l.status] ?? 0) + 1;
    }
    return counts;
  }, [lots]);

  const visibleLots = useMemo<Lot[] | null>(() => {
    if (!lots) return null;
    let result: Lot[];
    if (statusFilter !== 'all') {
      result = lots.filter((l) => l.status === statusFilter);
    } else if (hideCompleted) {
      result = lots.filter((l) => l.status !== 'completed');
    } else {
      result = lots;
    }
    return [...result].sort((a, b) => {
      const d = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return sortOrder === 'newest' ? d : -d;
    });
  }, [lots, statusFilter, hideCompleted, sortOrder]);

  return (
    <div style={{ padding: 16, paddingBottom: 32 }}>
      {error && (
        <Placeholder header="Не удалось загрузить" description={error}>
          <AlertTriangle size={48} color="var(--nm-amber)" />
        </Placeholder>
      )}

      {!error && lots === null && (
        <Placeholder description="Загружаем ваши лоты...">
          <Spinner size="l" />
        </Placeholder>
      )}

      {!error && lots !== null && lots.length === 0 && (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--nm-ink-2)', fontSize: 14 }}>
          <div style={{ fontWeight: 600, color: 'var(--nm-ink)', marginBottom: 6 }}>Пока нет лотов</div>
          Создайте первый лот, {user.firstName} — он появится здесь и в ленте блогеров.
        </div>
      )}

      {!error && lots !== null && lots.length > 0 && (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {STATUS_FILTER_OPTIONS.map(({ value, label }) => (
                <SelectChip
                  key={value}
                  label={`${label} (${countsPerStatus[value] ?? 0})`}
                  selected={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 0' }}>
            <SelectChip
              label="Скрыть завершённые"
              selected={hideCompleted}
              onClick={() => setHideCompleted((v) => !v)}
            />
            <SelectChip
              label={sortOrder === 'newest' ? '↓ Новые' : '↑ Старые'}
              selected
              onClick={() => setSortOrder((v) => (v === 'newest' ? 'oldest' : 'newest'))}
            />
          </div>

          {visibleLots!.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--nm-ink-2)', fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: 'var(--nm-ink)', marginBottom: 4 }}>Под этот фильтр ничего нет</div>
              Попробуйте изменить стадию или снять «Скрыть завершённые».
            </div>
          ) : (
            visibleLots!.map((lot) => (
              <div key={lot.id}>
                <LotCard lot={lot} variant="company" onClick={() => onOpenLot(lot.id)} />
                {(lot.status === 'awaiting_payment' || lot.status === 'active') && (
                  <DeleteLotButton
                    token={token}
                    lotId={lot.id}
                    onDeleted={(id) => setLots((prev) => prev?.filter((l) => l.id !== id) ?? null)}
                  />
                )}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
