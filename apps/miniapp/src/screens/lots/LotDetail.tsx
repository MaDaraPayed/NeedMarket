import { useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Title,
  Spinner,
  Placeholder,
  Modal,
} from '@telegram-apps/telegram-ui';
import { Clock, CheckCircle, AlertCircle, Wallet, Copy, FileText, Star, AlertTriangle } from 'lucide-react';
import {
  fetchLot,
  fetchLotResponses,
  fetchMyResponses,
  createResponse,
  acceptResponse,
  rejectResponse,
  rejectResponseAfterDispute,
  continueAfterDispute,
  completeLot,
  uploadLotAttachment,
  deleteLotAttachment,
  resolveMediaUrl,
  type Lot,
  type LotAttachmentDto,
  type LotResponse,
  type ApiUser,
  type ReviewGiven,
  type ReviewReceived,
} from '../../api';
import { initials, formatBudget, formatDeadline, statusLabel } from './format';
import { BloggerProfileModal } from '../../components/BloggerProfileModal';
import { ReviewForm } from '../../components/ReviewForm';
import { ReviewsModal } from '../../components/ReviewsModal';
import { DisputeForm } from '../../components/DisputeForm';
import { StatusPill, lotStatusToPill, responseStatusToPill, type PillTone } from '../../components/StatusPill';
import { Button as NmButton } from '../../components/Button';
import { FormTextarea, FormHint } from '../../components/FormControls';
import { StatusBanner, InfoSection, AttachmentList } from '../../components/LotDetailShared';
import { useMainButton } from '../../useMainButton';
import { isMockEnv } from '../../mockEnv';

// Чтение файла как base64 без data-URL префикса.
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

const ATTACHMENT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_MAX_COUNT = 10;

// Вложение компании-владельца с кнопкой удаления.
function AttachmentItem({
  att,
  onDelete,
}: {
  att: LotAttachmentDto;
  onDelete: (id: string) => void;
}) {
  const inlineUrl = resolveMediaUrl(att.mediaUrl);
  const dlUrl = resolveMediaUrl(att.downloadUrl);
  const isImage = att.contentType.startsWith('image/');
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <a
        href={dlUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: isImage ? 0 : '8px 12px',
          background: 'var(--nm-surface-2)',
          borderRadius: 'var(--nm-r-field)',
          border: '1px solid var(--nm-line)',
          color: 'var(--nm-ink)',
          textDecoration: 'none',
          fontSize: 13,
          fontWeight: 500,
          maxWidth: isImage ? undefined : 180,
        }}
      >
        {isImage ? (
          <img
            src={inlineUrl}
            alt="вложение"
            style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, display: 'block' }}
          />
        ) : (
          <>
            <FileText size={16} color="var(--nm-blue)" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {att.fileName ?? 'документ'}
            </span>
          </>
        )}
      </a>
      <button
        onClick={() => onDelete(att.id)}
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: 'none',
          background: 'var(--nm-red)',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
        aria-label="удалить"
      >
        ×
      </button>
    </div>
  );
}

function CompanyAttachmentsBlock({
  token,
  lotId,
  attachments,
  onAttachmentsChanged,
}: {
  token: string;
  lotId: string;
  attachments: LotAttachmentDto[];
  onAttachmentsChanged: (next: LotAttachmentDto[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickAndUpload(file: File | undefined) {
    if (!file) return;
    setError(null);
    const allTypes = [
      ...ATTACHMENT_IMAGE_TYPES,
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
    ];
    if (!allTypes.includes(file.type)) { setError('Неподдерживаемый тип файла'); return; }
    if (file.size > ATTACHMENT_MAX_BYTES) { setError('Файл больше 10 МБ'); return; }
    if (attachments.length >= ATTACHMENT_MAX_COUNT) { setError(`Максимум ${ATTACHMENT_MAX_COUNT} вложений`); return; }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const isImage = ATTACHMENT_IMAGE_TYPES.includes(file.type);
      const att = await uploadLotAttachment(token, lotId, file.type, base64, isImage ? undefined : file.name);
      onAttachmentsChanged([...attachments, att]);
    } catch (e) { setError((e as Error).message); }
    finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(attId: string) {
    try {
      await deleteLotAttachment(token, lotId, attId);
      onAttachmentsChanged(attachments.filter((a) => a.id !== attId));
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <InfoSection title="Материалы лота">
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {attachments.map((att) => (
            <AttachmentItem key={att.id} att={att} onDelete={handleDelete} />
          ))}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
        style={{ display: 'none' }}
        onChange={(e) => void pickAndUpload(e.target.files?.[0])}
      />
      <NmButton
        variant="ghost"
        size="sm"
        disabled={uploading || attachments.length >= ATTACHMENT_MAX_COUNT}
        style={
          uploading || attachments.length >= ATTACHMENT_MAX_COUNT
            ? { opacity: 0.45, pointerEvents: 'none' }
            : undefined
        }
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? '…' : '+ Добавить файл'}
      </NmButton>
      {error && (
        <div style={{ color: 'var(--nm-red)', marginTop: 6, fontSize: 13 }}>{error}</div>
      )}
      <div style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 8 }}>
        PNG, JPEG, WebP, PDF и документы Office — до 10 МБ, максимум 10 файлов
      </div>
    </InfoSection>
  );
}

// ── Blogger branch components ─────────────────────────────

// Статус отклика как пилюля в стиле --nm-* (блогерская ветка).
function ResponseStatusPill({ status }: { status: LotResponse['status'] }) {
  type Cfg = { label: string; bg: string; color: string };
  const configs: Record<LotResponse['status'], Cfg> = {
    pending:  { label: 'На рассмотрении', bg: 'var(--nm-info-bg)',    color: 'var(--nm-info)' },
    accepted: { label: 'Принят',          bg: 'var(--nm-green-bg)',   color: 'var(--nm-green)' },
    rejected: { label: 'Отклонён',        bg: 'var(--nm-neutral-bg)', color: 'var(--nm-neutral)' },
    disputed: { label: 'Оспорен',         bg: 'var(--nm-red-bg)',     color: 'var(--nm-red)' },
  };
  const c = configs[status] ?? configs.pending;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 11.5,
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: 'var(--nm-r-badge)',
        background: c.bg,
        color: c.color,
      }}
    >
      {c.label}
    </span>
  );
}

