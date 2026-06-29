import { useEffect, useRef, useState } from 'react';
import { Spinner, Placeholder, Switch } from '@telegram-apps/telegram-ui';
import { AlertTriangle, Megaphone, Star, MessageCircle, MessageSquare, Trash2, X } from 'lucide-react';
import { SafeMarkdown } from '../../components/SafeMarkdown';
import { Button } from '../../components/Button';
import { SelectChip } from '../../components/SelectChip';
import { MessageBubble } from '../../components/MessageBubble';
import { MessageComposer } from '../../components/MessageComposer';
import type { PendingAttachment } from '../../components/MessageComposer';
import { useMainButton } from '../../useMainButton';
import type {
  TicketMessageDto,
  AdminPublicationListItemDto,
  AdminPublicationDetailDto,
  AdminPublicationThreadListItemDto,
  AdminPublicationThreadDto,
  PublicationThreadMessageDto,
  PublicationCommentDto,
  AdminUserCardDto,
} from '../../api';
import {
  fetchAdminPublications,
  fetchAdminPublication,
  createAdminPublication,
  updateAdminPublication,
  deleteAdminPublication,
  uploadPublicationMedia,
  fetchAdminPublicationThreads,
  fetchAdminPublicationThread,
  sendAdminPublicationMessage,
  fetchPublicationComments,
  deletePublicationComment,
  fetchAdminUsers,
  resolveMediaUrl,
} from '../../api';

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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

const MEDIA_MAX_BYTES = 50 * 1024 * 1024;
const ATTACH_MAX_BYTES = 10 * 1024 * 1024;

// ─── типы навигации ──────────────────────────────────────────────────────────

type AdminPubView =
  | { name: 'list' }
  | { name: 'composer'; pubId?: string }
  | { name: 'detail'; pubId: string }
  | { name: 'threads'; pubId: string; pubTitle: string | null }
  | { name: 'thread'; pubId: string; pubTitle: string | null; userId: string; userName: string };

// ─── интерфейсы ─────────────────────────────────────────────────────────────

interface SelectedUser {
  userId: string;
  name: string;
  role: string | null;
}

interface PubMedia {
  fileId: string;
  fileName: string;
  mimeType: string;
}

// ─── СПИСОК ПУБЛИКАЦИЙ ───────────────────────────────────────────────────────

function PubCard({
  pub,
  onClick,
}: {
  pub: AdminPublicationListItemDto;
  onClick: () => void;
}) {
  const isDraft = pub.status === 'draft';
  const statusColor = isDraft ? 'var(--nm-ink-3)' : 'var(--nm-green)';
  const dateStr = pub.publishedAt ? formatDate(pub.publishedAt) : formatDate(pub.createdAt);

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--nm-surface)',
        borderRadius: 'var(--nm-r-card)',
        padding: '12px 14px',
        marginBottom: 10,
        cursor: 'pointer',
        boxShadow: 'var(--nm-sh-card)',
        border: '1px solid var(--nm-line)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 'var(--nm-r-badge)',
            border: `1px solid ${statusColor}`,
            color: statusColor,
          }}
        >
          {isDraft ? 'Черновик' : 'Опубликовано'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--nm-ink-3)', marginLeft: 'auto' }}>
          {dateStr}
        </span>
      </div>

      <div
        style={{
          fontWeight: 600,
          fontSize: 15,
          color: pub.title ? 'var(--nm-ink)' : 'var(--nm-ink-2)',
          fontStyle: pub.title ? 'normal' : 'italic',
          marginBottom: 6,
        }}
      >
        {pub.title ?? 'Без заголовка'}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          fontSize: 12,
          color: 'var(--nm-ink-2)',
          flexWrap: 'wrap',
        }}
      >
        {pub.ratingsEnabled && pub.rating.ratingCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Star size={11} fill="#FFD700" color="#FFD700" strokeWidth={0} />
            {pub.rating.avgRating?.toFixed(1)} ({pub.rating.ratingCount})
          </span>
        )}
        {pub.replyMode === 'private' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <MessageCircle size={11} />
            {pub.threadCount} тред.
          </span>
        )}
        {pub.replyMode === 'public' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <MessageSquare size={11} />
            {pub.commentCount} комм.
          </span>
        )}
        {pub.attachmentCount > 0 && <span>{pub.attachmentCount} медиа</span>}
        <span>
          {pub.audience.roles.map((r) => (r === 'blogger' ? 'Блогеры' : 'Рекламодатели')).join(', ') || '—'}
          {pub.audience.explicitUserCount > 0 && ` +${pub.audience.explicitUserCount}`}
        </span>
      </div>
    </div>
  );
}

