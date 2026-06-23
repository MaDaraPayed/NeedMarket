import { useEffect, useState } from 'react';
import { Modal, Spinner, Placeholder } from '@telegram-apps/telegram-ui';
import { Star, AlertTriangle } from 'lucide-react';
import { fetchProfileReviews, type ReviewDto } from '../api';

function StarRating({ value }: { value: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={13}
          fill={i < value ? '#FFD700' : 'none'}
          color={i < value ? '#FFD700' : 'var(--nm-line)'}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ReviewsModal({
  token,
  userId,
  open,
  onClose,
}: {
  token: string;
  userId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [reviews, setReviews] = useState<ReviewDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setReviews(null);
    setError(null);
    fetchProfileReviews(token, userId)
      .then((r) => { if (!cancelled) setReviews(r); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [open, userId, token]);

  return (
    <Modal
      header={<Modal.Header />}
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
    >
      <div style={{ padding: '0 20px 32px' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--nm-ink)', marginBottom: 16 }}>Отзывы</div>

        {error && (
          <Placeholder description={error}>
            <AlertTriangle size={32} color="var(--nm-amber)" />
          </Placeholder>
        )}

        {!error && reviews === null && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spinner size="m" />
          </div>
        )}

        {reviews !== null && reviews.length === 0 && (
          <div style={{ color: 'var(--nm-ink-2)', textAlign: 'center', padding: 16 }}>
            Отзывов пока нет
          </div>
        )}

        {reviews !== null && reviews.map((r) => (
          <div
            key={r.id}
            style={{
              borderBottom: '1px solid var(--nm-line)',
              paddingBottom: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{r.authorName}</span>
              <StarRating value={r.rating} />
            </div>
            {r.comment && (
              <div style={{ fontSize: 13, color: 'var(--nm-ink)', marginBottom: 4, lineHeight: 1.4 }}>
                {r.comment}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--nm-ink-2)' }}>{formatDate(r.createdAt)}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
