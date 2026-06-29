import { useEffect, useState } from 'react';
import { Spinner, Placeholder } from '@telegram-apps/telegram-ui';
import { AlertTriangle, Megaphone, Star, Image, Video } from 'lucide-react';
import type { PublicationListItemDto } from '../../api';
import { fetchPublications, resolveMediaUrl } from '../../api';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function PublicationCard({
  pub,
  onClick,
}: {
  pub: PublicationListItemDto;
  onClick: () => void;
}) {
  const preview = pub.body.length > 130 ? pub.body.slice(0, 130).replace(/\*+|#+|_+/g, '').trimEnd() + '…' : pub.body.replace(/\*+|#+|_+/g, '');
  const firstImage = pub.attachments.find((a) => a.kind === 'image');
  const hasVideo = pub.attachments.some((a) => a.kind === 'video');

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--nm-surface)',
        borderRadius: 'var(--nm-r-card)',
        marginBottom: 10,
        cursor: 'pointer',
        boxShadow: 'var(--nm-sh-card)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Точка «непрочитано» */}
      {!pub.hasRead && (
        <span
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--nm-blue)',
            zIndex: 1,
            flexShrink: 0,
          }}
        />
      )}

      {/* Превью первого изображения */}
      {firstImage && (
        <img
          src={resolveMediaUrl(`/media/${firstImage.fileId}`)}
          alt=""
          style={{
            width: '100%',
            maxHeight: 160,
            objectFit: 'cover',
            display: 'block',
          }}
        />
      )}

      <div style={{ padding: '12px 14px' }}>
        {pub.title && (
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              color: 'var(--nm-ink)',
              marginBottom: 4,
              paddingRight: pub.hasRead ? 0 : 16,
            }}
          >
            {pub.title}
          </div>
        )}
        <div
          style={{
            fontSize: 13,
            color: 'var(--nm-ink-2)',
            lineHeight: 1.4,
            marginBottom: 8,
          }}
        >
          {preview}
        </div>

        {/* Метаданные */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            fontSize: 11,
            color: 'var(--nm-ink-3)',
          }}
        >
          <span>{formatDate(pub.publishedAt)}</span>

          {firstImage && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Image size={11} />
              Фото
            </span>
          )}
          {hasVideo && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Video size={11} />
              Видео
            </span>
          )}

          {pub.ratingsEnabled && pub.rating.ratingCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Star size={10} fill="#FFD700" color="#FFD700" />
              {pub.rating.avgRating?.toFixed(1)} ({pub.rating.ratingCount})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function PublicationFeed({
  token,
  onOpenPublication,
  onUnreadChange,
}: {
  token: string;
  onOpenPublication: (id: string) => void;
  onUnreadChange?: (count: number) => void;
}) {
  const [publications, setPublications] = useState<PublicationListItemDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPublications(null);
    setError(null);
    fetchPublications(token)
      .then((p) => {
        if (!cancelled) {
          setPublications(p);
          onUnreadChange?.(p.filter((pub) => !pub.hasRead).length);
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <Placeholder header="Не удалось загрузить" description={error}>
          <AlertTriangle size={48} color="var(--nm-amber)" />
        </Placeholder>
      </div>
    );
  }

  if (publications === null) {
    return (
      <div style={{ padding: 24 }}>
        <Placeholder description="Загружаем публикации...">
          <Spinner size="l" />
        </Placeholder>
      </div>
    );
  }

  if (publications.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <Placeholder
          header="Нет публикаций"
          description="Публикации от администраторов появятся здесь."
        >
          <Megaphone size={48} color="var(--nm-ink-3)" />
        </Placeholder>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 32 }}>
      {publications.map((pub) => (
        <PublicationCard
          key={pub.id}
          pub={pub}
          onClick={() => onOpenPublication(pub.id)}
        />
      ))}
    </div>
  );
}
