import { useState } from 'react';
import { Spinner } from '@telegram-apps/telegram-ui';
import { Building2, Clapperboard, ChevronRight } from 'lucide-react';
import { updateRole, type ApiUser, type Role } from '../api';

const OPTIONS: {
  role: Role;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}[] = [
  {
    role: 'blogger',
    icon: <Clapperboard size={24} color="var(--nm-blue)" />,
    title: 'Я блогер',
    subtitle: 'Откликаюсь на проекты брендов',
  },
  {
    role: 'company',
    icon: <Building2 size={24} color="var(--nm-blue)" />,
    title: 'Я компания',
    subtitle: 'Размещаю проекты и ищу блогеров',
  },
];

export function RoleSelect({ token, onDone }: { token: string; onDone: (user: ApiUser) => void }) {
  const [busy, setBusy] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(role: Role) {
    if (busy) return;
    setBusy(role);
    setError(null);
    try {
      const user = await updateRole(token, role);
      onDone(user);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--nm-ink)', letterSpacing: '-.4px', marginBottom: 4 }}>
          Кто вы на площадке?
        </div>
        <div style={{ fontSize: 14, color: 'var(--nm-ink-2)' }}>
          Роль выбирается один раз — сменить её позже нельзя.
        </div>
      </div>

      {OPTIONS.map((o) => (
        <div
          key={o.role}
          onClick={() => !busy && void choose(o.role)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 16px',
            background: 'var(--nm-surface)',
            border: '1px solid var(--nm-line)',
            borderRadius: 'var(--nm-r-card)',
            boxShadow: 'var(--nm-sh-card)',
            cursor: busy ? 'default' : 'pointer',
            opacity: busy && busy !== o.role ? 0.5 : 1,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              flexShrink: 0,
              borderRadius: 'var(--nm-r-tile)',
              background: 'var(--nm-blue-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {o.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--nm-ink)', marginBottom: 2 }}>{o.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--nm-ink-2)' }}>{o.subtitle}</div>
          </div>
          {busy === o.role ? (
            <Spinner size="s" />
          ) : (
            <ChevronRight size={18} color="var(--nm-ink-3)" />
          )}
        </div>
      ))}

      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 13, paddingTop: 4 }}>
          Не удалось сохранить роль: {error}
        </div>
      )}
    </div>
  );
}
