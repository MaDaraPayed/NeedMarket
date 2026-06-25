// Контракт отклика блогера на лот. Источник истины для фронта и бэка.
import type { LotStatus } from './lot';
import type { AudienceGender, CollabFormat, BloggerTier } from './blogger';

export type ResponseStatus = 'pending' | 'accepted' | 'rejected' | 'disputed';

// Краткая инфа о лоте, прикладываемая к отклику для блогера.
export interface ResponseLotBrief {
  title: string;
  status: LotStatus;
  budget: number;
  deadline: string; // ISO
}

// Краткая инфа о блогере для карточки отклика.
// Компания видит все публичные поля (соцсети, аудитория, статистика, форматы, прайс, опыт, тир).
// Приватные поля (phone/email/birthDate/termsAcceptedAt/marketingOptIn) сервер НЕ кладёт
// в компанийский DTO — они присутствуют только когда данные пришли от администратора.
export interface ResponseBloggerBrief {
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

  // Вычисляемый тир (из максимальных подписчиков).
  tier?: BloggerTier | null;

  // Аудитория.
  audienceGender?: AudienceGender | null;
  audienceAge?: string | null;
  audienceGeo?: string | null;
  audienceLanguage?: string | null;

  // Статистика.
  reachStories?: number | null;
  reachReels?: number | null;
  reachPosts?: number | null;
  engagementRate?: number | null;
  statsScreenshotUrl?: string | null;

  // Форматы сотрудничества.
  formats?: CollabFormat[];

  // Прайс (KZT).
  priceStories?: number | null;
  priceStoriesSeries?: number | null;
  priceReels?: number | null;
  pricePost?: number | null;
  priceEvent?: number | null;
  priceUgc?: number | null;
  avgPrice3m?: number | null;

  // Опыт.
  brandsWorkedWith?: string | null;
  bestCaseUrl?: string | null;

  // Дополнительно.
  barterAvailable?: boolean;
  travelAvailable?: boolean;
  preferredAdvertiserCategories?: string[];

  // Приватные поля — только в ответах администратора (в компанийском DTO отсутствуют).
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  termsAcceptedAt?: string | null;
  marketingOptIn?: boolean;
}

// Отклик в ответе API.
export interface Response {
  id: string;
  lotId: string;
  bloggerId: string;
  message: string;
  status: ResponseStatus;
  createdAt: string; // ISO
  blogger?: ResponseBloggerBrief; // присутствует в GET /lots/:id/responses
  lot?: ResponseLotBrief; // присутствует в GET /me/responses
  disputeStatus?: 'open' | 'resolved' | null; // статус спора по этому отклику
  resolvedFavorCompany?: boolean; // true: спор resolved favor_company
  awaitingCompanyDecision?: boolean; // true: компания ещё не приняла решение (лот awaiting_decision)
}

// Тело POST /lots/:id/responses.
export interface CreateResponseInput {
  message: string;
}

// Ответ GET /lots/:id/responses.
export interface LotResponsesResponse {
  responses: Response[];
}

// Ответ GET /me/responses.
export interface MyResponsesResponse {
  responses: Response[];
}