function PubListView({
  token,
  onOpen,
  onCreate,
}: {
  token: string;
  onOpen: (pubId: string) => void;
  onCreate: () => void;
}) {
  const [pubs, setPubs] = useState<AdminPublicationListItemDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPubs(null);
    setError(null);
    fetchAdminPublications(token)
      .then((p) => { if (!cancelled) setPubs(p); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div>
      <Button variant="fill" style={{ width: '100%', marginBottom: 16 }} onClick={onCreate}>
        + Создать публикацию
      </Button>

      {error && (
        <Placeholder header="Ошибка" description={error}>
          <AlertTriangle size={40} color="var(--nm-amber)" />
        </Placeholder>
      )}

      {!error && !pubs && (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spinner size="l" />
        </div>
      )}

      {!error && pubs && pubs.length === 0 && (
        <Placeholder header="Нет публикаций" description="Создайте первую публикацию для пользователей">
          <Megaphone size={40} color="var(--nm-ink-3)" />
        </Placeholder>
      )}

      {!error && pubs && pubs.length > 0 &&
        pubs.map((pub) => (
          <PubCard key={pub.id} pub={pub} onClick={() => onOpen(pub.id)} />
        ))
      }
    </div>
  );
}

// ─── COMPOSER (создание / редактирование черновика) ──────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--nm-ink-2)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function ComposerView({
  token,
  pubId,
  onSaved,
}: {
  token: string;
  pubId?: string;
  onSaved: (id: string) => void;
}) {
  const isEdit = pubId !== undefined;

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [previewTab, setPreviewTab] = useState<'text' | 'preview'>('text');
  const [media, setMedia] = useState<PubMedia[]>([]);

  const [audienceRoles, setAudienceRoles] = useState<string[]>(['blogger', 'company']);
  const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);
  const [originalUserIds, setOriginalUserIds] = useState<string[]>([]);
  const [usersDirty, setUsersDirty] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<AdminUserCardDto[]>([]);
  const [searching, setSearching] = useState(false);

  const [ratingsEnabled, setRatingsEnabled] = useState(false);
  const [replyMode, setReplyMode] = useState<'off' | 'private' | 'public'>('off');

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Загрузка существующей публикации при редактировании
  useEffect(() => {
    if (!isEdit || !pubId) return;
    let cancelled = false;
    setLoading(true);
    fetchAdminPublication(token, pubId)
      .then((pub) => {
        if (cancelled) return;
        setTitle(pub.title ?? '');
        setBody(pub.body);
        setMedia(
          pub.attachments.map((a) => ({
            fileId: a.fileId,
            fileName: a.fileName,
            mimeType: a.mimeType,
          })),
        );
        setAudienceRoles(pub.audienceRoles);
        setOriginalUserIds(pub.audienceUserIds);
        setRatingsEnabled(pub.ratingsEnabled);
        setReplyMode(pub.replyMode as 'off' | 'private' | 'public');
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError((e as Error).message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [token, pubId, isEdit]);

  // Поиск пользователей с дебаунсом 350 мс
  useEffect(() => {
    if (userSearch.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      Promise.all([
        fetchAdminUsers(token, { role: 'blogger', search: userSearch.trim() }),
        fetchAdminUsers(token, { role: 'company', search: userSearch.trim() }),
      ])
        .then(([bloggers, companies]) => {
          if (!cancelled) {
            setSearchResults([...bloggers, ...companies]);
            setSearching(false);
          }
        })
        .catch(() => { if (!cancelled) setSearching(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [token, userSearch]);

  async function handleFileChange(file: File | undefined) {
    if (!file) return;
    setFormError(null);
    if (file.size > MEDIA_MAX_BYTES) { setFormError('Файл больше 50 МБ'); return; }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'application/octet-stream';
      const result = await uploadPublicationMedia(token, mimeType, base64, file.name);
      setMedia((prev) => [...prev, result]);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function toggleRole(role: string) {
    setAudienceRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function addUser(card: AdminUserCardDto) {
    if (selectedUsers.some((u) => u.userId === card.userId)) return;
    setSelectedUsers((prev) => [
      ...prev,
      { userId: card.userId, name: card.name, role: card.role },
    ]);
    setUsersDirty(true);
    setUserSearch('');
    setSearchResults([]);
  }

  function removeUser(userId: string) {
    setSelectedUsers((prev) => prev.filter((u) => u.userId !== userId));
    setUsersDirty(true);
  }

  async function handleSave(publish: boolean) {
    if (!body.trim()) {
      setFormError('Текст публикации не может быть пустым');
      return;
    }
    if (audienceRoles.length === 0 && selectedUsers.length === 0 && originalUserIds.length === 0) {
      setFormError('Укажите хотя бы одну роль или конкретных пользователей');
      return;
    }
    setFormError(null);
    publish ? setPublishing(true) : setSaving(true);
    try {
      // audienceUserIds: если admin трогал список — используем новый; иначе сохраняем оригинал
      const audienceUserIds = usersDirty
        ? selectedUsers.map((u) => u.userId)
        : originalUserIds;

      const input = {
        title: title.trim() || undefined,
        body: body.trim(),
        audienceRoles,
        audienceUserIds,
        ratingsEnabled,
        replyMode,
        attachments: media,
        publish,
      };

      if (isEdit && pubId) {
        await updateAdminPublication(token, pubId, input);
        onSaved(pubId);
      } else {
        const { id } = await createAdminPublication(token, input);
        onSaved(id);
      }
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <Spinner size="l" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Placeholder header="Не удалось загрузить" description={loadError}>
        <AlertTriangle size={40} color="var(--nm-amber)" />
      </Placeholder>
    );
  }

  const isBusy = saving || publishing || uploading;

  return (
    <div style={{ padding: '16px 16px 40px' }}>
      {/* Заголовок */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Заголовок (необязательно)</SectionLabel>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Введите заголовок..."
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 'var(--nm-r-field)',
            border: '1px solid var(--nm-line)',
            background: 'var(--nm-surface)',
            color: 'var(--nm-ink)',
            fontSize: 14,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Текст / Предпросмотр */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <SelectChip
            label="Текст"
            selected={previewTab === 'text'}
            onClick={() => setPreviewTab('text')}
          />
          <SelectChip
            label="Предпросмотр"
            selected={previewTab === 'preview'}
            onClick={() => setPreviewTab('preview')}
          />
        </div>
        {previewTab === 'text' ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Текст публикации (поддерживается Markdown)..."
            rows={10}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 'var(--nm-r-field)',
              border: '1px solid var(--nm-line)',
              background: 'var(--nm-surface)',
              color: 'var(--nm-ink)',
              fontSize: 14,
              outline: 'none',
              resize: 'vertical',
              boxSizing: 'border-box',
              lineHeight: 1.5,
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <div
            style={{
              minHeight: 160,
              padding: '10px 14px',
              borderRadius: 'var(--nm-r-field)',
              border: '1px solid var(--nm-line)',
              background: 'var(--nm-surface)',
            }}
          >
            {body.trim() ? (
              <SafeMarkdown>{body}</SafeMarkdown>
            ) : (
              <div style={{ color: 'var(--nm-ink-3)', fontSize: 14 }}>Нет текста</div>
            )}
          </div>
        )}
      </div>

      {/* Медиа */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Медиа</SectionLabel>
        {media.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {media.map((m, i) => {
              const isImage = m.mimeType.startsWith('image/');
              const url = resolveMediaUrl(`/media/${m.fileId}`);
              return (
                <div
                  key={m.fileId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 'var(--nm-r-card)',
                    background: 'var(--nm-surface)',
                    border: '1px solid var(--nm-line)',
                  }}
                >
                  {isImage ? (
                    <img
                      src={url}
                      alt=""
                      style={{
                        width: 48,
                        height: 48,
                        objectFit: 'cover',
                        borderRadius: 8,
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        background: 'var(--nm-surface-2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontSize: 20,
                      }}
                    >
                      ▶
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: 'var(--nm-ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {m.fileName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--nm-ink-3)' }}>
                      {isImage ? 'Фото' : 'Видео'}
                    </div>
                  </div>
                  <button
                    onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 4,
                      color: 'var(--nm-red)',
                      display: 'flex',
                    }}
                    aria-label="Удалить медиа"
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          style={{ display: 'none' }}
          onChange={(e) => void handleFileChange(e.target.files?.[0])}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 'var(--nm-r-pill)',
            border: '1px solid var(--nm-blue-line)',
            background: 'var(--nm-blue-soft)',
            color: 'var(--nm-blue)',
            fontSize: 13,
            fontWeight: 500,
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? <Spinner size="s" /> : '+ Добавить фото / видео'}
        </button>
      </div>

      {/* Таргетинг — роли */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Аудитория — роли</SectionLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <SelectChip
            label="Блогеры"
            selected={audienceRoles.includes('blogger')}
            onClick={() => toggleRole('blogger')}
          />
          <SelectChip
            label="Рекламодатели"
            selected={audienceRoles.includes('company')}
            onClick={() => toggleRole('company')}
          />
        </div>
      </div>

      {/* Таргетинг — конкретные пользователи */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Конкретные пользователи (опционально)</SectionLabel>

        {/* Сохранённые из оригинала (только в режиме редактирования) */}
        {isEdit && originalUserIds.length > 0 && !usersDirty && (
          <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', marginBottom: 8 }}>
            Сохранено: {originalUserIds.length} польз.
            — добавьте или уберите ниже, чтобы изменить список
          </div>
        )}

        {/* Выбранные пользователи (чипсы) */}
        {selectedUsers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {selectedUsers.map((u) => (
              <span
                key={u.userId}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 'var(--nm-r-pill)',
                  background: 'var(--nm-blue-soft)',
                  border: '1px solid var(--nm-blue-line)',
                  fontSize: 13,
                  color: 'var(--nm-blue)',
                }}
              >
                {u.name}
                <button
                  onClick={() => removeUser(u.userId)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: 1,
                    color: 'var(--nm-blue)',
                    display: 'flex',
                  }}
                  aria-label={`Убрать ${u.name}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Поиск */}
        <input
          type="search"
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          placeholder="Поиск по имени (от 2 символов)..."
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 'var(--nm-r-field)',
            border: '1px solid var(--nm-line)',
            background: 'var(--nm-surface)',
            color: 'var(--nm-ink)',
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {searching && (
          <div style={{ padding: '8px 0', color: 'var(--nm-ink-2)', fontSize: 13 }}>
            Ищем...
          </div>
        )}

        {!searching && searchResults.length > 0 && (
          <div
            style={{
              marginTop: 4,
              borderRadius: 'var(--nm-r-card)',
              border: '1px solid var(--nm-line)',
              background: 'var(--nm-surface)',
              boxShadow: 'var(--nm-sh-card)',
              overflow: 'hidden',
            }}
          >
            {searchResults.slice(0, 6).map((card) => (
              <div
                key={card.userId}
                onClick={() => addUser(card)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--nm-line)',
                  fontSize: 14,
                  color: 'var(--nm-ink)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontWeight: 500 }}>{card.name}</span>
                <span style={{ fontSize: 12, color: 'var(--nm-ink-3)' }}>
                  {card.role === 'blogger' ? 'Блогер' : 'Рекламодатель'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Настройки */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>Настройки</SectionLabel>

        {/* Оценки */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 'var(--nm-r-card)',
            background: 'var(--nm-surface)',
            border: '1px solid var(--nm-line)',
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--nm-ink)' }}>
              Оценки ★
            </div>
            <div style={{ fontSize: 12, color: 'var(--nm-ink-2)', marginTop: 2 }}>
              {ratingsEnabled
                ? 'Пользователи могут ставить оценки'
                : 'Оценки отключены'}
            </div>
          </div>
          <Switch
            checked={ratingsEnabled}
            onChange={() => setRatingsEnabled((v) => !v)}
          />
        </div>

        {/* Режим ответов */}
        <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginBottom: 8 }}>
          Режим ответов
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <SelectChip
            label="Выкл"
            selected={replyMode === 'off'}
            onClick={() => setReplyMode('off')}
          />
          <SelectChip
            label="Личный тред"
            selected={replyMode === 'private'}
            onClick={() => setReplyMode('private')}
          />
          <SelectChip
            label="Публичные"
            selected={replyMode === 'public'}
            onClick={() => setReplyMode('public')}
          />
        </div>
      </div>

      {/* Ошибка */}
      {formError && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--nm-r-field)',
            background: 'var(--nm-red-soft, #fdecea)',
            border: '1px solid var(--nm-red)',
            color: 'var(--nm-red)',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {formError}
        </div>
      )}

      {/* Кнопки */}
      <div style={{ display: 'flex', gap: 10 }}>
        <Button
          variant="ghost"
          style={{ flex: 1 }}
          disabled={isBusy}
          onClick={() => void handleSave(false)}
        >
          {saving ? <Spinner size="s" /> : 'Сохранить черновик'}
        </Button>
        <Button
          variant="fill"
          style={{ flex: 1 }}
          disabled={isBusy}
          onClick={() => void handleSave(true)}
        >
          {publishing ? <Spinner size="s" /> : 'Опубликовать'}
        </Button>
      </div>
    </div>
  );
}

// ─── ДЕТАЛЬНЫЙ ВИД ПУБЛИКАЦИИ ────────────────────────────────────────────────

function PubDetailView({
  token,
  pubId,
  onEdit,
  onDeleted,
  onOpenThreads,
}: {
  token: string;
  pubId: string;
  onEdit: () => void;
  onDeleted: () => void;
  onOpenThreads: (pubTitle: string | null) => void;
}) {
  const [pub, setPub] = useState<AdminPublicationDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<PublicationCommentDto[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [changingMode, setChangingMode] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAdminPublication(token, pubId)
      .then((p) => { if (!cancelled) setPub(p); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [token, pubId]);

  // Поллинг публичных комментариев каждые 5 с
  useEffect(() => {
    if (!pub || pub.replyMode !== 'public') return;
    let cancelled = false;
    const load = () => {
      fetchPublicationComments(token, pubId)
        .then((c) => { if (!cancelled) setComments(c); })
        .catch(() => {});
    };
    load();
    const id = setInterval(() => { if (!cancelled) load(); }, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [token, pubId, pub?.replyMode]);

  async function handlePublish() {
    if (!pub || publishing) return;
    setPublishing(true);
    setActionError(null);
    try {
      await updateAdminPublication(token, pubId, { publish: true });
      setPub((prev) =>
        prev ? { ...prev, status: 'published', publishedAt: new Date().toISOString() } : prev,
      );
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  async function handleChangeReplyMode(mode: 'off' | 'private' | 'public') {
    if (!pub || changingMode || pub.replyMode === mode) return;
    setChangingMode(true);
    setActionError(null);
    try {
      await updateAdminPublication(token, pubId, { replyMode: mode });
      setPub((prev) => prev ? { ...prev, replyMode: mode } : prev);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setChangingMode(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteAdminPublication(token, pubId);
      onDeleted();
    } catch (e) {
      setActionError((e as Error).message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      await deletePublicationComment(token, pubId, commentId);
      setComments((prev) => prev?.filter((c) => c.id !== commentId) ?? null);
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  if (error) {
    return (
      <Placeholder header="Ошибка" description={error}>
        <AlertTriangle size={40} color="var(--nm-amber)" />
      </Placeholder>
    );
  }

  if (!pub) {
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <Spinner size="l" />
      </div>
    );
  }

  const isDraft = pub.status === 'draft';

  return (
    <div style={{ padding: '16px 16px 40px' }}>
      {/* Статус + дата */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 'var(--nm-r-badge)',
            border: `1px solid ${isDraft ? 'var(--nm-ink-3)' : 'var(--nm-green)'}`,
            color: isDraft ? 'var(--nm-ink-3)' : 'var(--nm-green)',
          }}
        >
          {isDraft ? 'Черновик' : 'Опубликовано'}
        </span>
        {pub.publishedAt && (
          <span style={{ fontSize: 12, color: 'var(--nm-ink-2)' }}>
            {formatDate(pub.publishedAt)}
          </span>
        )}
      </div>

      {/* Заголовок */}
      {pub.title && (
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--nm-ink)',
            marginBottom: 12,
            lineHeight: 1.3,
          }}
        >
          {pub.title}
        </div>
      )}

      {/* Тело */}
      <SafeMarkdown>{pub.body}</SafeMarkdown>

      {/* Медиа */}
      {pub.attachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {pub.attachments.map((att) => {
            const src = resolveMediaUrl(`/media/${att.fileId}`);
            if (att.kind === 'video') {
              return (
                <video
                  key={att.id}
                  controls
                  style={{
                    width: '100%',
                    borderRadius: 10,
                    maxHeight: 280,
                    background: '#000',
                    display: 'block',
                  }}
                  preload="metadata"
                >
                  <source src={src} type={att.mimeType} />
                </video>
              );
            }
            return (
              <img
                key={att.id}
                src={src}
                alt={att.fileName}
                style={{
                  width: '100%',
                  borderRadius: 10,
                  objectFit: 'cover',
                  maxHeight: 280,
                  display: 'block',
                }}
              />
            );
          })}
        </div>
      )}

      {/* Сводка настроек */}
      <div
        style={{
          marginTop: 16,
          padding: '12px 14px',
          borderRadius: 'var(--nm-r-card)',
          background: 'var(--nm-surface)',
          border: '1px solid var(--nm-line)',
          fontSize: 13,
          color: 'var(--nm-ink-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}
      >
        <div>
          <b style={{ color: 'var(--nm-ink)' }}>Аудитория: </b>
          {pub.audienceRoles.length > 0
            ? pub.audienceRoles
                .map((r) => (r === 'blogger' ? 'Блогеры' : 'Рекламодатели'))
                .join(', ')
            : '—'}
          {pub.audienceUserIds.length > 0 &&
            ` + ${pub.audienceUserIds.length} конкр. польз.`}
        </div>
        <div>
          <b style={{ color: 'var(--nm-ink)' }}>Оценки: </b>
          {pub.ratingsEnabled
            ? `Вкл · ${pub.rating.ratingCount} оценок${pub.rating.avgRating ? `, avg ${pub.rating.avgRating.toFixed(1)}` : ''}`
            : 'Выкл'}
        </div>
        <div>
          <b style={{ color: 'var(--nm-ink)' }}>Ответы: </b>
          {pub.replyMode === 'off'
            ? 'Выкл'
            : pub.replyMode === 'private'
            ? `Личный тред · ${pub.threadCount} тредов`
            : `Публичные · ${pub.commentCount} комментариев`}
        </div>
      </div>

      {/* Действия */}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isDraft && (
          <>
            <Button variant="ghost" style={{ width: '100%' }} onClick={onEdit}>
              Редактировать черновик
            </Button>
            <Button
              variant="fill"
              style={{ width: '100%' }}
              disabled={publishing}
              onClick={() => void handlePublish()}
            >
              {publishing ? <Spinner size="s" /> : 'Опубликовать'}
            </Button>
          </>
        )}

        {!isDraft && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--nm-ink-2)', marginBottom: 8 }}>
              Режим ответов
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <SelectChip
                label="Выкл"
                selected={pub.replyMode === 'off'}
                onClick={() => void handleChangeReplyMode('off')}
              />
              <SelectChip
                label="Личный тред"
                selected={pub.replyMode === 'private'}
                onClick={() => void handleChangeReplyMode('private')}
              />
              <SelectChip
                label="Публичные"
                selected={pub.replyMode === 'public'}
                onClick={() => void handleChangeReplyMode('public')}
              />
            </div>
          </div>
        )}

        {pub.replyMode === 'private' && (
          <Button
            variant="ghost"
            style={{ width: '100%' }}
            onClick={() => onOpenThreads(pub.title)}
          >
            Треды ({pub.threadCount})
          </Button>
        )}

        {actionError && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--nm-r-field)',
              background: 'var(--nm-red-soft, #fdecea)',
              border: '1px solid var(--nm-red)',
              color: 'var(--nm-red)',
              fontSize: 13,
            }}
          >
            {actionError}
          </div>
        )}

        {!confirmDelete ? (
          <Button
            variant="ghost"
            style={{ width: '100%', color: 'var(--nm-red)', borderColor: 'var(--nm-red)' }}
            onClick={() => setConfirmDelete(true)}
          >
            Удалить публикацию
          </Button>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <Button
              variant="ghost"
              style={{ flex: 1 }}
              onClick={() => setConfirmDelete(false)}
            >
              Отмена
            </Button>
            <Button
              variant="fill"
              style={{ flex: 1, background: 'var(--nm-red)' }}
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? <Spinner size="s" /> : 'Удалить навсегда'}
            </Button>
          </div>
        )}
      </div>

      {/* Публичные комментарии */}
      {pub.replyMode === 'public' && (
        <div style={{ marginTop: 28 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--nm-ink)',
              marginBottom: 12,
            }}
          >
            Комментарии
          </div>
          {!comments ? (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <Spinner size="s" />
            </div>
          ) : comments.length === 0 ? (
            <div
              style={{
                color: 'var(--nm-ink-2)',
                fontSize: 13,
                textAlign: 'center',
                padding: '16px 0',
              }}
            >
              Нет комментариев
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {comments.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--nm-r-card)',
                    background: 'var(--nm-surface)',
                    border: '1px solid var(--nm-line)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--nm-ink)' }}>
                      {c.author.name}
                      {c.author.role && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--nm-ink-3)' }}>
                          {c.author.role === 'blogger' ? 'Блогер' : 'Рекламодатель'}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => void handleDeleteComment(c.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 4,
                        color: 'var(--nm-red)',
                        display: 'flex',
                      }}
                      aria-label="Удалить комментарий"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: 'var(--nm-ink)',
                      lineHeight: 1.4,
                    }}
                  >
                    {c.body}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--nm-ink-3)', marginTop: 4 }}>
                    {relativeTime(c.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── СПИСОК ТРЕДОВ ПУБЛИКАЦИИ ────────────────────────────────────────────────

function PubThreadsView({
  token,
  pubId,
  onOpenThread,
}: {
  token: string;
  pubId: string;
  onOpenThread: (userId: string, userName: string) => void;
}) {
  const [threads, setThreads] = useState<AdminPublicationThreadListItemDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    hasLoadedRef.current = false;

    const load = () => {
      fetchAdminPublicationThreads(token, pubId)
        .then((t) => {
          if (!cancelled) {
            hasLoadedRef.current = true;
            setThreads(t);
          }
        })
        .catch((e) => {
          if (!cancelled && !hasLoadedRef.current) {
            setError((e as Error).message);
          }
        });
    };

    load();
    const id = setInterval(() => { if (!cancelled) load(); }, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [token, pubId]);

  if (error) {
    return (
      <Placeholder header="Ошибка" description={error}>
        <AlertTriangle size={40} color="var(--nm-amber)" />
      </Placeholder>
    );
  }

  if (!threads) {
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <Spinner size="l" />
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 16px',
          color: 'var(--nm-ink-2)',
          fontSize: 14,
        }}
      >
        Нет тредов — пользователи ещё не начали переписку
      </div>
    );
  }

  return (
    <div>
      {threads.map((t) => (
        <div
          key={t.userId}
          onClick={() => onOpenThread(t.userId, t.userName)}
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--nm-r-card)',
            background: 'var(--nm-surface)',
            border: '1px solid var(--nm-line)',
            boxShadow: 'var(--nm-sh-card)',
            marginBottom: 10,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 15,
                color: 'var(--nm-ink)',
                marginBottom: 3,
              }}
            >
              {t.userName}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--nm-ink-2)',
                display: 'flex',
                gap: 10,
              }}
            >
              {t.userRole && (
                <span>
                  {t.userRole === 'blogger' ? 'Блогер' : 'Рекламодатель'}
                </span>
              )}
              <span>{t.messageCount} сообщ.</span>
              <span>{relativeTime(t.lastMessageAt)}</span>
            </div>
          </div>
          {t.hasUnread && (
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

// ─── ВИД ТРЕДА (ADMIN ↔ USER) ────────────────────────────────────────────────

function PubThreadView({
  token,
  pubId,
  userId,
  userName,
}: {
  token: string;
  pubId: string;
  userId: string;
  userName: string;
}) {
  const [thread, setThread] = useState<AdminPublicationThreadDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    hasLoadedRef.current = false;

    const load = () => {
      fetchAdminPublicationThread(token, pubId, userId)
        .then((t) => {
          if (!cancelled) {
            hasLoadedRef.current = true;
            setThread(t);
          }
        })
        .catch((e) => {
          if (!cancelled && !hasLoadedRef.current) {
            setError((e as Error).message);
          }
        });
    };

    load();
    const id = setInterval(() => { if (!cancelled) load(); }, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [token, pubId, userId]);

  useEffect(() => {
    if (thread?.messages.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [thread?.messages.length]);

  const canSend =
    (inputText.trim().length > 0 || pendingAttachments.length > 0) &&
    !sending &&
    !uploading;

  async function pickAndUpload(file: File | undefined) {
    if (!file) return;
    setSendError(null);
    if (file.size > ATTACH_MAX_BYTES) { setSendError('Файл больше 10 МБ'); return; }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'application/octet-stream';
      const result = await uploadPublicationMedia(token, mimeType, base64, file.name);
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
      const msg = await sendAdminPublicationMessage(token, pubId, userId, {
        body: inputText.trim() || undefined,
        attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
      });
      setInputText('');
      setPendingAttachments([]);
      setThread((prev) =>
        prev ? { ...prev, messages: [...prev.messages, msg] } : prev,
      );
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  useMainButton({
    text: sending ? 'Отправляем...' : 'Ответить',
    isEnabled: canSend,
    isVisible: !!thread,
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Мета-шапка треда */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--nm-line)',
          background: 'var(--nm-surface)',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--nm-ink-2)' }}>
          {thread.userRole
            ? thread.userRole === 'blogger'
              ? 'Блогер'
              : 'Рекламодатель'
            : 'Пользователь'}
          {' · '}
          {thread.messages.length} сообщений
        </div>
      </div>

      {/* Сообщения */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          background: 'var(--nm-bg)',
        }}
      >
        {thread.messages.length === 0 && (
          <div
            style={{
              color: 'var(--nm-ink-2)',
              fontSize: 13,
              textAlign: 'center',
              marginTop: 32,
            }}
          >
            Нет сообщений
          </div>
        )}
        {thread.messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg as unknown as TicketMessageDto}
            isMe={msg.fromAdmin}
            senderName={userName}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Композер */}
      <MessageComposer
        inputText={inputText}
        onTextChange={setInputText}
        pendingAttachments={pendingAttachments}
        onRemoveAttachment={(id) =>
          setPendingAttachments((prev) => prev.filter((a) => a.fileId !== id))
        }
        fileInputRef={fileInputRef}
        onFileChange={(e) => void pickAndUpload(e.target.files?.[0])}
        uploading={uploading}
        sending={sending}
        canSend={canSend}
        onSend={() => void sendMessage()}
        placeholder={`Ответ пользователю ${userName}...`}
        error={sendError}
      />
    </div>
  );
}

// ─── КОРНЕВОЙ КОМПОНЕНТ ──────────────────────────────────────────────────────

export function AdminPublicationsPanel({
  token,
  onNestedChange,
}: {
  token: string;
  onNestedChange?: (nested: boolean) => void;
}) {
  const [view, setView] = useState<AdminPubView>({ name: 'list' });

  useEffect(() => {
    onNestedChange?.(view.name !== 'list');
  }, [view.name, onNestedChange]);

  function goBack() {
    switch (view.name) {
      case 'composer':
        setView(view.pubId ? { name: 'detail', pubId: view.pubId } : { name: 'list' });
        break;
      case 'detail':
        setView({ name: 'list' });
        break;
      case 'threads':
        setView({ name: 'detail', pubId: view.pubId });
        break;
      case 'thread':
        setView({ name: 'threads', pubId: view.pubId, pubTitle: view.pubTitle });
        break;
      default:
        break;
    }
  }

  const title =
    view.name === 'composer'
      ? view.pubId
        ? 'Редактировать черновик'
        : 'Новая публикация'
      : view.name === 'detail'
      ? 'Публикация'
      : view.name === 'threads'
      ? `Треды: ${view.pubTitle ?? 'без названия'}`
      : view.name === 'thread'
      ? view.userName
      : '';

  const isThreadView = view.name === 'thread';
  const showHeader = view.name !== 'list';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Шапка навигации */}
      {showHeader && (
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
          overflowY: isThreadView ? 'hidden' : 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {view.name === 'list' && (
          <div style={{ padding: '16px 16px 32px' }}>
            <PubListView
              token={token}
              onOpen={(pubId) => setView({ name: 'detail', pubId })}
              onCreate={() => setView({ name: 'composer' })}
            />
          </div>
        )}

        {view.name === 'composer' && (
          <ComposerView
            token={token}
            pubId={view.pubId}
            onSaved={(id) => setView({ name: 'detail', pubId: id })}
          />
        )}

        {view.name === 'detail' && (
          <PubDetailView
            token={token}
            pubId={view.pubId}
            onEdit={() => setView({ name: 'composer', pubId: view.pubId })}
            onDeleted={() => setView({ name: 'list' })}
            onOpenThreads={(pubTitle) =>
              setView({ name: 'threads', pubId: view.pubId, pubTitle })
            }
          />
        )}

        {view.name === 'threads' && (
          <div style={{ padding: '16px 16px 32px' }}>
            <PubThreadsView
              token={token}
              pubId={view.pubId}
              onOpenThread={(userId, userName) =>
                setView({
                  name: 'thread',
                  pubId: view.pubId,
                  pubTitle: view.pubTitle,
                  userId,
                  userName,
                })
              }
            />
          </div>
        )}

        {view.name === 'thread' && (
          <PubThreadView
            token={token}
            pubId={view.pubId}
            userId={view.userId}
            userName={view.userName}
          />
        )}
      </div>
    </div>
  );
}
