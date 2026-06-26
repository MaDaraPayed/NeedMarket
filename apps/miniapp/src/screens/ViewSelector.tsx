import { Building2, Clapperboard, Settings2, ChevronRight } from 'lucide-react';
import type { ApiUser } from '../api';

export type AppShell = 'marketplace' | 'admin';

const ROLE_LABELS: Record<string, string> = {
  blogger: 'Блогер',
  company: 'Рекламодатель',
};

function OptionCard({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        background: 'var(--nm-surface)',
        border: '1px solid var(--nm-line)',
        borderRadius: 'var(--nm-r-card)',
        boxShadow: 'var(--nm-sh-card)',
        cursor: 'pointer',
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
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--nm-ink)', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--nm-ink-2)' }}>{subtitle}</div>
      </div>
      <ChevronRight size={18} color="var(--nm-ink-3)" />
    </div>
  );
}

export function ViewSelector({
  user,
  onSelect,
}: {
  user: ApiUser;
  onSelect: (shell: AppShell) => void;
}) {
  const roleLabel = user.role ? (ROLE_LABELS[user.role] ?? user.role) : '';
  const RoleIcon = user.role === 'company' ? Building2 : Clapperboard;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--nm-ink)', letterSpacing: '-.4px', marginBottom: 4 }}>
          Выберите вид
        </div>
        <div style={{ fontSize: 14, color: 'var(--nm-ink-2)' }}>
          Для этого аккаунта доступно несколько режимов работы.
        </div>
      </div>

      <OptionCard
        icon={<RoleIcon size={24} color="var(--nm-blue)" />}
        title={`Войти как ${roleLabel}`}
        subtitle="Маркетплейс блогеров и рекламодателей"
        onClick={() => onSelect('marketplace')}
      />

      <OptionCard
        icon={<Settings2 size={24} color="var(--nm-blue)" />}
        title="Войти как Администрация"
        subtitle="Управление лотами, выплатами, спорами"
        onClick={() => onSelect('admin')}
      />
    </div>
  );
}
