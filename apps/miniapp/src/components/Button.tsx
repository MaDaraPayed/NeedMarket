import type { ButtonHTMLAttributes } from 'react';

interface NmButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: 'fill' | 'ghost';
  size?: 'sm';
}

export function Button({ variant, size, style: extraStyle, children, ...props }: NmButtonProps) {
  return (
    <button
      type="button"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontWeight: 700,
        fontSize: size === 'sm' ? 12.5 : 14,
        padding: size === 'sm' ? '8px 13px' : '11px 16px',
        borderRadius: size === 'sm' ? 10 : 'var(--nm-r-field)',
        border: '1px solid transparent',
        cursor: 'pointer',
        transition: 'opacity 0.15s',
        ...(variant === 'fill'
          ? { background: 'var(--nm-blue)', color: '#fff', boxShadow: 'var(--nm-sh-btn)' }
          : { background: 'var(--nm-surface)', color: 'var(--nm-blue)', borderColor: 'var(--nm-blue-line)' }),
        ...extraStyle,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
