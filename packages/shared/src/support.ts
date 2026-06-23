// Типы поддержки/чата с администрацией — контракт между фронтом и бэком.

export type SupportTicketType = 'request' | 'idea';
export type SupportTicketStatus = 'open' | 'closed';

// RU-лейблы типа тикета (единый источник для фронта и бэка).
export const SUPPORT_TICKET_TYPES = [
  { value: 'request' as const, label: 'Заявка' },
  { value: 'idea' as const, label: 'Идея' },
] as const;

// RU-лейблы статуса тикета.
export const SUPPORT_TICKET_STATUSES = [
  { value: 'open' as const, label: 'Открыт' },
  { value: 'closed' as const, label: 'Закрыт' },
] as const;

// Вложение к сообщению тикета.
export interface TicketAttachmentDto {
  id: string;
  fileId: string;
  fileName: string;
  mimeType: string;
}

// Сообщение в тикете.
export interface TicketMessageDto {
  id: string;
  fromAdmin: boolean;
  body: string | null;
  attachments: TicketAttachmentDto[];
  createdAt: string; // ISO
}

// Краткий DTO тикета для списка (GET /support/tickets).
export interface SupportTicketListItemDto {
  id: string;
  subject: string;
  type: SupportTicketType;
  status: SupportTicketStatus;
  lastMessageAt: string; // ISO
  hasUnread: boolean;
}

// Полный DTO тикета (без сообщений — только мета).
export interface SupportTicketDto {
  id: string;
  subject: string;
  type: SupportTicketType;
  status: SupportTicketStatus;
  createdAt: string; // ISO
  lastMessageAt: string; // ISO
}

// Тред тикета (мета + сообщения) — GET /support/tickets/:id.
export interface SupportTicketThreadDto extends SupportTicketDto {
  messages: TicketMessageDto[];
}

// Тело POST /support/tickets.
export interface CreateSupportTicketInput {
  subject: string;
  type: SupportTicketType;
  message: {
    body?: string;
    attachments?: Array<{ fileId: string; fileName: string; mimeType: string }>;
  };
}

// Тело POST /support/tickets/:id/messages.
export interface CreateTicketMessageInput {
  body?: string;
  attachments?: Array<{ fileId: string; fileName: string; mimeType: string }>;
}

// ─── Admin-side support DTOs ─────────────────────────────────────────────────

// Пользователь с тикетами — строка в GET /admin/support/users.
export interface AdminSupportUserDto {
  userId: string;
  name: string;
  role: 'blogger' | 'company' | null;
  ticketCount: number;
  openCount: number;
  lastActivityAt: string; // ISO
  hasUnread: boolean; // есть хотя бы один тикет с непрочитанным (для админа)
}

// Тикет в списке — строка в GET /admin/support/tickets.
export interface AdminSupportTicketListItemDto {
  id: string;
  subject: string;
  type: SupportTicketType;
  status: SupportTicketStatus;
  lastMessageAt: string; // ISO
  hasUnread: boolean; // lastMessageAt > lastReadByAdminAt AND последнее — не fromAdmin
}

// Автор тикета (для треда).
export interface AdminTicketAuthorDto {
  userId: string;
  name: string;
  role: 'blogger' | 'company' | null;
  contact: string | null;
  username: string | null; // Telegram username
}

// Тред тикета для администратора — GET /admin/support/tickets/:id.
export interface AdminSupportTicketThreadDto {
  id: string;
  subject: string;
  type: SupportTicketType;
  status: SupportTicketStatus;
  createdAt: string; // ISO
  lastMessageAt: string; // ISO
  author: AdminTicketAuthorDto;
  messages: TicketMessageDto[];
}

// Тело PATCH /admin/support/tickets/:id.
export interface AdminUpdateTicketInput {
  status: 'open' | 'closed';
}
