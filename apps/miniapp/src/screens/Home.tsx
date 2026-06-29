import { useState } from 'react';
import type { ApiUser } from '../api';
import { useAuth } from '../AuthProvider';
import { RoleSelect } from './RoleSelect';
import { BloggerOnboardingForm } from './BloggerOnboardingForm';
import { BloggerEditProfile } from './BloggerEditProfile';
import { CompanyForm } from './CompanyForm';
import { Dashboard } from './Dashboard';
import { ViewSelector, type AppShell } from './ViewSelector';
import { AdminShell } from './AdminShell';

type AdminSection = 'payment' | 'payout' | 'disputes' | 'support';

type StartParam =
  | { kind: 'lot'; id: string }
  | { kind: 'admin'; section: AdminSection }
  | { kind: 'support'; ticketId: string }
  | { kind: 'publication'; id: string }
  | null;

function parseStartParam(): StartParam {
  const param = new URLSearchParams(window.location.search).get('startapp');
  if (!param) return null;
  if (param.startsWith('lot_')) return { kind: 'lot', id: param.slice(4) };
  if (param.startsWith('support_')) return { kind: 'support', ticketId: param.slice(8) };
  if (param.startsWith('publication_')) return { kind: 'publication', id: param.slice(12) };
  if (param === 'admin_payment') return { kind: 'admin', section: 'payment' };
  if (param === 'admin_payout') return { kind: 'admin', section: 'payout' };
  if (param === 'admin_dispute') return { kind: 'admin', section: 'disputes' };
  if (param === 'admin_support') return { kind: 'admin', section: 'support' };
  return null;
}

// Экран после авторизации. Решаем, что показать, по role + isAdmin:
//   role == null && !isAdmin    → выбор роли (онбординг)
//   isAdmin && role == null     → сразу admin-вид (чистый админ)
//   role != null && !isAdmin    → сразу marketplace-вид
//   isAdmin && role != null     → ViewSelector (без диплинка) или целевой вид (по диплинку)
export function Home({ user, token }: { user: ApiUser; token: string }) {
  const { setUser } = useAuth();
  const [editing, setEditing] = useState(false);

  const hasMarketplace = user.role !== null;
  const hasAdmin = user.isAdmin;
  const hasMultiple = hasMarketplace && hasAdmin;

  const [startParam] = useState<StartParam>(parseStartParam);

  const [activeShell, setActiveShell] = useState<AppShell>(() => {
    if (hasAdmin && !hasMarketplace) return 'admin';
    if (hasMarketplace && !hasAdmin) return 'marketplace';
    if (startParam?.kind === 'admin') return 'admin';
    if (startParam?.kind === 'lot') return 'marketplace';
    if (startParam?.kind === 'support') return 'marketplace';
    if (startParam?.kind === 'publication') return 'marketplace';
    return 'marketplace';
  });

  // Дуал-кап без диплинка — всегда ViewSelector; переключение через переоткрытие.
  const [showSelector, setShowSelector] = useState(() => {
    if (!hasMultiple) return false;
    return startParam === null;
  });

  function selectShell(shell: AppShell) {
    setActiveShell(shell);
    setShowSelector(false);
  }

  if (!hasMarketplace && !hasAdmin) {
    return <RoleSelect token={token} onDone={setUser} />;
  }

  if (showSelector) {
    return <ViewSelector user={user} onSelect={selectShell} />;
  }

  if (activeShell === 'admin') {
    return (
      <AdminShell
        token={token}
        user={user}
        initialSection={startParam?.kind === 'admin' ? startParam.section : undefined}
      />
    );
  }

  // Первичный онбординг блогера — минимальная анкета (ядро).
  if (user.profile === null && user.role === 'blogger') {
    return (
      <BloggerOnboardingForm
        token={token}
        user={user}
        onSaved={(u) => setUser(u)}
      />
    );
  }

  const needsForm = user.profile === null || editing;
  if (needsForm) {
    const onSaved = (u: ApiUser) => {
      setUser(u);
      setEditing(false);
    };
    if (user.role === 'blogger') {
      return (
        <BloggerEditProfile
          token={token}
          user={user}
          onSaved={onSaved}
          onCancel={user.profile ? () => setEditing(false) : undefined}
        />
      );
    }
    return (
      <CompanyForm
        token={token}
        user={user}
        onSaved={onSaved}
        onUserPatched={setUser}
        onCancel={user.profile ? () => setEditing(false) : undefined}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      token={token}
      onEditProfile={() => setEditing(true)}
      initialLotId={startParam?.kind === 'lot' ? startParam.id : undefined}
      initialTicketId={startParam?.kind === 'support' ? startParam.ticketId : undefined}
      initialPublicationId={startParam?.kind === 'publication' ? startParam.id : undefined}
    />
  );
}
