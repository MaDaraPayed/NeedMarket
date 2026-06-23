import { Bell } from 'lucide-react';
import { resolveMediaUrl, type ApiUser, type BloggerProfile, type CompanyProfile } from '../api';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

function userMedia(user: ApiUser): { name: string; url?: string } {
  if (user.profile) {
    if (user.role === 'blogger') {
      const p = user.profile as BloggerProfile;
      return { name: p.displayName, url: p.avatarUrl ? resolveMediaUrl(p.avatarUrl) : undefined };
    }
    if (user.role === 'company') {
      const p = user.profile as CompanyProfile;
      return { name: p.name, url: p.logoUrl ? resolveMediaUrl(p.logoUrl) : undefined };
    }
  }
  return { name: user.firstName };
}

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  user: ApiUser;
  hasUnread?: boolean;
  onNotifications?: () => void;
  onAvatar?: () => void;
}

export function ScreenHeader({
  title,
  subtitle,
  user,
  hasUnread,
  onNotifications,
  onAvatar,
}: ScreenHeaderProps) {
  const { name, url } = userMedia(user);
  const avi = initials(name);

  return (
    <div
      style={{
        background: 'var(--nm-surface)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--nm-line)',
        flexShrink: 0,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 21,
            fontWeight: 800,
            color: 'var(--nm-ink)',
            letterSpacing: '-.3px',
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12.5, color: 'var(--nm-ink-2)', marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onNotifications}
          style={{
            width: 42,
            height: 42,
            borderRadius: 'var(--nm-r-field)',
            border: '1px solid var(--nm-line)',
            background: 'var(--nm-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            position: 'relative',
            color: 'var(--nm-ink-2)',
          }}
        >
          <Bell size={22} />
          {hasUnread && (
            <span
              style={{
                position: 'absolute',
                top: 9,
                right: 9,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--nm-blue)',
                border: '1.5px solid var(--nm-surface)',
              }}
            />
          )}
        </button>

        <button
          onClick={onAvatar}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            overflow: 'hidden',
            background: url ? undefined : 'linear-gradient(135deg, var(--nm-ava-a), var(--nm-ava-b))',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {url ? (
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{avi}</span>
          )}
        </button>
      </div>
    </div>
  );
}
