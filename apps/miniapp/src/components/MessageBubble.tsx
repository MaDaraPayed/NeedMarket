import type { TicketAttachmentDto, TicketMessageDto } from '../api';
import { resolveMediaUrl } from '../api';

function AttachmentItem({ att, isMe }: { att: TicketAttachmentDto; isMe: boolean }) {
  const dl = resolveMediaUrl(
    `/media/${att.fileId}?name=${encodeURIComponent(att.fileName)}&type=${encodeURIComponent(att.mimeType)}`,
  );
  if (att.mimeType.startsWith('image/')) {
    return (
      <a href={dl} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
        <img
          src={resolveMediaUrl(`/media/${att.fileId}`)}
          alt={att.fileName}
          style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, display: 'block', marginTop: 4 }}
        />
      </a>
    );
  }
  return (
    <a
      href={dl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderRadius: 8,
        background: isMe ? 'rgba(255,255,255,0.18)' : 'var(--nm-surface-2)',
        color: 'inherit',
        textDecoration: 'none',
        fontSize: 13,
        marginTop: 4,
        maxWidth: 220,
        wordBreak: 'break-all',
      }}
    >
      📄 {att.fileName}
    </a>
  );
}

export function MessageBubble({
  msg,
  isMe,
  senderName,
}: {
  msg: TicketMessageDto;
  isMe: boolean;
  senderName?: string;
}) {
  const time = new Date(msg.createdAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isMe ? 'flex-end' : 'flex-start',
        marginBottom: 8,
      }}
    >
      <div
        style={{
          maxWidth: '80%',
          padding: '8px 12px',
          borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isMe ? 'var(--nm-blue)' : 'var(--nm-surface)',
          color: isMe ? '#fff' : 'var(--nm-ink)',
          boxShadow: isMe ? 'none' : 'var(--nm-sh-card)',
        }}
      >
        {!isMe && senderName && (
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--nm-blue)' }}>
            {senderName}
          </div>
        )}

        {msg.body && (
          <div style={{ fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {msg.body}
          </div>
        )}

        {msg.attachments.map((att) => (
          <AttachmentItem key={att.id} att={att} isMe={isMe} />
        ))}

        <div
          style={{
            fontSize: 10,
            opacity: 0.6,
            textAlign: isMe ? 'right' : 'left',
            marginTop: 4,
          }}
        >
          {time}
        </div>
      </div>
    </div>
  );
}
