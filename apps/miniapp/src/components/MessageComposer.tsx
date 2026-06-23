import type React from 'react';
import { Paperclip, Send } from 'lucide-react';
import { Spinner } from '@telegram-apps/telegram-ui';

export type PendingAttachment = { fileId: string; fileName: string; mimeType: string };

const BODY_MAX = 4000;
const ATTACH_MAX_COUNT = 10;

export function MessageComposer({
  inputText,
  onTextChange,
  pendingAttachments,
  onRemoveAttachment,
  fileInputRef,
  onFileChange,
  uploading,
  sending,
  canSend,
  onSend,
  placeholder = 'Сообщение...',
  error,
}: {
  inputText: string;
  onTextChange: (text: string) => void;
  pendingAttachments: PendingAttachment[];
  onRemoveAttachment: (fileId: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileChange: React.ChangeEventHandler<HTMLInputElement>;
  uploading: boolean;
  sending: boolean;
  canSend: boolean;
  onSend: () => void;
  placeholder?: string;
  error?: string | null;
}) {
  return (
    <div
      style={{
        borderTop: '1px solid var(--nm-line)',
        background: 'var(--nm-surface)',
        padding: '8px 12px',
        flexShrink: 0,
      }}
    >
      {pendingAttachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {pendingAttachments.map((att) => (
            <div
              key={att.fileId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 12,
                background: 'var(--nm-surface-2)',
                fontSize: 12,
                color: 'var(--nm-ink)',
              }}
            >
              <Paperclip size={12} style={{ flexShrink: 0 }} />
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {att.fileName}
              </span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(att.fileId)}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: 'var(--nm-ink-2)',
                  fontSize: 15,
                  padding: 0,
                  lineHeight: 1,
                }}
                aria-label="удалить"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="*"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || pendingAttachments.length >= ATTACH_MAX_COUNT}
          style={{
            border: 'none',
            background: 'none',
            cursor: uploading ? 'default' : 'pointer',
            color: 'var(--nm-blue)',
            padding: '6px 2px',
            flexShrink: 0,
            opacity: uploading || pendingAttachments.length >= ATTACH_MAX_COUNT ? 0.4 : 1,
            display: 'flex',
            alignItems: 'center',
          }}
          aria-label="прикрепить файл"
        >
          {uploading ? <Spinner size="s" /> : <Paperclip size={20} />}
        </button>

        <textarea
          value={inputText}
          onChange={(e) => onTextChange(e.target.value.slice(0, BODY_MAX))}
          placeholder={placeholder}
          rows={1}
          className="nm-field-input"
          style={{
            flex: 1,
            width: 'auto',
            resize: 'none',
            padding: '8px 12px',
            fontSize: 14,
            lineHeight: 1.4,
            maxHeight: 120,
            overflowY: 'auto',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
        />

        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          style={{
            border: 'none',
            background: canSend ? 'var(--nm-blue)' : 'var(--nm-line)',
            color: canSend ? '#fff' : 'var(--nm-ink-3)',
            borderRadius: '50%',
            width: 36,
            height: 36,
            cursor: canSend ? 'pointer' : 'default',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s',
            boxShadow: canSend ? 'var(--nm-sh-btn)' : 'none',
          }}
          aria-label="отправить"
        >
          {sending ? <Spinner size="s" /> : <Send size={16} />}
        </button>
      </div>

      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 12, marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}
