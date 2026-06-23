import { useEffect, useState } from 'react';
import { Spinner } from '@telegram-apps/telegram-ui';
import { LifeBuoy } from 'lucide-react';
import { SUPPORT_TICKET_TYPES, SUPPORT_TICKET_STATUSES } from '../../api';
import type { SupportTicketListItemDto } from '../../api';
import { fetchSupportTickets } from '../../api';
import { Button } from '../../components/Button';
import { StatusPill } from '../../components/StatusPill';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин. назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч. назад`;
  const days = Math.floor(hrs / 24);
  return `${days} дн. назад`;
}

function typeLabel(type: SupportTicketListItemDto['type']): string {
  return SUPPORT_TICKET_TYPES.find((t) => t.value === type)?.label ?? type;
}

// Подавляем неиспользуемый импорт — statusLabel нужен для расширения в будущем.
void SUPPORT_TICKET_STATUSES;

function TicketCard({ ticket, onClick }: { ticket: SupportTicketListItemDto; onClick: () => void }) {
  const isClosed = ticket.status === 'closed';
  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 16px',
        borderRadius: 'var(--nm-r-card)',
        background: 'var(--nm-surface)',
        border: '1px solid var(--nm-line)',
        boxShadow: 'var(--nm-sh-card)',
        marginBottom: 10,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {ticket.hasUnread && (
        <span
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--nm-blue)',
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingRight: 20 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 'var(--nm-r-badge)',
            background: 'var(--nm-blue)',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {typeLabel(ticket.type)}
        </span>
        <StatusPill tone={isClosed ? 'neutral' : 'info'}>
          {isClosed ? 'Закрыт' : 'Открыт'}
        </StatusPill>
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--nm-ink)',
          marginBottom: 4,
          paddingRight: 16,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {ticket.subject}
      </div>

      <div style={{ fontSize: 12, color: 'var(--nm-ink-2)' }}>
        {relativeTime(ticket.lastMessageAt)}
      </div>
    </div>
  );
}

export function SupportList({
  token,
  onOpenTicket,
  onCreateTicket,
  onBack,
}: {
  token: string;
  onOpenTicket: (id: string) => void;
  onCreateTicket: () => void;
  onBack?: () => void;
}) {
  const [tickets, setTickets] = useState<SupportTicketListItemDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSupportTickets(token)
      .then((t) => !cancelled && setTickets(t))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div style={{ padding: 16, paddingBottom: 32 }}>
      {onBack && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--nm-ink)', letterSpacing: '-.3px' }}>
            Поддержка
          </div>
          <Button variant="ghost" size="sm" onClick={onBack}>Назад</Button>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <Button variant="fill" onClick={onCreateTicket} style={{ width: '100%' }}>
          + Создать заявку
        </Button>
      </div>

      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
          {error}
        </div>
      )}

      {!error && tickets === null && (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spinner size="l" />
        </div>
      )}

      {!error && tickets !== null && tickets.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
          <LifeBuoy
            size={40}
            style={{ margin: '0 auto 12px', display: 'block', color: 'var(--nm-ink-3)' }}
          />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--nm-ink)', marginBottom: 6 }}>
            Заявок пока нет
          </div>
          <div style={{ fontSize: 13, color: 'var(--nm-ink-2)' }}>
            Создайте первую заявку, если у вас есть вопрос или предложение
          </div>
        </div>
      )}

      {!error && tickets !== null && tickets.length > 0 && (
        <div>
          {tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} onClick={() => onOpenTicket(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
