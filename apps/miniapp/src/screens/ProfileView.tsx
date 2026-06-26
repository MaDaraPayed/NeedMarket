import type { ReactNode } from 'react';
import { useState } from 'react';
import { Switch } from '@telegram-apps/telegram-ui';
import { Copy } from 'lucide-react';
import {
  resolveMediaUrl,
  patchSettings,
  type ApiUser,
  type BloggerProfile,
  type CompanyProfile,
} from '../api';
import { Button } from '../components/Button';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

// ── Карточка-обёртка ────────────────────────────────────────────────────────

function InfoCard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--nm-surface)',
        border: '1px solid var(--nm-line)',
        borderRadius: 'var(--nm-r-card)',
        overflow: 'hidden',
        boxShadow: 'var(--nm-sh-card)',
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        fontWeight: 700,
        color: 'var(--nm-ink-2)',
        letterSpacing: '.4px',
        textTransform: 'uppercase',
        padding: '9px 14px',
        borderBottom: '1px solid var(--nm-line)',
      }}
    >
      {title}
    </div>
  );
}

function InfoRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  const empty = !value || value === '—';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
        padding: '9px 14px',
        borderBottom: last ? 'none' : '1px solid var(--nm-line)',
      }}
    >
      <span style={{ fontSize: 12.5, color: 'var(--nm-ink-2)', flexShrink: 0 }}>{label}</span>
      <span
        style={{
          fontSize: 13.5,
          fontWeight: 500,
          color: empty ? 'var(--nm-ink-3)' : 'var(--nm-ink)',
          textAlign: 'right',
          wordBreak: 'break-word',
        }}
      >
        {empty ? '—' : value}
      </span>
    </div>
  );
}

// ── Детали блогера ───────────────────────────────────────────────────────────

