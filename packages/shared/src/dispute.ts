// Типы споров — контракт между фронтом и бэком.

export type DisputeStatus = 'open' | 'resolved';

export type DisputeReason =
  | 'not_delivered'
  | 'poor_quality'
  | 'no_contact'
  | 'no_payment'
  | 'terms_violation'
  | 'other';

export type DisputeResolution = 'favor_company' | 'favor_blogger' | 'partial';

// RU-лейблы причин спора (фронт + бэк единый источник).
export const DISPUTE_REASONS = [
  { value: 'not_delivered' as const, label: 'Не выполнил работу' },
  { value: 'poor_quality' as const, label: 'Плохое качество' },
  { value: 'no_contact' as const, label: 'Пропал / не выходит на связь' },
  { value: 'no_payment' as const, label: 'Не платит' },
  { value: 'terms_violation' as const, label: 'Нарушил условия' },
  { value: 'other' as const, label: 'Другое' },
] as const;

// RU-лейблы исходов разрешения (фронт + бэк единый источник).
export const DISPUTE_RESOLUTIONS = [
  { value: 'favor_company' as const, label: 'В пользу рекламодателя' },
  { value: 'favor_blogger' as const, label: 'В пользу блогера' },
  { value: 'partial' as const, label: 'Частично' },
] as const;

// Вложение к спору.
export interface DisputeAttachmentRef {
  fileId: string;
  fileName: string;
  mimeType: string;
}

// Спор в ответе API (факт спора; без приватных контактов).
export interface DisputeDto {
  id: string;
  lotId: string;
  responseId: string;
  raisedById: string;
  againstId: string;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  resolution?: DisputeResolution | null;
  createdAt: string; // ISO
}

// Тело POST /lots/:id/disputes.
export interface CreateDisputeInput {
  responseId: string;
  reason: DisputeReason;
  description: string;
  attachments?: DisputeAttachmentRef[];
}

// Полный DTO спора для администратора (GET /admin/disputes).
export interface AdminDisputeDto {
  id: string;
  lot: { id: string; title: string; budget: number; commission: number; payout: number };
  company: { name: string; contact: string | null; telegramUsername: string | null };
  blogger: { displayName: string; contact: string | null; telegramUsername: string | null };
  raisedById: string;
  raisedByRole: 'company' | 'blogger';
  reason: DisputeReason;
  description: string;
  attachments: DisputeAttachmentRef[];
  createdAt: string; // ISO
  status: DisputeStatus;
  resolution: DisputeResolution | null;
  resolutionNote: string | null;
  resolvedAt: string | null; // ISO
}

// Тело POST /admin/disputes/:id/resolve.
export interface ResolveDisputeInput {
  resolution: DisputeResolution;
  note?: string;
}
