import { useEffect, useRef, useState } from 'react';
import { Modal, Placeholder, Spinner } from '@telegram-apps/telegram-ui';
import { AlertTriangle, Copy, Star, Users } from 'lucide-react';
import { fetchAdminUsers, resolveMediaUrl, type AdminUserCardDto, type ResponseBloggerBrief } from '../../api';
import { BLOGGER_TIER_LABELS, type BloggerTier } from '@needmarket/shared';
import { BloggerProfileModal } from '../../components/BloggerProfileModal';
import { SelectChip } from '../../components/SelectChip';
import { Button } from '../../components/Button';

type SortDir = 'date_desc' | 'date_asc';

// ─── утилиты ────────────────────────────────────────────────────────────────

function formatDateRU(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
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

// ─── Аватар / логотип ────────────────────────────────────────────────────────

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

// ─── Тир-бейдж ───────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: BloggerTier }) {
  const styles: Record<BloggerTier, React.CSSProperties> = {
    micro: { border: '1px solid var(--nm-line)', color: 'var(--nm-ink-3)' },
    medium: { border: '1px solid var(--nm-blue-line)', color: 'var(--nm-blue)' },
    large: { border: '1px solid var(--nm-amber)', color: 'var(--nm-amber)' },
  };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: 'var(--nm-r-badge)',
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
        ...styles[tier],
      }}
    >
      {BLOGGER_TIER_LABELS[tier]}
    </span>
  );
}

// ─── Карточка пользователя в списке ─────────────────────────────────────────

function UserCard({ card, onTap }: { card: AdminUserCardDto; onTap: () => void }) {
  return (
    <div
      onClick={onTap}
      style={{
        background: 'var(--nm-surface)',
        borderRadius: 'var(--nm-r-card)',
        padding: 14,
        marginBottom: 10,
        boxShadow: 'var(--nm-sh-card)',
        border: '1px solid var(--nm-line)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <UserAvatar name={card.name} avatarUrl={card.avatarUrl} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--nm-ink)' }}>{card.name}</span>
          {card.role === 'blogger' && card.tier && <TierBadge tier={card.tier} />}
        </div>
        <div style={{ fontSize: 12, color: 'var(--nm-ink-2)' }}>
          зарегистрирован {formatDateRU(card.createdAt)}
        </div>
        {card.role === 'blogger' && card.linkedAccounts.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', marginTop: 1 }}>
            {card.linkedAccounts
              .map((a) => `${a.platform}${a.followers ? ` · ${a.followers >= 1000 ? `${(a.followers / 1000).toFixed(0)}K` : a.followers}` : ''}`)
              .join('  ·  ')}
          </div>
        )}
        {card.role === 'company' && card.contact && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--nm-ink-2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: 1,
            }}
          >
            {card.contact}
          </div>
        )}
      </div>

      {card.role === 'blogger' && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            borderRadius: 'var(--nm-r-badge)',
            border: '1px solid var(--nm-line)',
            fontSize: 12,
            color: card.ratingCount ? 'var(--nm-ink)' : 'var(--nm-ink-3)',
            flexShrink: 0,
          }}
        >
          {card.ratingCount ? (
            <>
              <Star size={12} fill="#FFD700" color="#FFD700" strokeWidth={0} />
              {card.ratingAvg?.toFixed(1)} ({card.ratingCount})
            </>
          ) : (
            'нет отзывов'
          )}
        </div>
      )}
    </div>
  );
}

// ─── Модалка компании ────────────────────────────────────────────────────────

function CompanyDetailModal({
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
        {/* Шапка */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <UserAvatar name={card.name} avatarUrl={card.avatarUrl} size={72} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--nm-ink)' }}>{card.name}</div>
            {card.city && (
              <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginTop: 2 }}>{card.city}</div>
            )}
          </div>
        </div>

        {/* Дата регистрации */}
        <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginBottom: 14 }}>
          Зарегистрирован {formatDateRU(card.createdAt)}
        </div>

        {/* Контакт */}
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

        {/* TG-кнопка */}
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

// ─── Корневой компонент ───────────────────────────────────────────────────────

