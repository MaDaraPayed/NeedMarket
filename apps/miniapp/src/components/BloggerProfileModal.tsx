import { useState } from 'react';
import { Avatar, Button, Modal, Title } from '@telegram-apps/telegram-ui';
import { Star } from 'lucide-react';
import { resolveMediaUrl, type ResponseBloggerBrief } from '../api';
import { ReviewsModal } from './ReviewsModal';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

function RatingChip({
  ratingAvg,
  ratingCount,
  onClick,
}: {
  ratingAvg?: number | null;
  ratingCount?: number;
  onClick: () => void;
}) {
  if (ratingCount === 0 || ratingCount == null) {
    return (
      <button onClick={onClick} style={chipStyle(false)}>
        нет отзывов
      </button>
    );
  }
  return (
    <button onClick={onClick} style={chipStyle(true)}>
      <Star size={13} fill="#FFD700" color="#FFD700" strokeWidth={0} />
      {ratingAvg?.toFixed(1)} ({ratingCount})
    </button>
  );
}

function chipStyle(hasRating: boolean): React.CSSProperties {
  return {
    background: 'none',
    border: '1px solid var(--nm-line)',
    borderRadius: 8,
    padding: '2px 8px',
    cursor: 'pointer',
    fontSize: 13,
    color: hasRating ? 'var(--nm-ink)' : 'var(--nm-ink-2)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  };
}

export function BloggerProfileModal({
  blogger,
  token,
  open,
  onClose,
}: {
  blogger: ResponseBloggerBrief | null;
  token: string;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);

  if (!blogger) return null;

  const avatar = blogger.avatarUrl ? resolveMediaUrl(blogger.avatarUrl) : undefined;
  const hasContact = !!(blogger.telegramUsername || blogger.contact);

  function handleContact() {
    if (blogger!.telegramUsername) {
      const handle = blogger!.telegramUsername.startsWith('@')
        ? blogger!.telegramUsername.slice(1)
        : blogger!.telegramUsername;
      (window as any).Telegram?.WebApp?.openTelegramLink?.(`https://t.me/${handle}`);
    } else if (blogger!.contact) {
      navigator.clipboard?.writeText(blogger!.contact).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <>
      <Modal
        header={<Modal.Header />}
        open={open}
        onOpenChange={(o) => { if (!o) onClose(); }}
      >
        <div style={{ padding: '0 24px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <Avatar size={96} acronym={initials(blogger.displayName)} src={avatar} />
            <div>
              <Title level="3" weight="2" style={{ margin: 0 }}>{blogger.displayName}</Title>
              {blogger.city && (
                <div style={{ fontSize: 13, color: 'var(--nm-ink-2)' }}>{blogger.city}</div>
              )}
              <div style={{ marginTop: 6 }}>
                <RatingChip
                  ratingAvg={blogger.ratingAvg}
                  ratingCount={blogger.ratingCount}
                  onClick={() => setReviewsOpen(true)}
                />
              </div>
            </div>
          </div>

          {blogger.categories.length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginBottom: 8 }}>
              {blogger.categories.join(' · ')}
            </div>
          )}

          {blogger.bio && (
            <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 12 }}>{blogger.bio}</div>
          )}

          {blogger.linkedAccounts.length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginBottom: 16 }}>
              {blogger.linkedAccounts
                .map((a) => `${a.platform}${a.followers ? ` · ${(a.followers / 1000).toFixed(0)}K` : ''}`)
                .join('  ·  ')}
            </div>
          )}

          <Button
            size="l"
            stretched
            mode={hasContact ? 'filled' : 'bezeled'}
            disabled={!hasContact}
            onClick={handleContact}
          >
            {copied ? 'Скопировано' : 'Связаться с блогером'}
          </Button>
          {!hasContact && (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--nm-ink-2)', marginTop: 6 }}>
              контакт не указан
            </div>
          )}
        </div>
      </Modal>

      <ReviewsModal
        token={token}
        userId={blogger.userId}
        open={reviewsOpen}
        onClose={() => setReviewsOpen(false)}
      />
    </>
  );
}