// Форма отклика блогера: textarea + MainButton «Откликнуться».
function BloggerResponseBlock({
  token,
  lot,
  onResponded,
}: {
  token: string;
  lot: Lot;
  onResponded: (r: LotResponse) => void;
}) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = lot.status === 'active';
  const canSubmit = isActive && message.trim().length > 0 && !loading;

  const missing: string[] = [];
  if (!message.trim()) missing.push('Введите сообщение');

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const r = await createResponse(token, lot.id, message.trim());
      onResponded(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useMainButton({
    text: 'Откликнуться',
    isEnabled: canSubmit,
    isVisible: isActive,
    isLoaderVisible: loading,
    onClick: submit,
  });

  if (!isActive) return null;

  return (
    <InfoSection title="Откликнуться">
      <FormTextarea
        label="Ваше сообщение"
        placeholder="Расскажите, почему вы подходите..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        style={{ marginBottom: 0 }}
      />
      <FormHint missing={missing} />
      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 13, marginTop: 4 }}>{error}</div>
      )}
      {isMockEnv && (
        <div style={{ marginTop: 10 }}>
          <NmButton
            variant="fill"
            style={{ width: '100%' }}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {loading ? '…' : 'Откликнуться'}
          </NmButton>
        </div>
      )}
    </InfoSection>
  );
}

// ── Company branch components ─────────────────────────────

