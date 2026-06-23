import { useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { SUPPORT_TICKET_TYPES } from '../../api';
import type { SupportTicketType, SupportTicketDto } from '../../api';
import { uploadSupportFile, createSupportTicket } from '../../api';
import { SelectChip } from '../../components/SelectChip';
import { FormSection, UploadZone } from '../../components/FormControls';
import { Button } from '../../components/Button';
import { useMainButton } from '../../useMainButton';

const SUBJECT_MAX = 200;
const BODY_MAX = 4000;
const ATTACH_MAX_COUNT = 10;
const ATTACH_MAX_BYTES = 10 * 1024 * 1024;

type PendingAttachment = { fileId: string; fileName: string; mimeType: string };

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

export function SupportCreateForm({
  token,
  onCreated,
  onCancel,
}: {
  token: string;
  onCreated: (ticket: SupportTicketDto) => void;
  onCancel: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [type, setType] = useState<SupportTicketType>('request');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent = body.trim().length > 0 || attachments.length > 0;
  const canSubmit = subject.trim().length > 0 && hasContent && !loading && !uploading;

  async function pickAndUpload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > ATTACH_MAX_BYTES) { setError('Файл больше 10 МБ'); return; }
    if (attachments.length >= ATTACH_MAX_COUNT) { setError(`Максимум ${ATTACH_MAX_COUNT} вложений`); return; }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'application/octet-stream';
      const result = await uploadSupportFile(token, mimeType, base64, file.name);
      setAttachments((prev) => [...prev, result]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeAttachment(fileId: string) {
    setAttachments((prev) => prev.filter((a) => a.fileId !== fileId));
  }

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const ticket = await createSupportTicket(token, {
        subject: subject.trim(),
        type,
        message: {
          body: body.trim() || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
        },
      });
      onCreated(ticket);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  useMainButton({
    text: loading ? 'Отправляем...' : 'Отправить',
    isEnabled: canSubmit,
    isVisible: true,
    isLoaderVisible: loading,
    onClick: submit,
  });

  return (
    <div style={{ padding: 16, paddingBottom: 32 }}>
      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--nm-ink)', letterSpacing: '-.3px' }}>
          Новая заявка
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
          Отмена
        </Button>
      </div>

      {/* Тема */}
      <div style={{ marginBottom: 15 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--nm-ink-2)', marginBottom: 8 }}>
          Тема
        </div>
        <input
          className="nm-field-input"
          placeholder="Коротко опишите вопрос"
          value={subject}
          onChange={(e) => setSubject(e.target.value.slice(0, SUBJECT_MAX))}
        />
        <div style={{ fontSize: 11, color: 'var(--nm-ink-3)', textAlign: 'right', marginTop: 4 }}>
          {subject.length}/{SUBJECT_MAX}
        </div>
      </div>

      {/* Тип */}
      <FormSection title="Тип">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SUPPORT_TICKET_TYPES.map(({ value, label }) => (
            <SelectChip
              key={value}
              label={label}
              selected={type === value}
              onClick={() => setType(value)}
            />
          ))}
        </div>
      </FormSection>

      {/* Сообщение */}
      <div style={{ marginTop: 20, marginBottom: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--nm-ink-2)', marginBottom: 8 }}>
          Сообщение
          <em style={{ fontStyle: 'normal', color: 'var(--nm-ink-3)', fontWeight: 500 }}>
            {' '}· необязательно
          </em>
        </div>
        <textarea
          className="nm-field-input nm-field-textarea"
          placeholder="Опишите ситуацию подробно..."
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
          rows={4}
        />
        <div style={{ fontSize: 11, color: 'var(--nm-ink-3)', textAlign: 'right', marginTop: 4, marginBottom: 4 }}>
          {body.length}/{BODY_MAX}
        </div>
      </div>

      {/* Вложения */}
      <div style={{ marginTop: 20 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="*"
          style={{ display: 'none' }}
          onChange={(e) => void pickAndUpload(e.target.files?.[0])}
        />

        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {attachments.map((att) => (
              <div
                key={att.fileId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 10,
                  background: 'var(--nm-surface-2)',
                  color: 'var(--nm-ink)',
                }}
              >
                <Paperclip size={14} style={{ flexShrink: 0, color: 'var(--nm-ink-2)' }} />
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {att.fileName}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.fileId)}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: 'var(--nm-ink-2)',
                    fontSize: 18,
                    lineHeight: 1,
                    padding: 0,
                  }}
                  aria-label="удалить"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <UploadZone
          label="Вложения"
          optional
          description={`Любой формат, до 10 МБ — максимум ${ATTACH_MAX_COUNT} файлов${uploading ? ' · загружаем...' : ''}`}
          onClick={() => {
            if (!uploading && attachments.length < ATTACH_MAX_COUNT) {
              fileInputRef.current?.click();
            }
          }}
        />
      </div>

      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 13, marginTop: 8, marginBottom: 4 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Button
          variant="fill"
          disabled={!canSubmit}
          onClick={() => void submit()}
          style={{ width: '100%' }}
        >
          {loading ? 'Отправляем...' : 'Отправить'}
        </Button>
      </div>
    </div>
  );
}
