import { useState } from 'react';
import { Avatar, Button, Modal, Title } from '@telegram-apps/telegram-ui';
import { ExternalLink, Star } from 'lucide-react';
import { getPlatformBrand, getIsDark } from '../platformBrand';
import { resolveMediaUrl, type ResponseBloggerBrief } from '../api';
import {
  AUDIENCE_GENDER_LABELS,
  COLLAB_FORMAT_LABELS,
  BLOGGER_TIER_LABELS,
  type CollabFormat,
  type BloggerTier,
  type AudienceGender,
} from '@needmarket/shared';
import { ReviewsModal } from './ReviewsModal';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

function fmtFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtPrice(n: number): string {
  return n.toLocaleString('ru-RU') + ' ₸';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
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

function TierBadge({ tier }: { tier: BloggerTier }) {
  const styles: Record<BloggerTier, React.CSSProperties> = {
    micro: {
      border: '1px solid var(--nm-line)',
      color: 'var(--nm-ink-3)',
    },
    medium: {
      border: '1px solid var(--nm-blue-line)',
      color: 'var(--nm-blue)',
    },
    large: {
      border: '1px solid var(--nm-amber)',
      color: 'var(--nm-amber)',
    },
  };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 7px',
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--nm-ink-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--nm-line)', margin: '14px 0' }} />;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 5 }}>
      <span style={{ color: 'var(--nm-ink-2)', minWidth: 100, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--nm-ink)', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: 'var(--nm-r-tile)',
        border: '1px solid var(--nm-line)',
        background: 'var(--nm-surface-2)',
        minWidth: 68,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--nm-ink)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--nm-ink-2)', marginTop: 2 }}>{label}</div>
    </div>
  );
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

  // Флаги наличия секций
  const hasAudience =
    !!blogger.audienceGender || !!blogger.audienceAge || !!blogger.audienceGeo || !!blogger.audienceLanguage;
  const hasStats =
    blogger.reachStories != null ||
    blogger.reachReels != null ||
    blogger.reachPosts != null ||
    blogger.engagementRate != null ||
    !!blogger.statsScreenshotUrl;
  const hasFormats = (blogger.formats?.length ?? 0) > 0;
  const prices: Array<{ label: string; value: number }> = [
    { label: 'Stories', value: blogger.priceStories ?? 0 },
    { label: 'Серия Stories', value: blogger.priceStoriesSeries ?? 0 },
    { label: 'Reels', value: blogger.priceReels ?? 0 },
    { label: 'Пост', value: blogger.pricePost ?? 0 },
    { label: 'Мероприятие', value: blogger.priceEvent ?? 0 },
    { label: 'UGC', value: blogger.priceUgc ?? 0 },
  ].filter((p) => p.value > 0);
  const hasExperience = !!blogger.brandsWorkedWith || !!blogger.bestCaseUrl;
  const hasExtra =
    blogger.barterAvailable || blogger.travelAvailable || (blogger.preferredAdvertiserCategories?.length ?? 0) > 0;
  const hasPrivate =
    !!blogger.phone || !!blogger.email || !!blogger.birthDate || !!blogger.termsAcceptedAt;

  const screenshotUrl = blogger.statsScreenshotUrl ? resolveMediaUrl(blogger.statsScreenshotUrl) : null;

  return (
    <>
      <Modal
        header={<Modal.Header />}
        open={open}
        onOpenChange={(o) => { if (!o) onClose(); }}
      >
        <div style={{ padding: '0 20px 32px' }}>

          {/* ── Шапка ────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
            <Avatar size={96} acronym={initials(blogger.displayName)} src={avatar} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Title level="3" weight="2" style={{ margin: '0 0 2px' }}>
                {blogger.displayName}
              </Title>
              {blogger.city && (
                <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginBottom: 4 }}>
                  {blogger.city}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {blogger.tier && <TierBadge tier={blogger.tier} />}
                <RatingChip
                  ratingAvg={blogger.ratingAvg}
                  ratingCount={blogger.ratingCount}
                  onClick={() => setReviewsOpen(true)}
                />
              </div>
            </div>
          </div>

          {/* ── Тематика + Описание ───────────────────────────────── */}
          {(blogger.categories.length > 0 || blogger.bio) && (
            <>
              {blogger.categories.length > 0 && (
                <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginBottom: 6 }}>
                  {blogger.categories.join(' · ')}
                </div>
              )}
              {blogger.bio && (
                <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--nm-ink)', marginBottom: 4 }}>
                  {blogger.bio}
                </div>
              )}
              <Divider />
            </>
          )}

          {/* ── Соцсети ──────────────────────────────────────────── */}
          {blogger.linkedAccounts.length > 0 && (
            <>
              <SectionLabel>Соцсети</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 4 }}>
                {blogger.linkedAccounts.map((acc, i) => {
                  const brand = getPlatformBrand(acc.platform);
                  const BrandIcon = brand.Icon;
                  const iconColor = brand.color(getIsDark());
                  const iconEl = (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <BrandIcon size={28} color={iconColor} aria-hidden />
                      {acc.followers != null && (
                        <span style={{ fontSize: 10, color: 'var(--nm-ink-2)' }}>
                          {fmtFollowers(acc.followers)}
                        </span>
                      )}
                    </div>
                  );
                  return acc.url ? (
                    <a
                      key={i}
                      href={acc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={brand.label}
                      title={brand.label}
                      style={{ color: 'inherit', textDecoration: 'none', display: 'flex' }}
                      onClick={(e) => {
                        e.preventDefault();
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (window as any).Telegram?.WebApp?.openLink?.(acc.url);
                      }}
                    >
                      {iconEl}
                    </a>
                  ) : (
                    <div key={i} title={brand.label} aria-label={brand.label}>
                      {iconEl}
                    </div>
                  );
                })}
              </div>
              <Divider />
            </>
          )}

          {/* ── Аудитория ────────────────────────────────────────── */}
          {hasAudience && (
            <>
              <SectionLabel>Аудитория</SectionLabel>
              <div style={{ marginBottom: 4 }}>
                {blogger.audienceGender && (
                  <InfoRow
                    label="Пол"
                    value={AUDIENCE_GENDER_LABELS[blogger.audienceGender as AudienceGender]}
                  />
                )}
                {blogger.audienceAge && <InfoRow label="Возраст" value={blogger.audienceAge} />}
                {blogger.audienceGeo && <InfoRow label="Гео" value={blogger.audienceGeo} />}
                {blogger.audienceLanguage && <InfoRow label="Язык" value={blogger.audienceLanguage} />}
              </div>
              <Divider />
            </>
          )}

          {/* ── Статистика ───────────────────────────────────────── */}
          {hasStats && (
            <>
              <SectionLabel>Статистика</SectionLabel>
              {(blogger.reachStories != null || blogger.reachReels != null || blogger.reachPosts != null) && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {blogger.reachStories != null && (
                    <StatChip label="Stories" value={fmtFollowers(blogger.reachStories)} />
                  )}
                  {blogger.reachReels != null && (
                    <StatChip label="Reels" value={fmtFollowers(blogger.reachReels)} />
                  )}
                  {blogger.reachPosts != null && (
                    <StatChip label="Посты" value={fmtFollowers(blogger.reachPosts)} />
                  )}
                </div>
              )}
              {blogger.engagementRate != null && (
                <InfoRow label="ER" value={`${blogger.engagementRate.toFixed(1)}%`} />
              )}
              {screenshotUrl && (
                <img
                  src={screenshotUrl}
                  alt="Скриншот статистики"
                  style={{
                    width: '100%',
                    borderRadius: 'var(--nm-r-tile)',
                    marginTop: 6,
                    border: '1px solid var(--nm-line)',
                  }}
                />
              )}
              <Divider />
            </>
          )}

          {/* ── Форматы сотрудничества ───────────────────────────── */}
          {hasFormats && (
            <>
              <SectionLabel>Форматы</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                {blogger.formats!.map((f) => (
                  <span
                    key={f}
                    style={{
                      fontSize: 12,
                      padding: '4px 10px',
                      borderRadius: 'var(--nm-r-pill)',
                      border: '1px solid var(--nm-blue-line)',
                      color: 'var(--nm-blue)',
                      background: 'var(--nm-blue-soft)',
                    }}
                  >
                    {COLLAB_FORMAT_LABELS[f as CollabFormat]}
                  </span>
                ))}
              </div>
              <Divider />
            </>
          )}

          {/* ── Прайс ────────────────────────────────────────────── */}
          {prices.length > 0 && (
            <>
              <SectionLabel>Прайс</SectionLabel>
              <div style={{ marginBottom: 4 }}>
                {prices.map((p) => (
                  <InfoRow key={p.label} label={p.label} value={fmtPrice(p.value)} />
                ))}
                {blogger.avgPrice3m != null && blogger.avgPrice3m > 0 && (
                  <InfoRow label="Средний за 3 мес." value={fmtPrice(blogger.avgPrice3m)} />
                )}
              </div>
              <Divider />
            </>
          )}

          {/* ── Опыт ─────────────────────────────────────────────── */}
          {hasExperience && (
            <>
              <SectionLabel>Опыт</SectionLabel>
              {blogger.brandsWorkedWith && (
                <div style={{ fontSize: 13, color: 'var(--nm-ink)', marginBottom: 6, lineHeight: 1.5 }}>
                  {blogger.brandsWorkedWith}
                </div>
              )}
              {blogger.bestCaseUrl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <ExternalLink size={13} color="var(--nm-blue)" />
                  <a
                    href={blogger.bestCaseUrl}
                    style={{ fontSize: 13, color: 'var(--nm-blue)', textDecoration: 'none' }}
                    onClick={(e) => {
                      e.preventDefault();
                      (window as any).Telegram?.WebApp?.openLink?.(blogger!.bestCaseUrl!);
                    }}
                  >
                    Лучший кейс
                  </a>
                </div>
              )}
              <Divider />
            </>
          )}

          {/* ── Дополнительно ────────────────────────────────────── */}
          {hasExtra && (
            <>
              <SectionLabel>Дополнительно</SectionLabel>
              {blogger.barterAvailable && (
                <InfoRow label="Бартер" value="Готов к бартеру" />
              )}
              {blogger.travelAvailable && (
                <InfoRow label="Выезд" value="Готов к выезду" />
              )}
              {(blogger.preferredAdvertiserCategories?.length ?? 0) > 0 && (
                <InfoRow
                  label="Категории"
                  value={blogger.preferredAdvertiserCategories!.join(', ')}
                />
              )}
              <Divider />
            </>
          )}

          {/* ── Приватные данные (только для администратора) ─────── */}
          {hasPrivate && (
            <>
              <div
                style={{
                  background: 'var(--nm-surface-2)',
                  border: '1px solid var(--nm-line)',
                  borderRadius: 'var(--nm-r-tile)',
                  padding: '10px 12px',
                  marginBottom: 14,
                }}
              >
                <SectionLabel>Приватные данные</SectionLabel>
                {blogger.phone && <InfoRow label="Телефон" value={blogger.phone} />}
                {blogger.email && <InfoRow label="Email" value={blogger.email} />}
                {blogger.birthDate && <InfoRow label="Дата рожд." value={fmtDate(blogger.birthDate)} />}
                {blogger.termsAcceptedAt && (
                  <InfoRow label="Условия приняты" value={fmtDate(blogger.termsAcceptedAt)} />
                )}
                {blogger.marketingOptIn != null && (
                  <InfoRow label="Маркетинг" value={blogger.marketingOptIn ? 'Да' : 'Нет'} />
                )}
              </div>
            </>
          )}

          {/* ── Кнопка связи ─────────────────────────────────────── */}
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
