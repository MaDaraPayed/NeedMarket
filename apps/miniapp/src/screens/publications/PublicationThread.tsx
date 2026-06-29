import { useEffect, useRef, useState } from 'react';
import { Spinner, Placeholder } from '@telegram-apps/telegram-ui';
import { AlertTriangle } from 'lucide-react';
import type { PublicationThreadDto, PublicationThreadMessageDto, TicketMessageDto } from '../../api';
import {
  fetchPublicationThread,
  sendPublicationMessage,
  uploadSupportFile,
  MAX_UPLOAD_BYTES,
} from '../../api';
import { useMainButton } from '../../useMainButton';
import { Button } from '../../components/Button';
import { MessageBubble } from '../../components/MessageBubble';
import { MessageComposer } from '../../components/MessageComposer';
import type { PendingAttachment } from '../../components/MessageComposer';

const ATTACH_MAX_BYTES = MAX_UPLOAD_BYTES;

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

// PublicationThreadMessageDto структурно совместим с TicketMessageDto — те же поля.
function toTicketMsg(m: PublicationThreadMessageDto): TicketMessageDto {
  return m as unknown as TicketMessageDto;
}

export function PublicationThread({
  token,
  pubId,
  pubTitle,
  onBack,
}: {
  token: string;
  pubId: string;
  pubTitle: string | null;
  onBack: () => void;
}) {
  const [thread, setThread] = useState<PublicationThreadDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetchPublicationThread(token, pubId)
        .then((t) => { if (!cancelled) setThread(t); })
        .catch((e) => { if (!cancelled && !thread) setError((e as Error).message); });
    }

    load();
    const intervalId = setInterval(() => { if (!cancelled) load(); }, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, pubId]);

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
    if (file.size > ATTACH_MAX_BYTES) { setSendError('Файл больше 48 МБ'); return; }
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
      const msg = await sendPublicationMessage(token, pubId, {
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
    text: sending ? 'Отправляем...' : 'Отправить',
    isEnabled: canSend,
    isVisible: !!thread,
    isLoaderVisible: sending,
    onClick: sendMessage,
  });

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <Button variant="ghost" size="sm" onClick={onBack} style={{ marginBottom: 16 }}>
          ← Назад
        </Button>
        <Placeholder header="Не удалось загрузить" description={error}>
          <AlertTriangle size={48} color="var(--nm-amber)" />
        </Placeholder>
      </div>
    );
  }

  if (!thread) {
    return (
      <div style={{ padding: 16 }}>
        <Button variant="ghost" size="sm" onClick={onBack} style={{ marginBottom: 16 }}>
          ← Назад
        </Button>
        <Placeholder description="Загружаем тред...">
          <Spinner size="l" />
        </Placeholder>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      {/* Шапка */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--nm-line)',
          background: 'var(--nm-surface)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={onBack} style={{ flexShrink: 0 }}>
            ← Назад
          </Button>
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
              {pubTitle ?? 'Тред с администратором'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--nm-ink-3)', marginTop: 2 }}>
              Личная переписка с администратором
            </div>
          </div>
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
              lineHeight: 1.5,
            }}
          >
            Напишите сообщение администратору.
            <br />
            Он ответит в этом треде.
          </div>
        )}

        {thread.messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={toTicketMsg(msg)}
            isMe={!msg.fromAdmin}
            senderName="Администратор"
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
        placeholder="Сообщение администратору..."
        error={sendError}
      />
    </div>
  );
}
