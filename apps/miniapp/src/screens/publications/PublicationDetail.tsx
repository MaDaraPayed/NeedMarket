import { useEffect, useState } from 'react';
import { Spinner, Placeholder } from '@telegram-apps/telegram-ui';
import { AlertTriangle, Star, MessageCircle, MessageSquare } from 'lucide-react';
import type {
  PublicationDetailDto,
  PublicationRatingAggregateDto,
  PublicationCommentDto,
  ApiUser,
} from '../../api';
import {
  fetchPublicationDetail,
  ratePublication,
  fetchPublicationComments,
  postPublicationComment,
  deletePublicationComment,
  resolveMediaUrl,
} from '../../api';
import { Button } from '../../components/Button';
import { SafeMarkdown } from '../../components/SafeMarkdown';

// ─── Медиа-галерея ────────────────────────────────────────────────────────────

function MediaGallery({ attachments }: { attachments: PublicationDetailDto['attachments'] }) {
  if (attachments.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
      {attachments.map((att) => {
        const src = resolveMediaUrl(`/media/${att.fileId}`);
        if (att.kind === 'video') {
          return (
            <video
              key={att.id}
              controls
              style={{
                width: '100%',
                borderRadius: 10,
                display: 'block',
                maxHeight: 340,
                background: '#000',
              }}
              preload="metadata"
            >
              <source src={src} type={att.mimeType} />
              <a href={src} download={att.fileName}>
                Скачать видео
              </a>
            </video>
          );
        }
        return (
          <a key={att.id} href={src} target="_blank" rel="noopener noreferrer">
            <img
              src={src}
              alt={att.fileName}
              style={{
                width: '100%',
                borderRadius: 10,
                display: 'block',
                objectFit: 'cover',
              }}
            />
          </a>
        );
      })}
    </div>
  );
}

// ─── Рейтинг-виджет ★ ─────────────────────────────────────────────────────────

function RatingWidget({
  pubId,
  token,
  initialRating,
  onRatingChange,
}: {
  pubId: string;
  token: string;
  initialRating: PublicationRatingAggregateDto;
  onRatingChange: (r: PublicationRatingAggregateDto) => void;
}) {
  const [rating, setRating] = useState(initialRating);
  const [hovered, setHovered] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effective = hovered > 0 ? hovered : (rating.myRating ?? 0);

  async function handlePick(value: number) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await ratePublication(token, pubId, value);
      setRating(updated);
      onRatingChange(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 20,
        padding: '14px 16px',
        background: 'var(--nm-surface)',
        borderRadius: 'var(--nm-r-card)',
        boxShadow: 'var(--nm-sh-card)',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--nm-ink-2)',
          marginBottom: 10,
        }}
      >
        Оценить публикацию
      </div>

      {/* Звёздный пикер */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: rating.ratingCount > 0 ? 10 : 0,
        }}
        onMouseLeave={() => setHovered(0)}
      >
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            onClick={() => void handlePick(s)}
            onMouseEnter={() => setHovered(s)}
            disabled={saving}
            style={{
              background: 'none',
              border: 'none',
              cursor: saving ? 'default' : 'pointer',
              padding: '2px 4px',
              display: 'inline-flex',
              opacity: saving ? 0.6 : 1,
              transition: 'transform 0.1s',
              transform: s === hovered ? 'scale(1.2)' : 'scale(1)',
            }}
            aria-label={`${s} из 5`}
          >
            <Star
              size={30}
              fill={s <= effective ? '#FFD700' : 'none'}
              color={s <= effective ? '#FFD700' : 'var(--nm-line)'}
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>

      {/* Агрегат */}
      {rating.ratingCount > 0 && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--nm-ink-3)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Star size={11} fill="#FFD700" color="#FFD700" />
          {rating.avgRating?.toFixed(1)} · {rating.ratingCount}{' '}
          {rating.ratingCount === 1 ? 'оценка' : rating.ratingCount < 5 ? 'оценки' : 'оценок'}
          {rating.myRating && (
            <span style={{ marginLeft: 6 }}>· Ваша: {rating.myRating} ★</span>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: 'var(--nm-red)', marginTop: 6 }}>{error}</div>
      )}
    </div>
  );
}

