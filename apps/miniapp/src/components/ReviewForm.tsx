import { useState } from 'react';
import { Textarea } from '@telegram-apps/telegram-ui';
import { Star } from 'lucide-react';
import { createReview } from '../api';
import { Button } from './Button';

const COMMENT_MAX = 500;

export function ReviewForm({
  token,
  lotId,
  targetId,
  onDone,
}: {
  token: string;
  lotId: string;
  targetId?: string;
  onDone: (rating: number) => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (rating === 0) { setError('Выберите оценку'); return; }
    setLoading(true);
    setError(null);
    try {
      await createReview(token, lotId, rating, comment.trim() || undefined, targetId);
      onDone(rating);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Звёздный пикер */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, justifyContent: 'center' }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            onClick={() => setRating(s)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 4px',
              display: 'inline-flex',
            }}
            aria-label={`${s} звезды`}
          >
            <Star
              size={32}
              fill={s <= rating ? '#FFD700' : 'none'}
              color={s <= rating ? '#FFD700' : 'var(--nm-line)'}
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Textarea
          placeholder="Комментарий (необязательно)"
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
          style={{ width: '100%', minHeight: 72 }}
        />
        <div style={{ fontSize: 11, color: 'var(--nm-ink-2)', textAlign: 'right', marginTop: 2 }}>
          {comment.length}/{COMMENT_MAX}
        </div>
      </div>
      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 13, marginBottom: 8 }}>{error}</div>
      )}
      <Button
        variant="fill"
        style={{ width: '100%', opacity: (loading || rating === 0) ? 0.65 : 1 }}
        disabled={rating === 0 || loading}
        onClick={() => void submit()}
      >
        {loading ? 'Отправляем...' : 'Отправить отзыв'}
      </Button>
    </div>
  );
}
