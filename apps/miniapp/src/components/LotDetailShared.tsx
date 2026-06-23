import { type ReactNode } from 'react';
import { FileText, ExternalLink } from 'lucide-react';
import { resolveMediaUrl, type LotAttachmentDto } from '../api';

// ── StatusBanner ──────────────────────────────────────────
export type BannerVariant = 'info' | 'amber' | 'green' | 'neutral' | 'red';

const BANNER_COLORS: Record<BannerVariant, { bg: string; color: string; border: string }> = {
  info:    { bg: 'var(--nm-info-bg)',    color: 'var(--nm-info)',    border: 'var(--nm-blue-line)' },
  amber:   { bg: 'var(--nm-amber-bg)',   color: 'var(--nm-amber)',   border: 'var(--nm-amber)' },
  green:   { bg: 'var(--nm-green-bg)',   color: 'var(--nm-green)',   border: 'var(--nm-green)' },
  neutral: { bg: 'var(--nm-neutral-bg)', color: 'var(--nm-neutral)', border: 'var(--nm-line)' },
  red:     { bg: 'var(--nm-red-bg)',     color: 'var(--nm-red)',     border: 'var(--nm-red)' },
};

export function StatusBanner({
  variant,
  icon,
  children,
}: {
  variant: BannerVariant;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const c = BANNER_COLORS[variant];
  return (
    <div
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 12,
        fontSize: 14,
        color: c.color,
        fontWeight: 500,
        lineHeight: 1.45,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      {icon && <span style={{ flexShrink: 0, marginTop: 1 }}>{icon}</span>}
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}

// ── InfoSection ───────────────────────────────────────────
interface InfoSectionRow {
  label: string;
  value: string;
}

export function InfoSection({
  title,
  rows,
  children,
}: {
  title: string;
  rows?: InfoSectionRow[];
  children?: ReactNode;
}) {
  return (
    <div style={{ marginTop: 20 }}>
      <h5
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: 'var(--nm-ink)',
          letterSpacing: '-0.1px',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          margin: '0 0 10px 0',
        }}
      >
        <i
          style={{
            fontStyle: 'normal',
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--nm-blue)',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        {title}
      </h5>
      <div
        style={{
          background: 'var(--nm-surface)',
          borderRadius: 'var(--nm-r-card)',
          border: '1px solid var(--nm-line)',
          padding: '14px 15px',
        }}
      >
        {rows &&
          rows.map((row, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                paddingBottom: i < rows.length - 1 ? 10 : 0,
                marginBottom: i < rows.length - 1 ? 10 : 0,
                borderBottom: i < rows.length - 1 ? '1px solid var(--nm-line)' : 'none',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--nm-ink-2)', fontWeight: 500, flexShrink: 0 }}>
                {row.label}
              </span>
              <span style={{ fontSize: 13, color: 'var(--nm-ink)', fontWeight: 600, textAlign: 'right' }}>
                {row.value}
              </span>
            </div>
          ))}
        {children}
      </div>
    </div>
  );
}

// ── AttachmentList ────────────────────────────────────────
export function AttachmentList({ attachments }: { attachments: LotAttachmentDto[] }) {
  if (attachments.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {attachments.map((att) => {
        const url = resolveMediaUrl(att.downloadUrl);
        const name = att.fileName ?? (att.contentType.startsWith('image/') ? 'изображение' : 'файл');
        return (
          <a
            key={att.id}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: 'var(--nm-surface-2)',
              borderRadius: 'var(--nm-r-field)',
              color: 'var(--nm-ink)',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <FileText size={16} color="var(--nm-blue)" style={{ flexShrink: 0 }} />
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </span>
            <ExternalLink size={14} color="var(--nm-ink-3)" style={{ flexShrink: 0 }} />
          </a>
        );
      })}
    </div>
  );
}
