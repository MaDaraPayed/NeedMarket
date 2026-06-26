import { useEffect, useRef, useState } from 'react';
import {
  Section,
  Cell,
  Title,
  Spinner,
  Placeholder,
  Modal,
  Textarea,
} from '@telegram-apps/telegram-ui';
import { Copy, CheckCircle, FileText, AlertTriangle } from 'lucide-react';
import {
  fetchAdminLots,
  activateLot,
  closeLot,
  fetchAdminDisputes,
  resolveAdminDispute,
  resolveMediaUrl,
  type AdminLotSummary,
  type AdminBloggerBrief,
  type AdminDisputeDto,
  DISPUTE_REASONS,
  DISPUTE_RESOLUTIONS,
} from '../../api';
import { formatBudget, formatDeadline, initials } from './format';
import { BloggerProfileModal } from '../../components/BloggerProfileModal';
import { isMockEnv } from '../../mockEnv';
import { StatusPill } from '../../components/StatusPill';
import { Button } from '../../components/Button';
import { BreakdownBox } from '../../components/BreakdownBox';

// ─── helpers ─────────────────────────────────────────────────────────────────

function openTelegramUser(username: string) {
  const url = `https://t.me/${username}`;
  if (isMockEnv) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Telegram?.WebApp?.openTelegramLink?.(url);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text).catch(() => {});
}

function AvatarTile({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, flexShrink: 0,
        borderRadius: 'var(--nm-r-tile)',
        background: 'var(--nm-grad)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.32),
      }}
    >
      {initials(name)}
    </div>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
      <span style={{ color: 'var(--nm-ink-2)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--nm-ink)', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  );
}

function PartyRow({
  label, name, username, contact, onContact,
}: {
  label: string;
  name: string;
  username: string | null;
  contact: string | null;
  onContact: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopyContact() {
    if (contact) {
      copyText(contact);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  const canContact = !!(username || contact);
  const displayHandle = username
    ? (username.startsWith('@') ? username : `@${username}`)
    : null;

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--nm-line)', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13 }}>
          <div style={{ fontSize: 11.5, color: 'var(--nm-ink-2)', fontWeight: 600, marginBottom: 2 }}>{label}</div>
          <div style={{ fontWeight: 600, color: 'var(--nm-ink)' }}>{name}</div>
          {displayHandle && (
            <div style={{ fontSize: 12, color: 'var(--nm-ink-2)' }}>{displayHandle}</div>
          )}
          {contact && !username && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--nm-ink-2)' }}>
              <span>{contact}</span>
              <button
                onClick={handleCopyContact}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--nm-ink-3)', display: 'flex', alignItems: 'center' }}
                aria-label="копировать"
              >
                <Copy size={12} />
              </button>
              {copied && <span style={{ fontSize: 11, color: 'var(--nm-ink-3)' }}>скопировано</span>}
            </div>
          )}
        </div>
        {canContact && (
          <Button variant="ghost" size="sm" onClick={onContact}>
            Связаться
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── AwaitingPaymentCard ──────────────────────────────────────────────────────

export function AwaitingPaymentCard({
  lot,
  token,
  onActivated,
}: {
  lot: AdminLotSummary;
  token: string;
  onActivated: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleActivate() {
    setLoading(true);
    setError(null);
    try {
      await activateLot(token, lot.id);
      onActivated(lot.id);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  function handleCopy() {
    copyText(lot.company.contact!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleContact() {
    if (lot.ownerTelegramUsername) {
      openTelegramUser(lot.ownerTelegramUsername);
    } else {
      handleCopy();
    }
  }

  const canContact = !!(lot.ownerTelegramUsername || lot.company.contact);

  return (
    <div
      style={{
        background: 'var(--nm-surface)',
        borderRadius: 'var(--nm-r-card)',
        padding: 16,
        marginBottom: 12,
        boxShadow: 'var(--nm-sh-card)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <AvatarTile name={lot.company.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--nm-ink)', lineHeight: 1.3, marginBottom: 3 }}>
            {lot.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--nm-ink-2)' }}>
            {lot.categories.join(', ')} · {lot.platforms.join(', ')}
          </div>
        </div>
        <StatusPill tone="amber">Ждёт оплаты</StatusPill>
      </div>

      {/* Key / value rows */}
      <KvRow label="Рекламодатель" value={lot.company.name} />
      <KvRow label="Бюджет" value={`${formatBudget(lot.budget)} · до ${formatDeadline(lot.deadline)}`} />
      {lot.company.contact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
          <span style={{ color: 'var(--nm-ink-2)' }}>Контакт</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontWeight: 600, color: 'var(--nm-ink)' }}>{lot.company.contact}</span>
            <button
              onClick={handleCopy}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--nm-ink-3)', display: 'flex', alignItems: 'center' }}
              aria-label="копировать контакт"
            >
              <Copy size={13} />
            </button>
            {copied && <span style={{ fontSize: 11, color: 'var(--nm-ink-3)' }}>скопировано</span>}
          </div>
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--nm-line)', margin: '14px 0 12px' }} />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        {canContact && (
          <Button variant="ghost" style={{ flex: 1 }} onClick={handleContact}>
            Связаться
          </Button>
        )}
        <Button
          variant="fill"
          style={{ flex: 1, opacity: loading ? 0.65 : 1 }}
          onClick={handleActivate}
          disabled={loading}
        >
          {loading ? 'Активация...' : 'Активировать лот'}
        </Button>
      </div>

      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 12, marginTop: 8 }}>{error}</div>
      )}
    </div>
  );
}

