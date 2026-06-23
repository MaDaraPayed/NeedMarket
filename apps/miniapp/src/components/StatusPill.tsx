import type { ReactNode } from 'react';
import type { LotStatus, ResponseStatus } from '@needmarket/shared';

export type PillTone = 'green' | 'amber' | 'info' | 'neutral' | 'red';

const toneStyle: Record<PillTone, { color: string; background: string }> = {
  green:   { color: 'var(--nm-green)',   background: 'var(--nm-green-bg)' },
  amber:   { color: 'var(--nm-amber)',   background: 'var(--nm-amber-bg)' },
  info:    { color: 'var(--nm-info)',    background: 'var(--nm-info-bg)' },
  neutral: { color: 'var(--nm-neutral)', background: 'var(--nm-neutral-bg)' },
  red:     { color: 'var(--nm-red)',     background: 'var(--nm-red-bg)' },
};

export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  const { color, background } = toneStyle[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 11.5,
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: 'var(--nm-r-badge)',
        color,
        background,
      }}
    >
      {children}
    </span>
  );
}

export function responseStatusToPill(status: ResponseStatus): { tone: PillTone; label: string } {
  switch (status) {
    case 'accepted': return { tone: 'green',   label: 'Принят' };
    case 'rejected': return { tone: 'neutral',  label: 'Отклонён' };
    case 'disputed': return { tone: 'amber',   label: 'Оспорен' };
    default:         return { tone: 'info',    label: 'На рассмотрении' };
  }
}

export function lotStatusToPill(status: LotStatus): { tone: PillTone; label: string } {
  switch (status) {
    case 'active':           return { tone: 'info',    label: 'Активен' };
    case 'in_progress':      return { tone: 'green',   label: 'В работе' };
    case 'awaiting_payment': return { tone: 'amber',   label: 'Ждёт оплаты' };
    case 'awaiting_decision': return { tone: 'amber',   label: 'Ожидание' };
    case 'awaiting_payout':  return { tone: 'info',    label: 'К выплате' };
    case 'completed':        return { tone: 'neutral',  label: 'Завершён' };
    case 'disputed':         return { tone: 'red',     label: 'Спор' };
    default:                 return { tone: 'neutral',  label: status };
  }
}