function BloggerDetails({ profile }: { profile: BloggerProfile }) {
  return (
    <>
      <InfoCard>
        <CardHeader title="О себе" />
        <InfoRow label="Bio" value={profile.bio ?? ''} />
        <InfoRow label="Город" value={profile.city ?? ''} last />
      </InfoCard>

      {profile.categories.length > 0 && (
        <InfoCard>
          <CardHeader title="Категории" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px' }}>
            {profile.categories.map((c) => (
              <span
                key={c}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 'var(--nm-r-badge)',
                  background: 'var(--nm-blue-soft)',
                  color: 'var(--nm-blue)',
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </InfoCard>
      )}

      {profile.linkedAccounts.length > 0 && (
        <InfoCard>
          <CardHeader title="Аккаунты" />
          {profile.linkedAccounts.map((a, i) => (
            <div
              key={i}
              style={{
                padding: '9px 14px',
                borderBottom:
                  i < profile.linkedAccounts.length - 1 ? '1px solid var(--nm-line)' : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--nm-ink)' }}>
                  {a.platform}
                </span>
                {a.followers != null && (
                  <span style={{ fontSize: 12, color: 'var(--nm-ink-2)' }}>
                    {a.followers.toLocaleString('ru-RU')} подписчиков
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--nm-blue)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {a.url}
              </div>
            </div>
          ))}
        </InfoCard>
      )}
    </>
  );
}

// ── Детали компании ──────────────────────────────────────────────────────────

function CompanyDetails({ profile }: { profile: CompanyProfile }) {
  return (
    <InfoCard>
      <CardHeader title="О рекламодателе" />
      <InfoRow label="Сфера" value={profile.sphere ?? ''} />
      <InfoRow label="Город" value={profile.city ?? ''} />
      <InfoRow label="Контакт" value={profile.contact ?? ''} last />
    </InfoCard>
  );
}

// ── Главный компонент ────────────────────────────────────────────────────────

export function ProfileView({
  user,
  token,
  onEdit,
  onUserUpdated,
  onBack,
}: {
  user: ApiUser;
  token: string;
  onEdit: () => void;
  onUserUpdated: (user: ApiUser) => void;
  onBack?: () => void;
}) {
  const isBlogger = user.role === 'blogger';
  const title = isBlogger
    ? (user.profile as BloggerProfile).displayName
    : (user.profile as CompanyProfile).name;
  const mediaUrl = isBlogger
    ? (user.profile as BloggerProfile).avatarUrl
    : (user.profile as CompanyProfile).logoUrl;

  const [notifEnabled, setNotifEnabled] = useState(user.notificationsEnabled);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);

  async function handleNotifToggle() {
    const next = !notifEnabled;
    setNotifEnabled(next);
    setNotifSaving(true);
    setNotifError(null);
    try {
      const updated = await patchSettings(token, { notificationsEnabled: next });
      onUserUpdated(updated);
    } catch (e) {
      setNotifEnabled(!next);
      setNotifError((e as Error).message);
    } finally {
      setNotifSaving(false);
    }
  }

  const displaySrc = mediaUrl ? resolveMediaUrl(mediaUrl) : null;
  const contact = isBlogger
    ? (user.profile as BloggerProfile).contact
    : (user.profile as CompanyProfile).contact;

  return (
    <div style={{ padding: 16, paddingBottom: 32 }}>
      {/* Шапка профиля */}
      <InfoCard>
        <div style={{ padding: '16px 14px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Аватар / инициалы */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: isBlogger ? '50%' : 'var(--nm-r-tile)',
              flexShrink: 0,
              overflow: 'hidden',
              background: displaySrc
                ? undefined
                : 'linear-gradient(135deg, var(--nm-ava-a), var(--nm-ava-b))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {displaySrc ? (
              <img
                src={displaySrc}
                alt={title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 20 }}>
                {initials(title)}
              </span>
            )}
          </div>

          {/* Имя + роль + username */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 18,
                color: 'var(--nm-ink)',
                letterSpacing: '-.3px',
                lineHeight: 1.2,
                marginBottom: 3,
              }}
            >
              {title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--nm-ink-2)' }}>
              {isBlogger ? 'Блогер' : 'Рекламодатель'}
            </div>

            {user.username && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 4,
                  fontSize: 12,
                  color: 'var(--nm-blue)',
                  cursor: 'pointer',
                }}
                onClick={() => void navigator.clipboard.writeText(`@${user.username!}`)}
              >
                @{user.username}
                <Copy size={12} />
              </div>
            )}
          </div>
        </div>

        {contact && (
          <div
            style={{
              padding: '8px 14px 10px',
              borderTop: '1px solid var(--nm-line)',
              fontSize: 12.5,
              color: 'var(--nm-ink-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ color: 'var(--nm-ink-3)' }}>Контакт:</span>
            <span
              style={{ color: 'var(--nm-ink)', fontWeight: 500, wordBreak: 'break-all' }}
            >
              {contact}
            </span>
          </div>
        )}
      </InfoCard>

      {/* Блоки данных */}
      {isBlogger ? (
        <BloggerDetails profile={user.profile as BloggerProfile} />
      ) : (
        <CompanyDetails profile={user.profile as CompanyProfile} />
      )}

      {/* Секция настроек */}
      <InfoCard>
        <CardHeader title="Настройки" />
        <div
          style={{
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--nm-ink)', marginBottom: 3 }}>
              Уведомления
            </div>
            <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', lineHeight: 1.4 }}>
              Получать уведомления в Telegram о статусе лотов и откликов
            </div>
          </div>
          <Switch checked={notifEnabled} onChange={handleNotifToggle} disabled={notifSaving} />
        </div>
      </InfoCard>

      {notifError && (
        <div style={{ color: 'var(--nm-red)', fontSize: 13, marginTop: -4, marginBottom: 8, paddingLeft: 4 }}>
          {notifError}
        </div>
      )}

      {/* Действия */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        <Button variant="fill" style={{ width: '100%' }} onClick={onEdit}>
          Редактировать
        </Button>
        {onBack && (
          <Button variant="ghost" style={{ width: '100%' }} onClick={onBack}>
            Назад
          </Button>
        )}
      </div>
    </div>
  );
}
