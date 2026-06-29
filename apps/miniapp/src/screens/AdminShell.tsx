import { useEffect, useState } from 'react';
import { CreditCard, Wallet, Flag, LifeBuoy, AlertTriangle, Building2, Users, Settings2, Megaphone } from 'lucide-react';
import { Section, Cell, Spinner, Placeholder, Button, Switch } from '@telegram-apps/telegram-ui';
import {
  fetchAdminLots,
  fetchAdminDisputes,
  fetchAdminSupportUsers,
  fetchAdminSettings,
  updateAdminSettings,
  type AdminLotSummary,
  type AdminDisputeDto,
  type PlatformSettingsDto,
} from '../api';
import type { ApiUser } from '../api';
import { BottomTabBar } from '../components/BottomTabBar';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  AwaitingPaymentCard,
  AwaitingPayoutCard,
  DisputeCard,
} from './lots/AdminPanel';
import { AdminSupportPanel } from './support/AdminSupportPanel';
import { AdminUsersPanel } from './lots/AdminUsersPanel';
import { AdminPublicationsPanel } from './publications/AdminPublicationsPanel';

type AdminTab = 'payment' | 'payout' | 'disputes' | 'support' | 'news' | 'companies' | 'bloggers' | 'settings';

// ─── Оплаты ──────────────────────────────────────────────────────────────────

