// Контракт лота между фронтом и бэком — СЕРИАЛИЗОВАННАЯ форма (даты — ISO-строки).
// Источник истины. См. также [[categories]] и [[platforms]].
import type { Category } from './categories';
import type { ReviewGiven, ReviewReceived } from './review';

// Жизненный цикл лота. Сейчас новый лот сразу `active` (оплата/эскроу — Фаза 4,
// `awaiting_payment` зарезервирован). Прочие переходы — поздние фазы.
export type LotStatus =
  | 'draft'
  | 'awaiting_payment'
  | 'active'
  | 'in_progress'
  | 'awaiting_decision'
  | 'awaiting_payout'
  | 'completed'
  | 'cancelled'
  | 'disputed';

// Вложение к лоту (бриф, референс, PDF и т.п.).
export interface LotAttachmentDto {
  id: string;
  mediaUrl: string;    // inline: /media/:fileId (картинки) или /media/:fileId?name=&type= (документы)
  downloadUrl: string; // всегда /media/:fileId?name=&type= → Content-Disposition: attachment
  contentType: string;
  fileName: string | null;
  position: number;
}

// Краткая инфа о компании-владельце, прикладываемая к лоту в ленте/деталях.
export interface LotCompanyBrief {
  name: string;
  logoUrl: string | null; // наш media-URL (/media/:fileId) или null
  userId?: string;         // userId компании (для тапа → ReviewsModal)
  ratingAvg?: number | null;
  ratingCount?: number;
}

// Лот в ответе API.
export interface Lot {
  id: string;
  companyId: string;
  title: string;
  description: string;
  categories: Category[];
  platforms: string[];
  budget: number; // тенге, целое
  deadline: string; // ISO-дата
  requirements: string[];
  status: LotStatus;
  slotsNeeded: number; // сколько блогеров нужно набрать (≥1)
  createdAt: string; // ISO
  company: LotCompanyBrief;
  acceptedCount: number; // сколько откликов принято (без N+1 — batch в toLotDtos)
  hasResponded?: boolean; // присутствует в GET /lots для блогера
  attachments?: LotAttachmentDto[]; // присутствует в GET /lots/:id
  reviewsGiven?: ReviewGiven[];     // присутствует в GET /lots/:id (completed) — что я написал
  reviewsReceived?: ReviewReceived[]; // присутствует в GET /lots/:id (completed) — что написали мне
  myDisputeStatus?: 'open' | 'resolved' | null; // присутствует в GET /lots/:id — статус спора по моей паре
}

// Тело POST /lots (создание лота компанией).
export interface CreateLotInput {
  title: string;
  description: string;
  categories: Category[];
  platforms: string[];
  budget: number;
  deadline: string; // ISO-дата (должна быть в будущем)
  requirements: string[];
  slotsNeeded?: number; // сколько блогеров нужно (дефолт 1, максимум 20)
}

// Ответ GET /lots (лента) и GET /me/lots.
export interface LotListResponse {
  lots: Lot[];
}

// Краткий профиль блогера для списка принятых в payout-DTO.
export interface AdminBloggerBrief {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  city: string | null;
  categories: string[];
  linkedAccounts: Array<{ platform: string; url: string; followers?: number }>;
  contact: string | null;
  telegramUsername: string | null;
  ratingAvg?: number | null;
  ratingCount?: number;
}

// Краткое DTO лота для админ-панели: сводка + данные компании + Telegram-username владельца.
// Для статуса awaiting_payout дополнительно содержит payout-поля и список принятых блогеров.
export interface AdminLotSummary {
  id: string;
  title: string;
  status: LotStatus;
  budget: number;
  deadline: string;
  categories: string[];
  platforms: string[];
  createdAt: string;
  company: {
    name: string;
    contact: string | null;
  };
  ownerTelegramUsername: string | null;
  // Присутствует только для awaiting_payout:
  commission?: number;
  payoutPool?: number;
  acceptedBloggers?: AdminBloggerBrief[];
}
