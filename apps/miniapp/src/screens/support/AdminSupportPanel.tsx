import { useEffect, useRef, useState } from 'react';
import { Spinner, Placeholder } from '@telegram-apps/telegram-ui';
import { Building2, User, AlertTriangle } from 'lucide-react';
import {
  SUPPORT_TICKET_TYPES,
  SUPPORT_TICKET_STATUSES,
} from '../../api';
import type {
  AdminSupportUserDto,
  AdminSupportTicketListItemDto,
  AdminSupportTicketThreadDto,
  CreateTicketMessageInput,
} from '../../api';
import {
  fetchAdminSupportUsers,
  fetchAdminSupportTickets,
  fetchAdminSupportTicket,
  createAdminTicketMessage,
  updateAdminTicket,
  uploadSupportFile,
  MAX_UPLOAD_BYTES,
} from '../../api';
import { useMainButton } from '../../useMainButton';
import { Button } from '../../components/Button';
import { SelectChip } from '../../components/SelectChip';
import { StatusPill } from '../../components/StatusPill';
import { MessageBubble } from '../../components/MessageBubble';
import { MessageComposer } from '../../components/MessageComposer';
import type { PendingAttachment } from '../../components/MessageComposer';

// ─── утилиты ────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин. назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч. назад`;
  return `${Math.floor(hrs / 24)} дн. назад`;
}

function typeLabel(type: AdminSupportTicketListItemDto['type']): string {
  return SUPPORT_TICKET_TYPES.find((t) => t.value === type)?.label ?? type;
}

function statusLabel(status: AdminSupportTicketListItemDto['status']): string {
  return SUPPORT_TICKET_STATUSES.find((s) => s.value === status)?.label ?? status;
}

