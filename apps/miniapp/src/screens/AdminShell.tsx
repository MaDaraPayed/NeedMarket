import { useEffect, useState } from 'react';
import { CreditCard, Wallet, Flag, LifeBuoy, AlertTriangle } from 'lucide-react';
import { Section, Cell, Spinner, Placeholder, Button } from '@telegram-apps/telegram-ui';
import {
  fetchAdminLots,
  fetchAdminDisputes,
  fetchAdminSupportUsers,
  type AdminLotSummary,
  type AdminDisputeDto,
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

type AdminTab = 'payment' | 'payout' | 'disputes' | 'support';

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
  payment:  'Оплаты',
  payout:   'Выплаты',
  disputes: 'Споры',
  support:  'Поддержка',
};

export function AdminShell({
  token,
  user,
  initialSection,
}: {
  token: string;
  user: ApiUser;
  initialSection?: 'payment' | 'payout' | 'disputes' | 'support';
}) {
  const [tab, setTab] = useState<AdminTab>(initialSection ?? 'payment');
  const [openDisputeCount, setOpenDisputeCount] = useState(0);
  const [supportHasUnread, setSupportHasUnread] = useState(false);
  const [supportNested, setSupportNested] = useState(false);

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
  }

  const adminItems = [
    { key: 'payment',  label: 'Оплаты',    icon: <CreditCard size={24} />, active: tab === 'payment' },
    { key: 'payout',   label: 'Выплаты',   icon: <Wallet size={24} />,     active: tab === 'payout' },
    {
      key: 'disputes', label: 'Споры',
      icon: <Flag size={24} />, active: tab === 'disputes',
      badge: openDisputeCount > 0 ? openDisputeCount : undefined,
    },
    {
      key: 'support',  label: 'Поддержка',
      icon: <LifeBuoy size={24} />, active: tab === 'support',
      dot: supportHasUnread,
    },
  ];

  const isNested = tab === 'support' && supportNested;

  function renderContent() {
    if (tab === 'payment')  return <AdminPaymentSection token={token} />;
    if (tab === 'payout')   return <AdminPayoutSection token={token} />;
    if (tab === 'disputes') {
      return (
        <AdminDisputesSection
          token={token}
          onOpenCountChange={setOpenDisputeCount}
        />
      );
    }
    return <AdminSupportPanel token={token} onNestedChange={setSupportNested} />;
  }

  // Support nested (tickets / thread): no chrome, panel fills viewport
  if (isNested) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {renderContent()}
      </div>
    );
  }

  // Root screens: ScreenHeader + content area + BottomTabBar
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <ScreenHeader title={TAB_TITLE[tab]} user={user} />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: tab === 'support' ? 'hidden' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          padding: tab !== 'support' ? '16px 16px 32px' : 0,
        }}
      >
        {renderContent()}
      </div>
      <BottomTabBar items={adminItems} onTabChange={handleTabChange} />
    </div>
  );
}