// Баннер статуса спора на карточке отклика.
function DisputeBanner({ disputeStatus }: { disputeStatus: 'open' | 'resolved' | null | undefined }) {
  if (!disputeStatus) return null;
  if (disputeStatus === 'open') {
    return (
      <div style={{ marginBottom: 10 }}>
        <StatusBanner variant="amber" icon={<AlertCircle size={16} />}>
          Спор на рассмотрении — администратор разберёт ситуацию.
        </StatusBanner>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <StatusBanner variant="neutral" icon={<CheckCircle size={16} />}>
        Спор разрешён.
      </StatusBanner>
    </div>
  );
}

function StarDisplay({ value }: { value: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={14}
          fill={i < value ? '#F5C518' : 'none'}
          color={i < value ? '#F5C518' : 'var(--nm-line)'}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

function GivenReviewBadge({ review }: { review: ReviewGiven }) {
  return (
    <div style={{
      background: 'var(--nm-surface-2)',
      borderRadius: 'var(--nm-r-field)',
      border: '1px solid var(--nm-line)',
      padding: '8px 12px',
      fontSize: 13,
      marginTop: 10,
    }}>
      <span style={{ color: 'var(--nm-ink-2)' }}>Ваша оценка: </span>
      <StarDisplay value={review.rating} />
      {review.comment && <div style={{ color: 'var(--nm-ink-2)', fontSize: 12, marginTop: 2 }}>{review.comment}</div>}
    </div>
  );
}

function ReceivedReviewBadge({ review }: { review: ReviewReceived }) {
  return (
    <div style={{
      background: 'var(--nm-surface-2)',
      borderRadius: 'var(--nm-r-field)',
      border: '1px solid var(--nm-line)',
      padding: '8px 12px',
      fontSize: 13,
      marginTop: 10,
    }}>
      <span style={{ color: 'var(--nm-ink-2)' }}>{review.authorName}: </span>
      <StarDisplay value={review.rating} />
      {review.comment && <div style={{ color: 'var(--nm-ink-2)', fontSize: 12, marginTop: 2 }}>{review.comment}</div>}
    </div>
  );
}

// Карточка отклика для компании-владельца.
function ResponseCard({
  response,
  token,
  lotId,
  lotStatus,
  isCompleted,
  isOwner,
  givenReview,
  receivedReview,
  onAccept,
  onReject,
  onReviewDone,
  onDisputeOpened,
}: {
  response: LotResponse;
  token: string;
  lotId: string;
  lotStatus: Lot['status'];
  isCompleted: boolean;
  isOwner: boolean;
  givenReview?: ReviewGiven;
  receivedReview?: ReviewReceived;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onReviewDone?: (targetId: string, rating: number) => void;
  onDisputeOpened?: () => void;
}) {
  const b = response.blogger;
  const avatar = b?.avatarUrl ? resolveMediaUrl(b.avatarUrl) : undefined;
  const isRejected = response.status === 'rejected';
  const isAccepted = response.status === 'accepted';
  const isDisputed = response.status === 'disputed';
  const [copied, setCopied] = useState(false);
  const [nickCopied, setNickCopied] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);

  function handleContactClick() {
    if (b?.telegramUsername) {
      const handle = b.telegramUsername.startsWith('@') ? b.telegramUsername.slice(1) : b.telegramUsername;
      (window as any).Telegram?.WebApp?.openTelegramLink?.(`https://t.me/${handle}`);
    } else if (b?.contact) {
      navigator.clipboard?.writeText(b.contact).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleCopyNick() {
    const nick = b?.telegramUsername ?? '';
    navigator.clipboard?.writeText(nick).catch(() => {});
    setNickCopied(true);
    setTimeout(() => setNickCopied(false), 2000);
  }

  const hasContact = !!(b?.telegramUsername || b?.contact);

  const canOpenDispute =
    isOwner &&
    (lotStatus === 'in_progress' || lotStatus === 'awaiting_payout') &&
    isAccepted &&
    !response.disputeStatus;

  const { tone, label } = responseStatusToPill(response.status);

  return (
    <>
      <div
        style={{
          background: 'var(--nm-surface)',
          borderRadius: 'var(--nm-r-card)',
          border: '1px solid var(--nm-line)',
          padding: '14px 15px',
          marginBottom: 10,
          opacity: isRejected ? 0.5 : 1,
          boxShadow: isAccepted || isDisputed ? 'var(--nm-sh-card)' : 'none',
        }}
      >
        {/* Шапка: аватар + имя + @ник + статистика + статус */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <Avatar size={40} acronym={initials(b?.displayName ?? '?')} src={avatar} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--nm-ink)', lineHeight: 1.2 }}>
              {b?.displayName ?? '—'}
            </div>
            {b?.telegramUsername && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <span style={{ fontSize: 12, color: 'var(--nm-ink-2)' }}>{b.telegramUsername}</span>
                <button
                  onClick={handleCopyNick}
                  title={nickCopied ? 'Скопировано' : 'Копировать'}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    color: 'var(--nm-ink-3)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Copy size={12} />
                </button>
              </div>
            )}
            {b?.categories && b.categories.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', marginTop: 2 }}>
                {b.categories.join(', ')}
              </div>
            )}
            {b?.linkedAccounts && b.linkedAccounts.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', marginTop: 2 }}>
                {b.linkedAccounts
                  .map((a) => `${a.platform}${a.followers ? ` · ${(a.followers / 1000).toFixed(0)}K` : ''}`)
                  .join('  ·  ')}
              </div>
            )}
            {b && (b.ratingCount ?? 0) > 0 && (
              <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Star size={11} fill="#F5C518" color="#F5C518" strokeWidth={0} />
                {b.ratingAvg?.toFixed(1)}{' '}
                <span>({b.ratingCount})</span>
              </div>
            )}
          </div>
          <StatusPill tone={tone}>{label}</StatusPill>
        </div>

        {/* Текст отклика */}
        <p style={{ fontSize: 14, color: 'var(--nm-ink)', lineHeight: 1.6, margin: '0 0 10px 0' }}>
          {response.message}
        </p>

        <DisputeBanner disputeStatus={response.disputeStatus} />

        {/* Действия */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {response.status === 'pending' && (
            <>
              {onAccept && (
                <NmButton variant="fill" size="sm" onClick={() => onAccept(response.id)}>
                  Выбрать
                </NmButton>
              )}
              {onReject && (
                <NmButton variant="ghost" size="sm" onClick={() => onReject(response.id)}>
                  Отклонить
                </NmButton>
              )}
            </>
          )}
          {b && (
            <NmButton variant="ghost" size="sm" onClick={() => setProfileOpen(true)}>
              Профиль
            </NmButton>
          )}
          <NmButton
            variant="ghost"
            size="sm"
            disabled={!hasContact}
            style={!hasContact ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
            onClick={handleContactClick}
          >
            {copied ? 'Скопировано' : 'Связаться'}
          </NmButton>
          {isCompleted && (isAccepted || isDisputed) && b?.userId && !givenReview && (
            <NmButton variant="fill" size="sm" onClick={() => setReviewOpen(true)}>
              Оценить
            </NmButton>
          )}
          {canOpenDispute && (
            <NmButton variant="ghost" size="sm" onClick={() => setDisputeOpen(true)}>
              Открыть спор
            </NmButton>
          )}
        </div>

        {givenReview && <GivenReviewBadge review={givenReview} />}
        {receivedReview && <ReceivedReviewBadge review={receivedReview} />}
      </div>

      {b && (
        <BloggerProfileModal
          blogger={b}
          token={token}
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {isCompleted && (isAccepted || isDisputed) && b?.userId && (
        <Modal
          header={<Modal.Header />}
          open={reviewOpen}
          onOpenChange={(o) => { if (!o) setReviewOpen(false); }}
        >
          <div style={{ padding: '0 20px 32px' }}>
            <Title level="3" weight="2" style={{ marginBottom: 16 }}>
              Оценить {b.displayName}
            </Title>
            <ReviewForm
              token={token}
              lotId={lotId}
              targetId={b.userId}
              onDone={(rating) => {
                setReviewOpen(false);
                onReviewDone?.(b.userId!, rating);
              }}
            />
          </div>
        </Modal>
      )}

      {canOpenDispute && (
        <Modal
          header={<Modal.Header />}
          open={disputeOpen}
          onOpenChange={(o) => { if (!o) setDisputeOpen(false); }}
        >
          <div style={{ padding: '0 20px 32px' }}>
            <Title level="3" weight="2" style={{ marginBottom: 16 }}>
              Открыть спор
            </Title>
            <DisputeForm
              token={token}
              lotId={lotId}
              responseId={response.id}
              role="company"
              onSuccess={() => {
                setDisputeOpen(false);
                onDisputeOpened?.();
              }}
            />
          </div>
        </Modal>
      )}
    </>
  );
}

// ── LotDetail (main export) ───────────────────────────────

export function LotDetail({
  token,
  id,
  user,
  onBack,
}: {
  token: string;
  id: string;
  user: ApiUser;
  onBack: () => void;
}) {
  const [lot, setLot] = useState<Lot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myResponse, setMyResponse] = useState<LotResponse | null | undefined>(undefined);
  const [responses, setResponses] = useState<LotResponse[] | null>(null);
  const [slotsNeeded, setSlotsNeeded] = useState(1);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<LotAttachmentDto[]>([]);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const [rejectAfterDisputeId, setRejectAfterDisputeId] = useState<string | null>(null);
  const [rejectingAfterDispute, setRejectingAfterDispute] = useState(false);
  const [rejectAfterDisputeError, setRejectAfterDisputeError] = useState<string | null>(null);

  const [continuingAfterDispute, setContinuingAfterDispute] = useState(false);
  const [continueAfterDisputeError, setContinueAfterDisputeError] = useState<string | null>(null);

  const [bloggerDisputeOpen, setBloggerDisputeOpen] = useState(false);
  const [bloggerReviewOpen, setBloggerReviewOpen] = useState(false);
  const [companyReviewsOpen, setCompanyReviewsOpen] = useState(false);

  const [reviewsGiven, setReviewsGiven] = useState<ReviewGiven[]>([]);
  const [reviewsReceived, setReviewsReceived] = useState<ReviewReceived[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchLot(token, id)
      .then((l) => {
        if (!cancelled) {
          setLot(l);
          setSlotsNeeded(l.slotsNeeded ?? 1);
          setAttachments(l.attachments ?? []);
          setReviewsGiven(l.reviewsGiven ?? []);
          setReviewsReceived(l.reviewsReceived ?? []);
        }
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [token, id]);

  useEffect(() => {
    if (!lot || user.role !== 'blogger') return;
    let cancelled = false;
    fetchMyResponses(token)
      .then((rs) => {
        if (cancelled) return;
        const mine = rs.find((r) => r.lotId === id) ?? null;
        setMyResponse(mine);
      })
      .catch(() => { if (!cancelled) setMyResponse(null); });
    return () => { cancelled = true; };
  }, [lot, token, id, user.role]);

  useEffect(() => {
    if (!lot || user.role !== 'company') return;
    const profile = user.profile;
    if (!profile || !('name' in profile)) return;
    let cancelled = false;
    fetchLotResponses(token, id)
      .then((data) => { if (!cancelled) setResponses(data); })
      .catch(() => { if (!cancelled) setResponses([]); });
    return () => { cancelled = true; };
  }, [lot, token, id, user.role, user.profile]);

  async function handleAccept(responseId: string) {
    setAccepting(true);
    setAcceptError(null);
    try {
      await acceptResponse(token, id, responseId);
      const [updatedLot, updatedResponses] = await Promise.all([
        fetchLot(token, id),
        fetchLotResponses(token, id),
      ]);
      setLot(updatedLot);
      setSlotsNeeded(updatedLot.slotsNeeded ?? 1);
      setResponses(updatedResponses);
    } catch (e) { setAcceptError((e as Error).message); }
    finally {
      setAccepting(false);
      setConfirmId(null);
    }
  }

  async function handleReject(responseId: string) {
    setAcceptError(null);
    try {
      await rejectResponse(token, id, responseId);
      const updatedResponses = await fetchLotResponses(token, id);
      setResponses(updatedResponses);
    } catch (e) { setAcceptError((e as Error).message); }
  }

  async function handleRejectAfterDispute() {
    if (!rejectAfterDisputeId) return;
    setRejectingAfterDispute(true);
    setRejectAfterDisputeError(null);
    try {
      await rejectResponseAfterDispute(token, id, rejectAfterDisputeId);
      const [updatedLot, updatedResponses] = await Promise.all([
        fetchLot(token, id),
        fetchLotResponses(token, id),
      ]);
      setLot(updatedLot);
      setSlotsNeeded(updatedLot.slotsNeeded ?? 1);
      setResponses(updatedResponses);
      setRejectAfterDisputeId(null);
    } catch (e) { setRejectAfterDisputeError((e as Error).message); }
    finally { setRejectingAfterDispute(false); }
  }

  async function handleContinueAfterDispute(responseId: string) {
    setContinuingAfterDispute(true);
    setContinueAfterDisputeError(null);
    try {
      await continueAfterDispute(token, id, responseId);
      const [updatedLot, updatedResponses] = await Promise.all([
        fetchLot(token, id),
        fetchLotResponses(token, id),
      ]);
      setLot(updatedLot);
      setSlotsNeeded(updatedLot.slotsNeeded ?? 1);
      setResponses(updatedResponses);
    } catch (e) { setContinueAfterDisputeError((e as Error).message); }
    finally { setContinuingAfterDispute(false); }
  }

  async function handleComplete() {
    setCompleting(true);
    setCompleteError(null);
    try {
      const updated = await completeLot(token, id);
      setLot((prev) => prev ? { ...prev, status: updated.status as Lot['status'] } : prev);
      setShowCompleteConfirm(false);
    } catch (e) { setCompleteError((e as Error).message); }
    finally { setCompleting(false); }
  }

  async function reloadReviews() {
    try {
      const updated = await fetchLot(token, id);
      setReviewsGiven(updated.reviewsGiven ?? []);
      setReviewsReceived(updated.reviewsReceived ?? []);
    } catch { /* best-effort */ }
  }

  async function reloadAfterDispute() {
    try {
      const [updatedLot, updatedResponses, updatedMyResponses] = await Promise.all([
        fetchLot(token, id),
        user.role === 'company' ? fetchLotResponses(token, id) : Promise.resolve(null),
        user.role === 'blogger' ? fetchMyResponses(token) : Promise.resolve(null),
      ]);
      setLot(updatedLot);
      if (updatedResponses) setResponses(updatedResponses);
      if (updatedMyResponses) {
        setMyResponse(updatedMyResponses.find((r) => r.lotId === id) ?? null);
      }
    } catch { /* best-effort */ }
  }

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <Placeholder header="Не удалось загрузить" description={error}>
          <AlertTriangle size={48} color="var(--nm-amber)" />
        </Placeholder>
        <NmButton variant="ghost" style={{ width: '100%' }} onClick={onBack}>Назад</NmButton>
      </div>
    );
  }

  if (!lot) {
    return (
      <Placeholder description="Загружаем лот...">
        <Spinner size="l" />
      </Placeholder>
    );
  }

  const logo = lot.company.logoUrl ? resolveMediaUrl(lot.company.logoUrl) : undefined;
  const isOwner = user.role === 'company' && user.profile && 'id' in user.profile && lot.companyId === user.profile.id;
  const acceptedCount = responses ? responses.filter((r) => r.status === 'accepted' || r.status === 'disputed').length : (lot.acceptedCount ?? 0);
  const slotsOpen = lot.status === 'active' && acceptedCount < slotsNeeded;
  const hasOpenDispute = lot.myDisputeStatus === 'open';
  const isAwaitingDecision = lot.status === 'awaiting_decision';
  const canComplete = isOwner && (lot.status === 'active' || lot.status === 'in_progress' || isAwaitingDecision) && acceptedCount >= 1;
  const isCompleted = lot.status === 'completed';
  const awaitingDecisionResponse = isOwner && responses
    ? responses.find((r) => r.awaitingCompanyDecision && r.status === 'accepted')
    : undefined;

  const responsesHeader = responses !== null
    ? `Отклики (${responses.length}) · выбрано ${acceptedCount}/${slotsNeeded}`
    : 'Отклики';

  const bloggerGivenReview = reviewsGiven[0];
  const bloggerReceivedReview = reviewsReceived[0];

  const givenByTarget = new Map(reviewsGiven.map((r) => [r.targetId, r]));
  const receivedByAuthor = new Map(reviewsReceived.map((r) => [r.authorId, r]));

  const companyUserId = lot.company.userId;
  const hasCompanyRating = (lot.company.ratingCount ?? 0) > 0;

  const bloggerCanDispute =
    user.role === 'blogger' &&
    myResponse &&
    (myResponse.status === 'accepted') &&
    !myResponse.disputeStatus &&
    (lot.status === 'in_progress' || lot.status === 'awaiting_payout');

  const { tone: lotTone, label: lotLabel } = lotStatusToPill(lot.status);

  return (
    <div style={{ padding: '16px 16px 32px', background: 'var(--nm-bg)', minHeight: '100%' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          {/* Company logo tile */}
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 'var(--nm-r-tile)',
              background: 'var(--nm-blue-soft)',
              color: 'var(--nm-blue)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 16,
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {logo ? (
              <img src={logo} alt="" style={{ width: 42, height: 42, objectFit: 'cover' }} />
            ) : (
              initials(lot.company.name)
            )}
          </div>
          {/* Company name + rating */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--nm-ink)', lineHeight: 1.2 }}>
              {lot.company.name}
            </div>
            {companyUserId && (
              <button
                onClick={() => setCompanyReviewsOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: 12,
                  color: hasCompanyRating ? 'var(--nm-ink-2)' : 'var(--nm-ink-3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 2,
                }}
              >
                {hasCompanyRating ? (
                  <>
                    <Star size={11} fill="#F5C518" color="#F5C518" strokeWidth={0} />
                    {lot.company.ratingAvg?.toFixed(1)} ({lot.company.ratingCount})
                  </>
                ) : (
                  'нет отзывов'
                )}
              </button>
            )}
          </div>
          {/* Status pill */}
          <StatusPill tone={lotTone}>{lotLabel}</StatusPill>
        </div>
        {/* Lot title */}
        <h1
          style={{
            fontSize: 21,
            fontWeight: 800,
            color: 'var(--nm-ink)',
            letterSpacing: '-0.3px',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {lot.title}
        </h1>
      </div>

      {/* ── Shared status banners ── */}
      {lot.status === 'awaiting_payment' && (
        <StatusBanner variant="amber" icon={<Wallet size={16} />}>
          {isOwner
            ? 'Лот ожидает оплаты — с вами свяжется менеджер для активации.'
            : 'Лот ожидает оплаты — с вами свяжутся для уточнения деталей.'}
        </StatusBanner>
      )}
      {lot.status === 'awaiting_payout' && (
        <StatusBanner variant="amber" icon={<Wallet size={16} />}>
          {isOwner
            ? 'Ожидает выплаты — администратор закроет лот после перевода средств блогерам.'
            : 'Ожидает выплаты — лот закроет администратор после перевода средств.'}
        </StatusBanner>
      )}

      {/* ── Company-specific status banners ── */}
      {isOwner && lot.status === 'active' && (
        <StatusBanner variant="info" icon={<Clock size={16} />}>
          Лот активен — принимаем отклики блогеров.
        </StatusBanner>
      )}
      {isOwner && lot.status === 'in_progress' && (
        <StatusBanner variant="green" icon={<CheckCircle size={16} />}>
          Лот в работе — блогеры выполняют задание.
        </StatusBanner>
      )}
      {isOwner && isCompleted && (
        <StatusBanner variant="green" icon={<CheckCircle size={16} />}>
          Сделка завершена — не забудьте оценить блогеров.
        </StatusBanner>
      )}

      {/* Блокирующий баннер awaiting_decision для компании-владельца */}
      {isOwner && isAwaitingDecision && awaitingDecisionResponse && (
        <div style={{
          background: 'var(--nm-amber-bg)',
          border: '1px solid var(--nm-amber)',
          borderRadius: 'var(--nm-r-card)',
          padding: '14px 15px',
          marginBottom: 12,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--nm-amber)', fontSize: 14 }}>
            Спор решён в вашу пользу
          </div>
          <div style={{ fontSize: 14, color: 'var(--nm-amber)', marginBottom: 12, lineHeight: 1.5 }}>
            Выберите дальнейшее действие по блогеру. Пока не выберете — другие блогеры недоступны,
            лот нельзя завершить.
          </div>
          {continueAfterDisputeError && (
            <div style={{ color: 'var(--nm-red)', fontSize: 13, marginBottom: 8 }}>
              {continueAfterDisputeError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <NmButton
              variant="fill"
              size="sm"
              disabled={continuingAfterDispute}
              style={continuingAfterDispute ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
              onClick={() => void handleContinueAfterDispute(awaitingDecisionResponse.id)}
            >
              {continuingAfterDispute ? '…' : 'Продолжить работу'}
            </NmButton>
            <NmButton
              variant="ghost"
              size="sm"
              disabled={continuingAfterDispute}
              style={{
                color: 'var(--nm-red)',
                borderColor: 'var(--nm-red)',
                ...(continuingAfterDispute ? { opacity: 0.5, pointerEvents: 'none' } : {}),
              }}
              onClick={() => setRejectAfterDisputeId(awaitingDecisionResponse.id)}
            >
              Отказаться от блогера
            </NmButton>
          </div>
        </div>
      )}

      {/* Баннер awaiting_decision для блогера */}
      {user.role === 'blogger' && isAwaitingDecision && (
        <StatusBanner variant="neutral" icon={<Clock size={16} />}>
          Ожидается решение рекламодателя — пока ничего делать не нужно.
        </StatusBanner>
      )}

      {/* Баннер «Сделка завершена» для блогера */}
      {!isOwner && isCompleted && (
        <StatusBanner variant="green" icon={<CheckCircle size={16} />}>
          Сделка завершена — оставьте отзыв партнёру.
        </StatusBanner>
      )}

      {/* ── Кнопка «Проект завершён» (компания) ── */}
      {canComplete && (
        <div style={{ marginBottom: 12 }}>
          {isAwaitingDecision ? (
            <div>
              <NmButton variant="fill" style={{ width: '100%', opacity: 0.5, pointerEvents: 'none' }} disabled>
                Проект завершён
              </NmButton>
              <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', marginTop: 6, textAlign: 'center' }}>
                Сначала решите по спорному блогеру
              </div>
            </div>
          ) : hasOpenDispute ? (
            <div>
              <NmButton variant="fill" style={{ width: '100%', opacity: 0.5, pointerEvents: 'none' }} disabled>
                Проект завершён
              </NmButton>
              <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', marginTop: 6, textAlign: 'center' }}>
                Есть нерешённый спор — завершение заблокировано
              </div>
            </div>
          ) : (
            <NmButton
              variant="fill"
              style={{ width: '100%' }}
              onClick={() => setShowCompleteConfirm(true)}
            >
              Проект завершён
            </NmButton>
          )}
          {completeError && (
            <div style={{ color: 'var(--nm-red)', marginTop: 8, fontSize: 13 }}>{completeError}</div>
          )}
        </div>
      )}

      {/* ── Условия / Описание / Требования ── */}
      <InfoSection
        title="Условия"
        rows={[
          { label: 'Категории', value: lot.categories.join(', ') },
          { label: 'Площадки', value: lot.platforms.join(', ') },
          { label: 'Бюджет', value: formatBudget(lot.budget) },
          { label: 'Дедлайн', value: formatDeadline(lot.deadline) },
          { label: 'Статус', value: statusLabel(lot.status) },
          { label: 'Блогеров', value: String(slotsNeeded) },
        ]}
      />

      <InfoSection title="Описание">
        <p style={{ fontSize: 14, color: 'var(--nm-ink)', lineHeight: 1.6, margin: 0 }}>
          {lot.description}
        </p>
      </InfoSection>

      <InfoSection title="Требования">
        {lot.requirements.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lot.requirements.map((r, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: 14,
                  color: 'var(--nm-ink)',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: 'var(--nm-blue)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                {r}
              </li>
            ))}
          </ul>
        ) : (
          <span style={{ fontSize: 14, color: 'var(--nm-ink-2)' }}>Нет особых требований</span>
        )}
      </InfoSection>

      {/* ── Материалы лота ── */}
      {isOwner ? (
        <CompanyAttachmentsBlock
          token={token}
          lotId={id}
          attachments={attachments}
          onAttachmentsChanged={setAttachments}
        />
      ) : attachments.length > 0 ? (
        <InfoSection title="Материалы лота">
          <AttachmentList attachments={attachments} />
        </InfoSection>
      ) : null}

      {/* ── Блогерская ветка ── */}
      {user.role === 'blogger' && myResponse !== undefined && (
        <>
          {myResponse ? (
            /* «Ваш отклик» — статус + текст + спор */
            <InfoSection title="Ваш отклик">
              <div style={{ marginBottom: 10 }}>
                <ResponseStatusPill status={myResponse.status} />
              </div>
              <p style={{ fontSize: 14, color: 'var(--nm-ink)', lineHeight: 1.6, margin: 0 }}>
                {myResponse.message}
              </p>
              {myResponse.disputeStatus ? (
                <div style={{ marginTop: 12 }}>
                  <StatusBanner
                    variant={myResponse.disputeStatus === 'open' ? 'amber' : 'neutral'}
                    icon={<AlertCircle size={16} />}
                  >
                    {myResponse.disputeStatus === 'open'
                      ? 'Спор на рассмотрении — администратор разберёт ситуацию.'
                      : 'Спор разрешён.'}
                  </StatusBanner>
                </div>
              ) : bloggerCanDispute ? (
                <div style={{ marginTop: 12 }}>
                  <NmButton variant="ghost" size="sm" onClick={() => setBloggerDisputeOpen(true)}>
                    Открыть спор
                  </NmButton>
                </div>
              ) : null}
            </InfoSection>
          ) : (
            <BloggerResponseBlock
              token={token}
              lot={lot}
              onResponded={(r) => setMyResponse(r)}
            />
          )}

          {/* Completed + accepted → оценка компании */}
          {isCompleted && myResponse && (myResponse.status === 'accepted' || myResponse.status === 'disputed') && (
            <InfoSection title="Оценка рекламодателя">
              {bloggerGivenReview ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--nm-ink-2)', fontWeight: 500 }}>
                      Ваша оценка
                    </span>
                    <StarDisplay value={bloggerGivenReview.rating} />
                  </div>
                  {bloggerGivenReview.comment && (
                    <p style={{ fontSize: 13, color: 'var(--nm-ink-2)', margin: 0, lineHeight: 1.5 }}>
                      {bloggerGivenReview.comment}
                    </p>
                  )}
                  {bloggerReceivedReview && (
                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 14,
                        borderTop: '1px solid var(--nm-line)',
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', fontWeight: 500, marginBottom: 6 }}>
                        Отзыв от {bloggerReceivedReview.authorName}
                      </div>
                      <StarDisplay value={bloggerReceivedReview.rating} />
                      {bloggerReceivedReview.comment && (
                        <p style={{ fontSize: 13, color: 'var(--nm-ink-2)', margin: '4px 0 0', lineHeight: 1.5 }}>
                          {bloggerReceivedReview.comment}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {bloggerReceivedReview && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', fontWeight: 500, marginBottom: 6 }}>
                        Отзыв от {bloggerReceivedReview.authorName}
                      </div>
                      <StarDisplay value={bloggerReceivedReview.rating} />
                      {bloggerReceivedReview.comment && (
                        <p style={{ fontSize: 13, color: 'var(--nm-ink-2)', margin: '4px 0 0', lineHeight: 1.5 }}>
                          {bloggerReceivedReview.comment}
                        </p>
                      )}
                    </div>
                  )}
                  <NmButton
                    variant="fill"
                    style={{ width: '100%' }}
                    onClick={() => setBloggerReviewOpen(true)}
                  >
                    Оценить рекламодателя
                  </NmButton>
                </div>
              )}
            </InfoSection>
          )}
        </>
      )}

      {/* ── Компания-владелец: список откликов ── */}
      {isOwner && responses !== null && (
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
            {responsesHeader}
          </h5>
          {responses.length === 0 ? (
            <div
              style={{
                background: 'var(--nm-surface)',
                borderRadius: 'var(--nm-r-card)',
                border: '1px solid var(--nm-line)',
                padding: '20px 15px',
                textAlign: 'center',
                fontSize: 14,
                color: 'var(--nm-ink-2)',
              }}
            >
              Пока нет откликов
            </div>
          ) : (
            <div>
              {acceptError && (
                <div style={{ color: 'var(--nm-red)', marginBottom: 8, fontSize: 13 }}>{acceptError}</div>
              )}
              {responses.map((r) => {
                const bloggerUserId = r.blogger?.userId;
                const given = bloggerUserId ? givenByTarget.get(bloggerUserId) : undefined;
                const received = bloggerUserId ? receivedByAuthor.get(bloggerUserId) : undefined;
                return (
                  <ResponseCard
                    key={r.id}
                    response={r}
                    token={token}
                    lotId={id}
                    lotStatus={lot.status}
                    isCompleted={isCompleted}
                    isOwner={!!isOwner}
                    givenReview={given}
                    receivedReview={received}
                    onAccept={slotsOpen ? (rid) => setConfirmId(rid) : undefined}
                    onReject={slotsOpen ? handleReject : undefined}
                    onReviewDone={(_targetId, _rating) => void reloadReviews()}
                    onDisputeOpened={() => void reloadAfterDispute()}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <NmButton variant="ghost" style={{ width: '100%' }} onClick={onBack}>
          Назад
        </NmButton>
      </div>

      {/* ── Модалки ── */}

      {showCompleteConfirm && (
        <Modal
          header={<Modal.Header />}
          open={showCompleteConfirm}
          onOpenChange={(open) => { if (!open) setShowCompleteConfirm(false); }}
        >
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Title level="3" weight="2" style={{ marginBottom: 12 }}>Подтвердите завершение</Title>
            <p style={{ color: 'var(--nm-ink-2)', marginBottom: 20, fontSize: 14, lineHeight: 1.5 }}>
              Лот перейдёт в статус «Ожидает выплаты». Это действие необратимо.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <NmButton
                variant="ghost"
                style={{ flex: 1, ...(completing ? { opacity: 0.5, pointerEvents: 'none' } : {}) }}
                disabled={completing}
                onClick={() => setShowCompleteConfirm(false)}
              >
                Отмена
              </NmButton>
              <NmButton
                variant="fill"
                style={{ flex: 1, ...(completing ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}
                disabled={completing}
                onClick={handleComplete}
              >
                {completing ? '…' : 'Завершить'}
              </NmButton>
            </div>
          </div>
        </Modal>
      )}

      {rejectAfterDisputeId && (
        <Modal
          header={<Modal.Header />}
          open={!!rejectAfterDisputeId}
          onOpenChange={(open) => { if (!open) { setRejectAfterDisputeId(null); setRejectAfterDisputeError(null); } }}
        >
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Title level="3" weight="2" style={{ marginBottom: 12 }}>Отклонить блогера?</Title>
            <p style={{ color: 'var(--nm-ink-2)', marginBottom: 20, fontSize: 14, lineHeight: 1.5 }}>
              Блогер будет отклонён, а лот вернётся в ленту для новых откликов.
            </p>
            {rejectAfterDisputeError && (
              <p style={{ color: 'var(--nm-red)', fontSize: 13, marginBottom: 12 }}>
                {rejectAfterDisputeError}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <NmButton
                variant="ghost"
                style={{ flex: 1, ...(rejectingAfterDispute ? { opacity: 0.5, pointerEvents: 'none' } : {}) }}
                disabled={rejectingAfterDispute}
                onClick={() => { setRejectAfterDisputeId(null); setRejectAfterDisputeError(null); }}
              >
                Отмена
              </NmButton>
              <NmButton
                variant="fill"
                style={{ flex: 1, ...(rejectingAfterDispute ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}
                disabled={rejectingAfterDispute}
                onClick={() => void handleRejectAfterDispute()}
              >
                {rejectingAfterDispute ? '…' : 'Отклонить'}
              </NmButton>
            </div>
          </div>
        </Modal>
      )}

      {confirmId && (
        <Modal
          header={<Modal.Header />}
          open={!!confirmId}
          onOpenChange={(open) => { if (!open) setConfirmId(null); }}
        >
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Title level="3" weight="2" style={{ marginBottom: 12 }}>Выбрать этого блогера?</Title>
            <p style={{ color: 'var(--nm-ink-2)', marginBottom: 20, fontSize: 14, lineHeight: 1.5 }}>
              {acceptedCount + 1 >= slotsNeeded
                ? 'Все слоты будут заполнены — лот перейдёт в статус «В работе».'
                : `Останется ${slotsNeeded - acceptedCount - 1} из ${slotsNeeded} слотов.`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <NmButton
                variant="ghost"
                style={{ flex: 1, ...(accepting ? { opacity: 0.5, pointerEvents: 'none' } : {}) }}
                disabled={accepting}
                onClick={() => setConfirmId(null)}
              >
                Отмена
              </NmButton>
              <NmButton
                variant="fill"
                style={{ flex: 1, ...(accepting ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}
                disabled={accepting}
                onClick={() => handleAccept(confirmId)}
              >
                {accepting ? '…' : 'Подтвердить'}
              </NmButton>
            </div>
          </div>
        </Modal>
      )}

      {/* Форма отзыва блогера на компанию */}
      <Modal
        header={<Modal.Header />}
        open={bloggerReviewOpen}
        onOpenChange={(o) => { if (!o) setBloggerReviewOpen(false); }}
      >
        <div style={{ padding: '0 20px 32px' }}>
          <Title level="3" weight="2" style={{ marginBottom: 16 }}>
            Оценить рекламодателя {lot.company.name}
          </Title>
          <ReviewForm
            token={token}
            lotId={id}
            onDone={(_rating) => {
              setBloggerReviewOpen(false);
              void reloadReviews();
            }}
          />
        </div>
      </Modal>

      {/* Форма спора блогера */}
      {bloggerCanDispute && myResponse && (
        <Modal
          header={<Modal.Header />}
          open={bloggerDisputeOpen}
          onOpenChange={(o) => { if (!o) setBloggerDisputeOpen(false); }}
        >
          <div style={{ padding: '0 20px 32px' }}>
            <Title level="3" weight="2" style={{ marginBottom: 16 }}>
              Открыть спор
            </Title>
            <DisputeForm
              token={token}
              lotId={id}
              responseId={myResponse.id}
              role="blogger"
              onSuccess={() => {
                setBloggerDisputeOpen(false);
                void reloadAfterDispute();
              }}
            />
          </div>
        </Modal>
      )}

      {/* ReviewsModal — список отзывов о компании */}
      {companyUserId && (
        <ReviewsModal
          token={token}
          userId={companyUserId}
          open={companyReviewsOpen}
          onClose={() => setCompanyReviewsOpen(false)}
        />
      )}
    </div>
  );
}