function toBloggerBrief(card: AdminUserCardDto): ResponseBloggerBrief {
  return {
    id: card.userId,
    userId: card.userId,
    displayName: card.name,
    avatarUrl: card.avatarUrl,
    bio: card.bio,
    city: card.city,
    categories: card.categories,
    linkedAccounts: card.linkedAccounts,
    contact: card.contact,
    telegramUsername: card.telegramUsername,
    ratingAvg: card.ratingAvg,
    ratingCount: card.ratingCount,
    // Расширенная анкета
    tier: card.tier,
    audienceGender: card.audienceGender,
    audienceAge: card.audienceAge,
    audienceGeo: card.audienceGeo,
    audienceLanguage: card.audienceLanguage,
    reachStories: card.reachStories,
    reachReels: card.reachReels,
    reachPosts: card.reachPosts,
    engagementRate: card.engagementRate,
    statsScreenshotUrl: card.statsScreenshotUrl,
    formats: card.formats,
    priceStories: card.priceStories,
    priceStoriesSeries: card.priceStoriesSeries,
    priceReels: card.priceReels,
    pricePost: card.pricePost,
    priceEvent: card.priceEvent,
    priceUgc: card.priceUgc,
    avgPrice3m: card.avgPrice3m,
    brandsWorkedWith: card.brandsWorkedWith,
    bestCaseUrl: card.bestCaseUrl,
    barterAvailable: card.barterAvailable,
    travelAvailable: card.travelAvailable,
    preferredAdvertiserCategories: card.preferredAdvertiserCategories,
    // Приватные поля (присутствуют только в AdminUserCardDto)
    phone: card.phone,
    email: card.email,
    birthDate: card.birthDate,
    termsAcceptedAt: card.termsAcceptedAt,
    marketingOptIn: card.marketingOptIn,
  };
}

export function AdminUsersPanel({
  token,
  role,
}: {
  token: string;
  role: 'blogger' | 'company';
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<SortDir>('date_desc');
  const [users, setUsers] = useState<AdminUserCardDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<AdminUserCardDto | null>(null);

  // Сбрасываем состояние при смене роли
  const prevRoleRef = useRef(role);
  if (prevRoleRef.current !== role) {
    prevRoleRef.current = role;
    setSearch('');
    setDebouncedSearch('');
    setSort('date_desc');
    setUsers(null);
    setError(null);
  }

  // Debounce поиска: 300 мс
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Основной фетч
  useEffect(() => {
    let cancelled = false;
    setUsers(null);
    setError(null);
    fetchAdminUsers(token, {
      role,
      search: debouncedSearch || undefined,
      sort,
    })
      .then((data) => { if (!cancelled) setUsers(data); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [token, role, debouncedSearch, sort]);

  const emptyText =
    debouncedSearch
      ? 'Ничего не найдено'
      : role === 'blogger'
      ? 'Нет зарегистрированных блогеров'
      : 'Нет зарегистрированных компаний';

  return (
    <div>
      {/* Поиск */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={role === 'blogger' ? 'Поиск по имени блогера' : 'Поиск по названию компании'}
        style={{
          width: '100%',
          padding: '10px 14px',
          borderRadius: 'var(--nm-r-field)',
          border: '1px solid var(--nm-line)',
          background: 'var(--nm-surface)',
          color: 'var(--nm-ink)',
          fontSize: 14,
          outline: 'none',
          boxSizing: 'border-box',
          marginBottom: 12,
        }}
      />

      {/* Сортировка */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <SelectChip
          label="Сначала новые"
          selected={sort === 'date_desc'}
          onClick={() => setSort('date_desc')}
        />
        <SelectChip
          label="Сначала старые"
          selected={sort === 'date_asc'}
          onClick={() => setSort('date_asc')}
        />
      </div>

      {/* Состояния */}
      {error && (
        <Placeholder header="Ошибка" description={error}>
          <AlertTriangle size={40} color="var(--nm-amber)" />
        </Placeholder>
      )}

      {!error && !users && (
        <Placeholder description="Загружаем...">
          <Spinner size="l" />
        </Placeholder>
      )}

      {!error && users && users.length === 0 && (
        <Placeholder description={emptyText}>
          <Users size={40} color="var(--nm-ink-3)" />
        </Placeholder>
      )}

      {!error && users && users.length > 0 && (
        <div>
          {users.map((card) => (
            <UserCard key={card.userId} card={card} onTap={() => setSelectedCard(card)} />
          ))}
        </div>
      )}

      {/* Модалка блогера */}
      <BloggerProfileModal
        blogger={selectedCard?.role === 'blogger' ? toBloggerBrief(selectedCard) : null}
        token={token}
        open={selectedCard?.role === 'blogger'}
        onClose={() => setSelectedCard(null)}
      />

      {/* Модалка компании */}
      {selectedCard?.role === 'company' && (
        <CompanyDetailModal
          card={selectedCard}
          open={true}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}