function openTelegram(username: string) {
  const url = `https://t.me/${username.replace(/^@/, '')}`;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Telegram?.WebApp?.openTelegramLink?.(url);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ─── типы навигации ──────────────────────────────────────────────────────────

type AdminSupportView =
  | { name: 'users' }
  | { name: 'tickets'; userId: string; userName: string }
  | { name: 'thread'; ticketId: string; fromUserId?: string; fromUserName?: string };

// ─── СПИСОК ПОЛЬЗОВАТЕЛЕЙ ───────────────────────────────────────────────────

function RoleIcon({ role }: { role: string | null }) {
  const style = {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: 'var(--nm-blue-soft)',
    color: 'var(--nm-blue)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };
  if (role === 'company') return <div style={style}><Building2 size={18} /></div>;
  return <div style={style}><User size={18} /></div>;
}

function UsersView({
  token,
  onSelect,
}: {
  token: string;
  onSelect: (userId: string, userName: string) => void;
}) {
  const [users, setUsers] = useState<AdminSupportUserDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdminSupportUsers(token)
      .then((u) => !cancelled && setUsers(u))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => { cancelled = true; };
  }, [token]);

  if (error) {
    return (
      <div style={{ color: 'var(--nm-red)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
        {error}
      </div>
    );
  }

  if (!users) {
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <Spinner size="l" />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--nm-ink-2)', fontSize: 14 }}>
        Заявок от пользователей пока нет
      </div>
    );
  }

  return (
    <div>
      {users.map((u) => (
        <div
          key={u.userId}
          onClick={() => onSelect(u.userId, u.name)}
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--nm-r-card)',
            background: 'var(--nm-surface)',
            border: '1px solid var(--nm-line)',
            boxShadow: 'var(--nm-sh-card)',
            marginBottom: 10,
            cursor: 'pointer',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <RoleIcon role={u.role} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--nm-ink)', marginBottom: 3 }}>
              {u.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>Тикетов: {u.ticketCount}</span>
              {u.openCount > 0 && (
                <span style={{ color: 'var(--nm-blue)', fontWeight: 600 }}>Открытых: {u.openCount}</span>
              )}
              <span>{relativeTime(u.lastActivityAt)}</span>
            </div>
          </div>

          {u.hasUnread && (
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: 'var(--nm-blue)',
                flexShrink: 0,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── СПИСОК ТИКЕТОВ ПОЛЬЗОВАТЕЛЯ ────────────────────────────────────────────

function TicketsView({
  token,
  userId,
  userName,
  onSelect,
}: {
  token: string;
  userId: string;
  userName: string;
  onSelect: (ticketId: string) => void;
}) {
  const [tickets, setTickets] = useState<AdminSupportTicketListItemDto[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed' | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTickets(null);
    fetchAdminSupportTickets(token, {
      userId,
      status: statusFilter === 'all' ? undefined : statusFilter,
    })
      .then((t) => !cancelled && setTickets(t))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => { cancelled = true; };
  }, [token, userId, statusFilter]);

  if (error) {
    return (
      <div style={{ color: 'var(--nm-red)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', marginBottom: 10 }}>
        {userName}
      </div>

      {/* Фильтр статуса */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['all', 'open', 'closed'] as const).map((f) => (
          <SelectChip
            key={f}
            label={f === 'all' ? 'Все' : f === 'open' ? 'Открытые' : 'Закрытые'}
            selected={statusFilter === f}
            onClick={() => setStatusFilter(f)}
          />
        ))}
      </div>

      {!tickets ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spinner size="l" />
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--nm-ink-2)', fontSize: 14 }}>
          Нет тикетов
        </div>
      ) : (
        tickets.map((t) => {
          const isClosed = t.status === 'closed';
          return (
            <div
              key={t.id}
              onClick={() => onSelect(t.id)}
              style={{
                padding: '13px 15px',
                borderRadius: 'var(--nm-r-card)',
                background: 'var(--nm-surface)',
                border: '1px solid var(--nm-line)',
                boxShadow: 'var(--nm-sh-card)',
                marginBottom: 10,
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              {t.hasUnread && (
                <span
                  style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--nm-blue)',
                  }}
                />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingRight: 20 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--nm-r-badge)',
                    background: 'var(--nm-blue)',
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  {typeLabel(t.type)}
                </span>
                <StatusPill tone={isClosed ? 'neutral' : 'info'}>
                  {isClosed ? 'Закрыт' : 'Открыт'}
                </StatusPill>
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--nm-ink)',
                  paddingRight: 16,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: 4,
                }}
              >
                {t.subject}
              </div>
              <div style={{ fontSize: 12, color: 'var(--nm-ink-2)' }}>
                {relativeTime(t.lastMessageAt)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── ТРЕД ТИКЕТА (ADMIN) ────────────────────────────────────────────────────

const ATTACH_MAX_BYTES = MAX_UPLOAD_BYTES;
const ATTACH_MAX_COUNT = 10;

function ThreadView({
  token,
  ticketId,
}: {
  token: string;
  ticketId: string;
}) {
  const [thread, setThread] = useState<AdminSupportTicketThreadDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Загрузка + поллинг каждые 5 с.
  useEffect(() => {
    let cancelled = false;

    function load() {
      fetchAdminSupportTicket(token, ticketId)
        .then((t) => { if (!cancelled) setThread(t); })
        .catch((e) => { if (!cancelled && !thread) setError((e as Error).message); });
    }

    load();
    const id = setInterval(() => { if (!cancelled) load(); }, 5000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ticketId]);

  // Прокрутка вниз при новых сообщениях.
  useEffect(() => {
    if (thread?.messages.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [thread?.messages.length]);

  const isClosed = thread?.status === 'closed';
  const canSend =
    !isClosed &&
    (inputText.trim().length > 0 || pendingAttachments.length > 0) &&
    !sending &&
    !uploading;

  async function pickAndUpload(file: File | undefined) {
    if (!file) return;
    setSendError(null);
    if (file.size > ATTACH_MAX_BYTES) { setSendError('Файл больше 48 МБ'); return; }
    if (pendingAttachments.length >= ATTACH_MAX_COUNT) { setSendError(`Максимум ${ATTACH_MAX_COUNT} вложений`); return; }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'application/octet-stream';
      const result = await uploadSupportFile(token, mimeType, base64, file.name);
      setPendingAttachments((prev) => [...prev, result]);
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function sendMessage() {
    if (!canSend) return;
    setSending(true);
    setSendError(null);
    try {
      const input: CreateTicketMessageInput = {
        body: inputText.trim() || undefined,
        attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
      };
      const msg = await createAdminTicketMessage(token, ticketId, input);
      setInputText('');
      setPendingAttachments([]);
      setThread((prev) => prev ? { ...prev, messages: [...prev.messages, msg] } : prev);
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function toggleStatus() {
    if (!thread || toggling) return;
    setToggling(true);
    setSendError(null);
    const newStatus = thread.status === 'open' ? 'closed' : 'open';
    try {
      await updateAdminTicket(token, ticketId, newStatus);
      setThread((prev) => prev ? { ...prev, status: newStatus } : prev);
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setToggling(false);
    }
  }

  useMainButton({
    text: sending ? 'Отправляем...' : 'Ответить',
    isEnabled: canSend,
    isVisible: !isClosed && !!thread,
    isLoaderVisible: sending,
    onClick: sendMessage,
  });

  if (error) {
    return (
      <Placeholder header="Ошибка" description={error}>
        <AlertTriangle size={40} color="var(--nm-amber)" />
      </Placeholder>
    );
  }

  if (!thread) {
    return (
      <Placeholder description="Загружаем тред...">
        <Spinner size="l" />
      </Placeholder>
    );
  }

  const author = thread.author;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Шапка тикета */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--nm-line)',
          background: 'var(--nm-surface)',
          flexShrink: 0,
        }}
      >
        {/* Тема + статус + кнопка закрыть/открыть */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: 'var(--nm-ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {thread.subject}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 'var(--nm-r-badge)',
                  background: 'var(--nm-blue)',
                  color: '#fff',
                }}
              >
                {typeLabel(thread.type)}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 'var(--nm-r-badge)',
                  border: `1px solid ${isClosed ? 'var(--nm-ink-3)' : 'var(--nm-blue)'}`,
                  color: isClosed ? 'var(--nm-ink-3)' : 'var(--nm-blue)',
                }}
              >
                {statusLabel(thread.status)}
              </span>
            </div>
          </div>
          <Button
            variant={isClosed ? 'fill' : 'ghost'}
            size="sm"
            disabled={toggling}
            onClick={() => void toggleStatus()}
            style={{
              flexShrink: 0,
              ...(!isClosed ? { color: 'var(--nm-red)', borderColor: 'var(--nm-red)' } : {}),
            }}
          >
            {toggling ? <Spinner size="s" /> : (isClosed ? 'Открыть' : 'Закрыть')}
          </Button>
        </div>

        {/* Автор */}
        <div
          style={{
            fontSize: 12,
            color: 'var(--nm-ink-2)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span>
            {author.role === 'company' ? (
              <Building2 size={14} style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--nm-ink-2)' }} />
            ) : author.role === 'blogger' ? (
              <User size={14} style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--nm-ink-2)' }} />
            ) : null}
            <b style={{ color: 'var(--nm-ink)' }}>{author.name}</b>
          </span>
          {author.username && (
            <button
              onClick={() => openTelegram(author.username!)}
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--nm-blue)',
                cursor: 'pointer',
                fontSize: 12,
                padding: 0,
              }}
            >
              @{author.username.replace(/^@/, '')}
            </button>
          )}
          {author.contact && !author.username && (
            <span
              style={{ cursor: 'pointer', color: 'var(--nm-blue)' }}
              onClick={() => void navigator.clipboard.writeText(author.contact!)}
            >
              {author.contact}
            </span>
          )}
        </div>
      </div>

      {/* Сообщения */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', background: 'var(--nm-bg)' }}>
        {thread.messages.length === 0 && (
          <div style={{ color: 'var(--nm-ink-2)', fontSize: 13, textAlign: 'center', marginTop: 32 }}>
            Нет сообщений
          </div>
        )}
        {thread.messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isMe={msg.fromAdmin}
            senderName={author.name}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Баннер закрытого тикета */}
      {isClosed && (
        <div
          style={{
            padding: '10px 16px',
            background: 'var(--nm-surface-2)',
            color: 'var(--nm-ink-2)',
            fontSize: 13,
            textAlign: 'center',
            borderTop: '1px solid var(--nm-line)',
            flexShrink: 0,
          }}
        >
          Тикет закрыт — нажмите «Открыть», чтобы возобновить переписку
        </div>
      )}

      {/* Композер */}
      {!isClosed && (
        <MessageComposer
          inputText={inputText}
          onTextChange={setInputText}
          pendingAttachments={pendingAttachments}
          onRemoveAttachment={(id) => setPendingAttachments((prev) => prev.filter((a) => a.fileId !== id))}
          fileInputRef={fileInputRef}
          onFileChange={(e) => void pickAndUpload(e.target.files?.[0])}
          uploading={uploading}
          sending={sending}
          canSend={canSend}
          onSend={() => void sendMessage()}
          placeholder="Ответ пользователю..."
          error={sendError}
        />
      )}
    </div>
  );
}

// ─── КОРНЕВОЙ КОМПОНЕНТ ──────────────────────────────────────────────────────

export function AdminSupportPanel({
  token,
  onBack,
  onNestedChange,
}: {
  token: string;
  onBack?: () => void;
  onNestedChange?: (nested: boolean) => void;
}) {
  const [view, setView] = useState<AdminSupportView>({ name: 'users' });

  useEffect(() => {
    onNestedChange?.(view.name !== 'users');
  }, [view.name, onNestedChange]);

  function goBack() {
    if (view.name === 'thread') {
      // Возвращаемся к тикетам пользователя, если знаем userId, иначе к списку пользователей.
      if (view.fromUserId) {
        setView({ name: 'tickets', userId: view.fromUserId, userName: view.fromUserName ?? '' });
      } else {
        setView({ name: 'users' });
      }
    } else if (view.name === 'tickets') {
      setView({ name: 'users' });
    } else {
      onBack?.();
    }
  }

  const title =
    view.name === 'users'
      ? 'Поддержка — пользователи'
      : view.name === 'tickets'
      ? `Тикеты: ${view.userName}`
      : 'Тред';

  // ThreadView управляет MainButton сам; остальные виды её не используют.
  // Нам нужно скрыть MainButton когда выходим из ThreadView.
  // useMainButton с isVisible=false сработает только если ThreadView размонтирован.
  // Это происходит автоматически при смене view, т.к. useMainButton в ThreadView
  // прячет кнопку на cleanup (return () => mainButton.setParams({ isVisible: false })).

  const showOwnHeader = onBack !== undefined || view.name !== 'users';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Шапка с навигацией — скрыта когда компонент — корневая вкладка на экране users */}
      {showOwnHeader && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--nm-line)',
            background: 'var(--nm-surface)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Button variant="ghost" size="sm" onClick={goBack}>
            ← Назад
          </Button>
          <div
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: 700,
              fontSize: 15,
              color: 'var(--nm-ink)',
            }}
          >
            {title}
          </div>
        </div>
      )}

      {/* Контент */}
      <div
        style={{
          flex: 1,
          overflowY: view.name === 'thread' ? 'hidden' : 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {view.name === 'users' && (
          <div style={{ padding: 16, paddingBottom: 32 }}>
            <UsersView
              token={token}
              onSelect={(userId, userName) => setView({ name: 'tickets', userId, userName })}
            />
          </div>
        )}

        {view.name === 'tickets' && (
          <div style={{ padding: 16, paddingBottom: 32 }}>
            <TicketsView
              token={token}
              userId={view.userId}
              userName={view.userName}
              onSelect={(ticketId) =>
                setView({
                  name: 'thread',
                  ticketId,
                  fromUserId: view.userId,
                  fromUserName: view.userName,
                })
              }
            />
          </div>
        )}

        {view.name === 'thread' && (
          <ThreadView token={token} ticketId={view.ticketId} />
        )}
      </div>
    </div>
  );
}