// ─── PayoutBloggerRow ─────────────────────────────────────────────────────────

function PayoutBloggerRow({ blogger, token }: { blogger: AdminBloggerBrief; token: string }) {
  const [copied, setCopied] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const avatar = blogger.avatarUrl ? resolveMediaUrl(blogger.avatarUrl) : undefined;

  const handle = blogger.telegramUsername
    ? (blogger.telegramUsername.startsWith('@') ? blogger.telegramUsername : `@${blogger.telegramUsername}`)
    : undefined;

  function handleContact() {
    if (blogger.telegramUsername) {
      const h = blogger.telegramUsername.startsWith('@') ? blogger.telegramUsername.slice(1) : blogger.telegramUsername;
      openTelegramUser(h);
    } else if (blogger.contact) {
      copyText(blogger.contact);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const hasContact = !!(blogger.telegramUsername || blogger.contact);

  return (
    <>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--nm-line)', cursor: 'pointer' }}
        onClick={() => setProfileOpen(true)}
      >
        {avatar ? (
          <img src={avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--nm-grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
            {initials(blogger.displayName)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--nm-ink)' }}>{blogger.displayName}</div>
          <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {blogger.categories.slice(0, 2).join(', ')}
            {handle ? ` · ${handle}` : blogger.city ? ` · ${blogger.city}` : ''}
          </div>
        </div>
        {hasContact && (
          <Button
            variant="ghost" size="sm"
            onClick={(e) => { e.stopPropagation(); handleContact(); }}
          >
            {copied ? 'Скопировано' : 'Связаться'}
          </Button>
        )}
      </div>

      <BloggerProfileModal blogger={blogger} token={token} open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}

// ─── AwaitingPayoutCard ───────────────────────────────────────────────────────

export function AwaitingPayoutCard({
  lot,
  token,
  onClosed,
}: {
  lot: AdminLotSummary;
  token: string;
  onClosed: (id: string) => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClose() {
    setClosing(true);
    setError(null);
    try {
      await closeLot(token, lot.id);
      onClosed(lot.id);
    } catch (e) {
      setError((e as Error).message);
      setClosing(false);
      setShowConfirm(false);
    }
  }

  const commissionPct = lot.budget > 0
    ? Math.round(((lot.commission ?? 0) / lot.budget) * 100)
    : 0;

  return (
    <div
      style={{
        background: 'var(--nm-surface)',
        borderRadius: 'var(--nm-r-card)',
        padding: 16,
        marginBottom: 12,
        boxShadow: 'var(--nm-sh-card)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <AvatarTile name={lot.company.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--nm-ink)', lineHeight: 1.3, marginBottom: 3 }}>
            {lot.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--nm-ink-2)' }}>
            {lot.categories.join(', ')} · {lot.platforms.join(', ')} · до {formatDeadline(lot.deadline)}
          </div>
        </div>
        <StatusPill tone="info">К выплате</StatusPill>
      </div>

      {/* Breakdown */}
      <BreakdownBox
        rows={[
          { label: 'Бюджет рекламодателя', value: formatBudget(lot.budget) },
          { label: `Комиссия ${commissionPct}%`, value: formatBudget(lot.commission ?? 0) },
        ]}
        total={{ label: 'К выплате блогеру', value: formatBudget(lot.payoutPool ?? 0) }}
      />

      {/* Accepted bloggers */}
      {lot.acceptedBloggers && lot.acceptedBloggers.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', fontWeight: 600, marginBottom: 4 }}>
            Принятые блогеры ({lot.acceptedBloggers.length})
          </div>
          {lot.acceptedBloggers.map((b) => (
            <PayoutBloggerRow key={b.id} blogger={b} token={token} />
          ))}
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--nm-line)', margin: '14px 0 12px' }} />

      {/* Action */}
      <Button variant="fill" style={{ width: '100%' }} onClick={() => setShowConfirm(true)}>
        Закрыть лот
      </Button>

      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 12, marginTop: 8 }}>{error}</div>
      )}

      {showConfirm && (
        <Modal
          header={<Modal.Header />}
          open={showConfirm}
          onOpenChange={(open) => { if (!open) setShowConfirm(false); }}
        >
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--nm-ink)', marginBottom: 10 }}>
              Закрыть лот?
            </div>
            <p style={{ color: 'var(--nm-ink-2)', fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
              Лот перейдёт в статус «Завершён». Подтвердите, что выплата проведена.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="ghost"
                style={{ flex: 1 }}
                onClick={() => setShowConfirm(false)}
                disabled={closing}
              >
                Отмена
              </Button>
              <Button
                variant="fill"
                style={{ flex: 1, opacity: closing ? 0.65 : 1 }}
                onClick={handleClose}
                disabled={closing}
              >
                {closing ? 'Закрываем...' : 'Подтвердить'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── DisputeCard ──────────────────────────────────────────────────────────────

function reasonLabel(value: string): string {
  return DISPUTE_REASONS.find((r) => r.value === value)?.label ?? value;
}

export function DisputeCard({
  dispute,
  token,
  onResolved,
}: {
  dispute: AdminDisputeDto;
  token: string;
  onResolved: (id: string) => void;
}) {
  const [note, setNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResolve(resolution: AdminDisputeDto['resolution']) {
    if (!resolution) return;
    setResolving(true);
    setError(null);
    try {
      await resolveAdminDispute(token, dispute.id, resolution, note.trim() || undefined);
      onResolved(dispute.id);
    } catch (e) {
      setError((e as Error).message);
      setResolving(false);
    }
  }

  function handleContact(party: { telegramUsername: string | null; contact: string | null }) {
    if (party.telegramUsername) {
      const handle = party.telegramUsername.startsWith('@') ? party.telegramUsername.slice(1) : party.telegramUsername;
      openTelegramUser(handle);
    } else if (party.contact) {
      copyText(party.contact);
    }
  }

  const raisedByLabel = dispute.raisedByRole === 'company' ? 'Рекламодатель' : 'Блогер';
  const isOpen = dispute.status === 'open';

  return (
    <div
      style={{
        background: 'var(--nm-surface)',
        borderRadius: 'var(--nm-r-card)',
        padding: 16,
        marginBottom: 12,
        boxShadow: 'var(--nm-sh-card)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <AvatarTile name={dispute.lot.title} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--nm-ink)', lineHeight: 1.3, marginBottom: 3 }}>
            {dispute.lot.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--nm-ink-2)' }}>
            Открыт {new Date(dispute.createdAt).toLocaleDateString('ru-RU')}
          </div>
        </div>
        <StatusPill tone={isOpen ? 'red' : 'neutral'}>
          {isOpen ? 'Открыт' : 'Разрешён'}
        </StatusPill>
      </div>

      {/* Breakdown */}
      <BreakdownBox
        rows={[
          { label: 'Бюджет', value: formatBudget(dispute.lot.budget) },
          { label: 'Комиссия', value: formatBudget(dispute.lot.commission) },
        ]}
        total={{ label: 'К выплате', value: formatBudget(dispute.lot.payout) }}
      />

      {/* Initiator badge */}
      <div style={{ margin: '12px 0' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '4px 10px',
            borderRadius: 'var(--nm-r-badge)',
            fontSize: 11.5, fontWeight: 700,
            background: dispute.raisedByRole === 'company' ? 'var(--nm-info-bg)' : 'var(--nm-amber-bg)',
            color: dispute.raisedByRole === 'company' ? 'var(--nm-info)' : 'var(--nm-amber)',
          }}
        >
          Инициатор: {raisedByLabel}
        </span>
      </div>

      {/* Parties */}
      <PartyRow
        label="Рекламодатель"
        name={dispute.company.name}
        username={dispute.company.telegramUsername}
        contact={dispute.company.contact}
        onContact={() => handleContact(dispute.company)}
      />
      <PartyRow
        label="Блогер"
        name={dispute.blogger.displayName}
        username={dispute.blogger.telegramUsername}
        contact={dispute.blogger.contact}
        onContact={() => handleContact(dispute.blogger)}
      />

      {/* Reason + description */}
      <div style={{ fontSize: 13, marginBottom: 6 }}>
        <span style={{ color: 'var(--nm-ink-2)' }}>Причина: </span>
        <span style={{ fontWeight: 600, color: 'var(--nm-ink)' }}>{reasonLabel(dispute.reason)}</span>
      </div>
      <div
        style={{
          fontSize: 13, color: 'var(--nm-ink-2)',
          background: 'var(--nm-surface-2)',
          borderRadius: 'var(--nm-r-field)',
          padding: '9px 12px',
          marginBottom: 12,
          whiteSpace: 'pre-wrap',
          lineHeight: 1.5,
        }}
      >
        {dispute.description}
      </div>

      {/* Attachments — container restyled, rendering preserved */}
      {dispute.attachments.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', fontWeight: 600, marginBottom: 6 }}>Вложения</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {dispute.attachments.map((a, i) => (
              <a
                key={i}
                href={`/media/${a.fileId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px',
                  borderRadius: 'var(--nm-r-field)',
                  background: 'var(--nm-surface-2)',
                  border: '1px solid var(--nm-line)',
                  fontSize: 12, color: 'var(--nm-ink)',
                  textDecoration: 'none',
                }}
              >
                {a.mimeType.startsWith('image/') ? (
                  <img
                    src={`/media/${a.fileId}`}
                    alt={a.fileName}
                    style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }}
                  />
                ) : (
                  <><FileText size={14} color="var(--nm-ink-2)" />{a.fileName}</>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Resolved state */}
      {dispute.status === 'resolved' ? (
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '10px 12px',
            borderRadius: 'var(--nm-r-field)',
            background: 'var(--nm-green-bg)',
            fontSize: 13,
          }}
        >
          <CheckCircle size={16} color="var(--nm-green)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--nm-green)' }}>
              {DISPUTE_RESOLUTIONS.find((r) => r.value === dispute.resolution)?.label ?? dispute.resolution}
            </div>
            {dispute.resolutionNote && (
              <div style={{ color: 'var(--nm-ink-2)', marginTop: 2 }}>{dispute.resolutionNote}</div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Note */}
          <div style={{ marginBottom: 10 }}>
            <Textarea
              placeholder="Заметка (необязательно)"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 1000))}
              style={{ width: '100%', minHeight: 60, fontSize: 13 }}
            />
          </div>

          {/* Resolution buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DISPUTE_RESOLUTIONS.map((r) => (
              <Button
                key={r.value}
                variant={r.value === 'favor_company' ? 'fill' : 'ghost'}
                size="sm"
                style={{ opacity: resolving ? 0.65 : 1 }}
                disabled={resolving}
                onClick={() => void handleResolve(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>

          {error && (
            <div style={{ color: 'var(--nm-red)', fontSize: 12, marginTop: 8 }}>{error}</div>
          )}
        </>
      )}
    </div>
  );
}

// ─── AdminPanel (legacy, preserved for compatibility) ─────────────────────────

export function AdminPanel({
  token,
  onBack,
  backLabel = 'Назад',
  initialSection,
  onOpenSupport,
}: {
  token: string;
  onBack?: () => void;
  backLabel?: string;
  initialSection?: 'payment' | 'payout' | 'disputes';
  onOpenSupport?: () => void;
}) {
  const [awaitingPayment, setAwaitingPayment] = useState<AdminLotSummary[] | null>(null);
  const [awaitingPayout, setAwaitingPayout] = useState<AdminLotSummary[] | null>(null);
  const [disputes, setDisputes] = useState<AdminDisputeDto[] | null>(null);
  const [disputeFilter, setDisputeFilter] = useState<'open' | 'resolved'>('open');
  const [error, setError] = useState<string | null>(null);
  const payoutRef = useRef<HTMLDivElement>(null);
  const disputesRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAdminLots(token, 'awaiting_payment'),
      fetchAdminLots(token, 'awaiting_payout'),
      fetchAdminDisputes(token, disputeFilter),
    ])
      .then(([payment, payout, disp]) => {
        if (cancelled) return;
        setAwaitingPayment(payment);
        setAwaitingPayout(payout);
        setDisputes(disp);
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [token, disputeFilter]);

  useEffect(() => {
    if (scrolledRef.current || awaitingPayment === null || awaitingPayout === null || disputes === null) return;
    if (initialSection === 'disputes' && disputesRef.current) {
      scrolledRef.current = true;
      disputesRef.current.scrollIntoView({ behavior: 'smooth' });
    } else if (initialSection === 'payout' && payoutRef.current) {
      scrolledRef.current = true;
      payoutRef.current.scrollIntoView({ behavior: 'smooth' });
    } else if (initialSection === 'payment') {
      scrolledRef.current = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [initialSection, awaitingPayment, awaitingPayout, disputes]);

  const loading = awaitingPayment === null || awaitingPayout === null || disputes === null;
  const openDisputeCount = disputes?.filter((d) => d.status === 'open').length ?? 0;

  return (
    <div style={{ padding: 16, paddingBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level="2" weight="2" style={{ margin: 0 }}>
          Панель администратора
        </Title>
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>{backLabel}</Button>
        )}
      </div>

      {error && (
        <Placeholder header="Ошибка" description={error}>
          <AlertTriangle size={40} color="var(--nm-amber)" />
        </Placeholder>
      )}

      {!error && loading && (
        <Placeholder description="Загружаем...">
          <Spinner size="l" />
        </Placeholder>
      )}

      {!error && !loading && (
        <>
          <Title level="3" weight="2" style={{ marginBottom: 8 }}>Ожидают оплаты</Title>
          {awaitingPayment!.length === 0 ? (
            <Section style={{ marginBottom: 20 }}>
              <Cell>Нет лотов, ожидающих оплаты</Cell>
            </Section>
          ) : (
            <div style={{ marginBottom: 20 }}>
              {awaitingPayment!.map((lot) => (
                <AwaitingPaymentCard
                  key={lot.id} lot={lot} token={token}
                  onActivated={(id) => setAwaitingPayment((prev) => prev?.filter((l) => l.id !== id) ?? null)}
                />
              ))}
            </div>
          )}

          <div ref={payoutRef}>
            <Title level="3" weight="2" style={{ marginBottom: 8 }}>Ожидают выплаты</Title>
            {awaitingPayout!.length === 0 ? (
              <Section style={{ marginBottom: 20 }}>
                <Cell>Нет лотов, ожидающих выплаты</Cell>
              </Section>
            ) : (
              <div style={{ marginBottom: 20 }}>
                {awaitingPayout!.map((lot) => (
                  <AwaitingPayoutCard
                    key={lot.id} lot={lot} token={token}
                    onClosed={(id) => setAwaitingPayout((prev) => prev?.filter((l) => l.id !== id) ?? null)}
                  />
                ))}
              </div>
            )}
          </div>

          {onOpenSupport && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Title level="3" weight="2" style={{ margin: 0 }}>Поддержка</Title>
                <Button variant="fill" size="sm" onClick={onOpenSupport}>Открыть →</Button>
              </div>
              <Section>
                <Cell multiline subtitle="Заявки и вопросы от пользователей платформы.">
                  Раздел поддержки
                </Cell>
              </Section>
            </div>
          )}

          <div ref={disputesRef}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Title level="3" weight="2" style={{ margin: 0 }}>Споры</Title>
              {openDisputeCount > 0 && (
                <span style={{ background: 'var(--nm-red)', color: '#fff', borderRadius: 10, padding: '2px 7px', fontSize: 12, fontWeight: 600 }}>
                  {openDisputeCount}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['open', 'resolved'] as const).map((f) => (
                <Button
                  key={f}
                  variant={disputeFilter === f ? 'fill' : 'ghost'}
                  size="sm"
                  onClick={() => { setDisputeFilter(f); scrolledRef.current = false; }}
                >
                  {f === 'open' ? 'Открытые' : 'Разрешённые'}
                </Button>
              ))}
            </div>
            {disputes!.length === 0 ? (
              <Section>
                <Cell>{disputeFilter === 'open' ? 'Нет открытых споров' : 'Нет разрешённых споров'}</Cell>
              </Section>
            ) : (
              disputes!.map((d) => (
                <DisputeCard
                  key={d.id} dispute={d} token={token}
                  onResolved={(id) => {
                    if (disputeFilter === 'open') {
                      setDisputes((prev) => prev?.filter((x) => x.id !== id) ?? null);
                    }
                  }}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
