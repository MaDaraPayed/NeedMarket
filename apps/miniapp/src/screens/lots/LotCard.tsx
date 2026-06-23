import { StatusPill, lotStatusToPill } from '../../components/StatusPill';
import { resolveMediaUrl, type Lot } from '../../api';
import { initials, formatBudget, formatDeadlineShort } from './format';

interface LotCardProps {
  lot: Lot;
  variant: 'blogger' | 'company';
  onClick?: () => void;
}

function slotsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'место';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'места';
  return 'мест';
}

export function LotCard({ lot, variant, onClick }: LotCardProps) {
  const logoUrl = lot.company.logoUrl ? resolveMediaUrl(lot.company.logoUrl) : undefined;
  const slotsLeft = Math.max(0, lot.slotsNeeded - lot.acceptedCount);
  const { tone, label: statusText } = lotStatusToPill(lot.status);

  const subtitle =
    variant === 'blogger'
      ? `${lot.company.name} · ${lot.categories.join(', ')} · ${lot.platforms.join(', ')}`
      : `${lot.categories.join(', ')} · ${lot.platforms.join(', ')}`;

  const avatarRadius = variant === 'blogger' ? '50%' : 'var(--nm-r-tile)';

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        background: 'var(--nm-surface)',
        borderRadius: 'var(--nm-r-card)',
        border: '1px solid var(--nm-line)',
        boxShadow: 'var(--nm-sh-card)',
        padding: '15px 16px',
        cursor: onClick ? 'pointer' : 'default',
        marginBottom: 10,
      }}
    >
      {/* ── Header ─────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 11 }}>
        {/* Avatar-tile */}
        <div
          style={{
            width: 42,
            height: 42,
            flexShrink: 0,
            borderRadius: avatarRadius,
            overflow: 'hidden',
            background: logoUrl
              ? undefined
              : 'linear-gradient(135deg, var(--nm-ava-a), var(--nm-ava-b))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
              {initials(lot.company.name)}
            </span>
          )}
        </div>

        {/* Title + subtitle */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15.5,
              fontWeight: 700,
              color: 'var(--nm-ink)',
              lineHeight: 1.3,
              marginBottom: 3,
            }}
          >
            {lot.title}
            {lot.hasResponded && (
              <span
                style={{ marginLeft: 6, fontSize: 12, color: 'var(--nm-info)', fontWeight: 500 }}
              >
                · Вы откликнулись
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--nm-ink-2)',
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </div>
        </div>

        {/* Right badge */}
        <div style={{ flexShrink: 0 }}>
          {variant === 'blogger' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 11.5,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 'var(--nm-r-badge)',
                background: 'var(--nm-blue-soft)',
                color: 'var(--nm-blue)',
                whiteSpace: 'nowrap',
              }}
            >
              {slotsLeft} {slotsLabel(slotsLeft)}
            </span>
          ) : (
            <StatusPill tone={tone}>{statusText}</StatusPill>
          )}
        </div>
      </div>

      {/* ── Divider ────────────────────────────── */}
      <div style={{ height: 1, background: 'var(--nm-line)', marginBottom: 11 }} />

      {/* ── Footer ─────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        {/* Budget block */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--nm-ink-2)', marginBottom: 2 }}>
            Бюджет
          </div>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: 'var(--nm-ink)', lineHeight: 1 }}>
            {formatBudget(lot.budget)}
          </div>
        </div>

        {/* Meta */}
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--nm-ink-2)', lineHeight: 1.5 }}>
          {variant === 'company' && (
            <div>выбрано {lot.acceptedCount}/{lot.slotsNeeded}</div>
          )}
          <div>до {formatDeadlineShort(lot.deadline)}</div>
        </div>
      </div>
    </div>
  );
}
