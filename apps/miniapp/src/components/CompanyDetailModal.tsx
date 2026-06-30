import { useState } from 'react';
import { Modal } from '@telegram-apps/telegram-ui';
import { Copy } from 'lucide-react';
import { resolveMediaUrl, type AdminUserCardDto } from '../api';
import { Button } from './Button';

function formatDateRU(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

function UserAvatar({ name, avatarUrl, size = 44 }: { name: string; avatarUrl: string | null; size?: number }) {
  const src = avatarUrl ? resolveMediaUrl(avatarUrl) : undefined;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--nm-grad)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize: Math.round(size * 0.32),
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  );
}

function openTelegramUser(username: string) {
  const handle = username.replace(/^@/, '');
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Telegram?.WebApp?.openTelegramLink?.(`https://t.me/${handle}`);
  } catch {
    window.open(`https://t.me/${handle}`, '_blank', 'noopener');
  }
}

export function CompanyDetailModal({
  card,
  open,
  onClose,
}: {
  card: AdminUserCardDto;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!card.contact) return;
    void navigator.clipboard.writeText(card.contact).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal
      header={<Modal.Header />}
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
    >
      <div style={{ padding: '0 24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <UserAvatar name={card.name} avatarUrl={card.avatarUrl} size={72} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--nm-ink)' }}>{card.name}</div>
            {card.city && (
              <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginTop: 2 }}>{card.city}</div>
            )}
          </div>
        </div>

        <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginBottom: 14 }}>
          Зарегистрирован {formatDateRU(card.createdAt)}
        </div>

        {card.contact && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 'var(--nm-r-field)',
              background: 'var(--nm-surface-2)',
              border: '1px solid var(--nm-line)',
              marginBottom: 14,
            }}
          >
            <span style={{ flex: 1, fontSize: 14, color: 'var(--nm-ink)', fontWeight: 500 }}>
              {card.contact}
            </span>
            <button
              onClick={handleCopy}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: 'var(--nm-ink-3)',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
              aria-label="Скопировать контакт"
            >
              <Copy size={14} />
            </button>
            {copied && (
              <span style={{ fontSize: 11, color: 'var(--nm-ink-3)' }}>скопировано</span>
            )}
          </div>
        )}

        {card.telegramUsername && (
          <Button
            variant="fill"
            style={{ width: '100%' }}
            onClick={() => openTelegramUser(card.telegramUsername!)}
          >
            Написать в Telegram
          </Button>
        )}
        {!card.contact && !card.telegramUsername && (
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--nm-ink-2)' }}>
            Контакт не указан
          </div>
        )}
      </div>
    </Modal>
  );
}