// ─── Публичные комментарии (inline секция) ────────────────────────────────────

function CommentsSection({
  pubId,
  token,
  userId,
}: {
  pubId: string;
  token: string;
  userId: string;
}) {
  const [comments, setComments] = useState<PublicationCommentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBody, setNewBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetchPublicationComments(token, pubId)
        .then((c) => { if (!cancelled) setComments(c); })
        .catch(() => {});
    }

    setLoading(true);
    fetchPublicationComments(token, pubId)
      .then((c) => { if (!cancelled) { setComments(c); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });

    const id = setInterval(() => { if (!cancelled) load(); }, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token, pubId]);

  async function submit() {
    const body = newBody.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await postPublicationComment(token, pubId, body);
      setNewBody('');
      const updated = await fetchPublicationComments(token, pubId);
      setComments(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(commentId: string) {
    try {
      await deletePublicationComment(token, pubId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--nm-ink)',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <MessageSquare size={16} />
        Комментарии
        {comments.length > 0 && (
          <span
            style={{
              fontSize: 12,
              color: 'var(--nm-ink-3)',
              fontWeight: 500,
            }}
          >
            ({comments.length})
          </span>
        )}
      </div>

      {loading && (
        <div style={{ padding: '16px 0', textAlign: 'center' }}>
          <Spinner size="s" />
        </div>
      )}

      {!loading && comments.length === 0 && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--nm-ink-3)',
            textAlign: 'center',
            padding: '12px 0',
          }}
        >
          Пока нет комментариев. Будьте первым!
        </div>
      )}

      {comments.map((c) => {
        const isAdminComment = c.author.authorKind === 'admin';
        return (
          <div
            key={c.id}
            style={{
              background: isAdminComment ? 'var(--nm-blue-soft)' : 'var(--nm-surface)',
              borderRadius: 12,
              padding: '10px 12px',
              marginBottom: 8,
              boxShadow: 'var(--nm-sh-card)',
              border: isAdminComment ? '1px solid var(--nm-blue-line)' : undefined,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--nm-ink)' }}>
                  {isAdminComment ? 'Администрация' : (c.author.name || 'Аноним')}
                </span>
                {isAdminComment ? (
                  <span
                    style={{
                      fontSize: 10,
                      background: 'var(--nm-blue)',
                      color: '#fff',
                      borderRadius: 6,
                      padding: '1px 6px',
                      fontWeight: 600,
                    }}
                  >
                    Платформа
                  </span>
                ) : c.author.role ? (
                  <span
                    style={{
                      fontSize: 10,
                      background: 'var(--nm-blue-soft)',
                      color: 'var(--nm-blue)',
                      borderRadius: 6,
                      padding: '1px 6px',
                      fontWeight: 600,
                    }}
                  >
                    {c.author.role === 'blogger' ? 'Блогер' : 'Рекламодатель'}
                  </span>
                ) : null}
              </div>
              {!isAdminComment && c.author.userId === userId && (
                <button
                  onClick={() => void handleDelete(c.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--nm-ink-3)',
                    fontSize: 18,
                    lineHeight: 1,
                    padding: '0 2px',
                  }}
                  aria-label="удалить"
                >
                  ×
                </button>
              )}
            </div>
            <div style={{ fontSize: 14, color: 'var(--nm-ink)', lineHeight: 1.4 }}>{c.body}</div>
            <div style={{ fontSize: 10, color: 'var(--nm-ink-3)', marginTop: 4 }}>
              {new Date(c.createdAt).toLocaleString('ru-RU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        );
      })}

      {error && (
        <div style={{ fontSize: 12, color: 'var(--nm-red)', marginBottom: 8 }}>{error}</div>
      )}

      {/* Форма добавления комментария */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value.slice(0, 4000))}
          placeholder="Написать комментарий..."
          rows={2}
          className="nm-field-input"
          style={{
            flex: 1,
            resize: 'none',
            fontSize: 14,
            lineHeight: 1.4,
            padding: '10px 12px',
            width: 'auto',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (newBody.trim()) void submit();
            }
          }}
        />
        <Button
          variant="fill"
          size="sm"
          disabled={!newBody.trim() || sending}
          onClick={() => void submit()}
          style={{ alignSelf: 'flex-end', opacity: (!newBody.trim() || sending) ? 0.6 : 1 }}
        >
          {sending ? '...' : 'Ответить'}
        </Button>
      </div>
    </div>
  );
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export function PublicationDetail({
  token,
  id,
  user,
  onBack,
  onOpenThread,
}: {
  token: string;
  id: string;
  user: ApiUser;
  onBack: () => void;
  onOpenThread: (pubId: string) => void;
}) {
  const [pub, setPub] = useState<PublicationDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState<PublicationRatingAggregateDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPub(null);
    setError(null);
    fetchPublicationDetail(token, id)
      .then((p) => {
        if (!cancelled) {
          setPub(p);
          setRating(p.rating);
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, id]);

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <Button variant="ghost" size="sm" onClick={onBack} style={{ marginBottom: 16 }}>
          ← Назад
        </Button>
        <Placeholder header="Ошибка загрузки" description={error}>
          <AlertTriangle size={48} color="var(--nm-amber)" />
        </Placeholder>
      </div>
    );
  }

  if (!pub) {
    return (
      <div style={{ padding: 16 }}>
        <Button variant="ghost" size="sm" onClick={onBack} style={{ marginBottom: 16 }}>
          ← Назад
        </Button>
        <Placeholder description="Загружаем...">
          <Spinner size="l" />
        </Placeholder>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 48 }}>
      {/* Кнопка назад */}
      <Button variant="ghost" size="sm" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Назад
      </Button>

      {/* Заголовок */}
      {pub.title && (
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--nm-ink)',
            margin: '0 0 12px',
            lineHeight: 1.3,
          }}
        >
          {pub.title}
        </h1>
      )}

      {/* Дата */}
      <div style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginBottom: 16 }}>
        {new Date(pub.publishedAt).toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </div>

      {/* Форматированный текст */}
      <SafeMarkdown>{pub.body}</SafeMarkdown>

      {/* Медиа: изображения и видео */}
      <MediaGallery attachments={pub.attachments} />

      {/* Виджет рейтинга */}
      {pub.ratingsEnabled && rating && (
        <RatingWidget
          pubId={pub.id}
          token={token}
          initialRating={rating}
          onRatingChange={setRating}
        />
      )}

      {/* Средний рейтинг (только показ, если ratingsEnabled но уже сохранён) */}
      {pub.ratingsEnabled && rating && rating.ratingCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
            color: 'var(--nm-ink-2)',
            marginTop: 8,
            paddingLeft: 4,
          }}
        >
          <Star size={13} fill="#FFD700" color="#FFD700" />
          Средняя оценка: <strong>{rating.avgRating?.toFixed(1)}</strong> из 5
          &nbsp;({rating.ratingCount}{' '}
          {rating.ratingCount === 1 ? 'голос' : rating.ratingCount < 5 ? 'голоса' : 'голосов'})
        </div>
      )}

      {/* Ответы: приватный тред */}
      {pub.replyMode === 'private' && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => onOpenThread(pub.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              background: 'var(--nm-surface)',
              border: '1.5px solid var(--nm-blue-line)',
              borderRadius: 'var(--nm-r-card)',
              padding: '14px 16px',
              cursor: 'pointer',
              color: 'var(--nm-blue)',
              fontWeight: 600,
              fontSize: 14,
              boxShadow: 'var(--nm-sh-card)',
            }}
          >
            <MessageCircle size={18} />
            Написать администратору
          </button>
        </div>
      )}

      {/* Ответы: публичные комментарии */}
      {pub.replyMode === 'public' && (
        <CommentsSection pubId={pub.id} token={token} userId={user.id} />
      )}
    </div>
  );
}