function AdminPaymentSection({ token }: { token: string }) {
  const [lots, setLots] = useState<AdminLotSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLots(null);
    setError(null);
    fetchAdminLots(token, 'awaiting_payment')
      .then((data) => { if (!cancelled) setLots(data); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [token]);

  if (error) {
    return (
      <Placeholder header="Ошибка" description={error}>
        <AlertTriangle size={40} color="var(--nm-amber)" />
      </Placeholder>
    );
  }

  if (!lots) {
    return (
      <Placeholder description="Загружаем...">
        <Spinner size="l" />
      </Placeholder>
    );
  }

  if (lots.length === 0) {
    return (
      <Section>
        <Cell>Нет лотов, ожидающих оплаты</Cell>
      </Section>
    );
  }

  return (
    <div>
      {lots.map((lot) => (
        <AwaitingPaymentCard
          key={lot.id}
          lot={lot}
          token={token}
          onActivated={(id) => setLots((prev) => prev?.filter((l) => l.id !== id) ?? null)}
        />
      ))}
    </div>
  );
}

// ─── Выплаты ─────────────────────────────────────────────────────────────────

function AdminPayoutSection({ token }: { token: string }) {
  const [lots, setLots] = useState<AdminLotSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLots(null);
    setError(null);
    fetchAdminLots(token, 'awaiting_payout')
      .then((data) => { if (!cancelled) setLots(data); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [token]);

  if (error) {
    return (
      <Placeholder header="Ошибка" description={error}>
        <AlertTriangle size={40} color="var(--nm-amber)" />
      </Placeholder>
    );
  }

  if (!lots) {
    return (
      <Placeholder description="Загружаем...">
        <Spinner size="l" />
      </Placeholder>
    );
  }

  if (lots.length === 0) {
    return (
      <Section>
        <Cell>Нет лотов, ожидающих выплаты</Cell>
      </Section>
    );
  }

  return (
    <div>
      {lots.map((lot) => (
        <AwaitingPayoutCard
          key={lot.id}
          lot={lot}
          token={token}
          onClosed={(id) => setLots((prev) => prev?.filter((l) => l.id !== id) ?? null)}
        />
      ))}
    </div>
  );
}

// ─── Споры ───────────────────────────────────────────────────────────────────

function AdminDisputesSection({
  token,
  onOpenCountChange,
}: {
  token: string;
  onOpenCountChange: (count: number) => void;
}) {
  const [disputes, setDisputes] = useState<AdminDisputeDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disputeFilter, setDisputeFilter] = useState<'open' | 'resolved'>('open');

  useEffect(() => {
    let cancelled = false;
    setDisputes(null);
    setError(null);
    fetchAdminDisputes(token, disputeFilter)
      .then((data) => {
        if (cancelled) return;
        setDisputes(data);
        if (disputeFilter === 'open') onOpenCountChange(data.length);
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [token, disputeFilter]);

  if (error) {
    return (
      <Placeholder header="Ошибка" description={error}>
        <AlertTriangle size={40} color="var(--nm-amber)" />
      </Placeholder>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['open', 'resolved'] as const).map((f) => (
          <Button
            key={f}
            size="s"
            mode={disputeFilter === f ? 'filled' : 'bezeled'}
            onClick={() => setDisputeFilter(f)}
          >
            {f === 'open' ? 'Открытые' : 'Разрешённые'}
          </Button>
        ))}
      </div>

      {!disputes ? (
        <Placeholder description="Загружаем...">
          <Spinner size="l" />
        </Placeholder>
      ) : disputes.length === 0 ? (
        <Section>
          <Cell>{disputeFilter === 'open' ? 'Нет открытых споров' : 'Нет разрешённых споров'}</Cell>
        </Section>
      ) : (
        disputes.map((d) => (
          <DisputeCard
            key={d.id}
            dispute={d}
            token={token}
            onResolved={(id) => {
              if (disputeFilter !== 'open') return;
              const next = disputes.filter((x) => x.id !== id);
              setDisputes(next);
              onOpenCountChange(next.length);
            }}
          />
        ))
      )}
    </>
  );
}

// ─── Шелл ────────────────────────────────────────────────────────────────────

const TAB_TITLE: Record<AdminTab, string> = {
  payment:   'Оплаты',
  payout:    'Выплаты',
  disputes:  'Споры',
  support:   'Поддержка',
  news:      'Публикации',
  companies: 'Рекламодатели',
  bloggers:  'Блогеры',
  settings:  'Настройки',
};

export function AdminShell({
  token,
  user,
  initialSection,
}: {
  token: string;
  user: ApiUser;
  initialSection?: 'payment' | 'payout' | 'disputes' | 'support' | 'news' | 'companies' | 'bloggers' | 'settings';
}) {
  const [tab, setTab] = useState<AdminTab>(initialSection ?? 'payment');
  const [openDisputeCount, setOpenDisputeCount] = useState(0);
  const [supportHasUnread, setSupportHasUnread] = useState(false);
  const [supportNested, setSupportNested] = useState(false);
  const [newsNested, setNewsNested] = useState(false);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettingsDto | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Prefetch badge/dot indicators on mount.
  useEffect(() => {
    let cancelled = false;
    fetchAdminDisputes(token, 'open')
      .then((d) => { if (!cancelled) setOpenDisputeCount(d.length); })
      .catch(() => {});
    fetchAdminSupportUsers(token)
      .then((u) => { if (!cancelled) setSupportHasUnread(u.some((x) => x.hasUnread)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  function handleTabChange(key: string) {
    const next = key as AdminTab;
    setTab(next);
    if (next !== 'support') setSupportNested(false);
    if (next !== 'news') setNewsNested(false);
    if (next === 'settings' && platformSettings === null) {
      fetchAdminSettings(token)
        .then(setPlatformSettings)
        .catch(() => {});
    }
  }

  async function handleToggleBudgetFilter(enabled: boolean) {
    if (settingsSaving) return;
    setSettingsSaving(true);
    try {
      const updated = await updateAdminSettings(token, { budgetFilterEnabled: enabled });
      setPlatformSettings(updated);
    } finally {
      setSettingsSaving(false);
    }
  }

  const adminItems = [
    { key: 'payment',   label: 'Оплаты',    icon: <CreditCard size={22} />, active: tab === 'payment' },
    { key: 'payout',    label: 'Выплаты',   icon: <Wallet size={22} />,     active: tab === 'payout' },
    {
      key: 'disputes',  label: 'Споры',
      icon: <Flag size={22} />, active: tab === 'disputes',
      badge: openDisputeCount > 0 ? openDisputeCount : undefined,
    },
    {
      key: 'support',   label: 'Поддержка',
      icon: <LifeBuoy size={22} />, active: tab === 'support',
      dot: supportHasUnread,
    },
    { key: 'news',      label: 'Публикации', icon: <Megaphone size={22} />, active: tab === 'news' },
    { key: 'companies', label: 'Рекламодатели',  icon: <Building2 size={22} />, active: tab === 'companies' },
    { key: 'bloggers',  label: 'Блогеры',   icon: <Users size={22} />,     active: tab === 'bloggers' },
    { key: 'settings',  label: 'Настройки', icon: <Settings2 size={22} />, active: tab === 'settings' },
  ];

  const isNested = (tab === 'support' && supportNested) || (tab === 'news' && newsNested);
  const hasScroll = tab !== 'support' && tab !== 'news';

  function renderContent() {
    if (tab === 'payment')   return <AdminPaymentSection token={token} />;
    if (tab === 'payout')    return <AdminPayoutSection token={token} />;
    if (tab === 'disputes') {
      return (
        <AdminDisputesSection
          token={token}
          onOpenCountChange={setOpenDisputeCount}
        />
      );
    }
    if (tab === 'news') return <AdminPublicationsPanel token={token} onNestedChange={setNewsNested} />;
    if (tab === 'companies') return <AdminUsersPanel token={token} role="company" />;
    if (tab === 'bloggers')  return <AdminUsersPanel token={token} role="blogger" />;
    if (tab === 'settings') {
      if (platformSettings === null) {
        return (
          <Placeholder description="Загружаем...">
            <Spinner size="l" />
          </Placeholder>
        );
      }
      return (
        <div style={{ padding: '0 4px' }}>
          <div
            style={{
              background: 'var(--nm-surface)',
              borderRadius: 'var(--nm-r-card)',
              border: '1px solid var(--nm-line)',
              boxShadow: 'var(--nm-sh-card)',
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--nm-ink)' }}>
                  Фильтр по бюджету в поисках
                </div>
                <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', marginTop: 3 }}>
                  {platformSettings.budgetFilterEnabled
                    ? 'Включён — блогеры видят поле минимального бюджета'
                    : 'Выключен — лоты матчатся без учёта бюджета'}
                </div>
              </div>
              <Switch
                checked={platformSettings.budgetFilterEnabled}
                disabled={settingsSaving}
                onChange={() => void handleToggleBudgetFilter(!platformSettings.budgetFilterEnabled)}
              />
            </div>
          </div>
        </div>
      );
    }
    return <AdminSupportPanel token={token} onNestedChange={setSupportNested} />;
  }

  // Support nested (tickets / thread): no chrome, panel fills viewport
  if (isNested) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'var(--tg-viewport-stable-height, 100dvh)' }}>
        {renderContent()}
      </div>
    );
  }

  // Root screens: ScreenHeader + content area + BottomTabBar
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'var(--tg-viewport-stable-height, 100dvh)' }}>
      <ScreenHeader title={TAB_TITLE[tab]} user={user} />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: (tab === 'support' || tab === 'news') ? 'hidden' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          padding: hasScroll ? '16px 16px 32px' : 0,
        }}
      >
        {renderContent()}
      </div>
      <BottomTabBar items={adminItems} onTabChange={handleTabChange} />
    </div>
  );
}
