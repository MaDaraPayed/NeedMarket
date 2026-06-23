// Контракт отклика блогера на лот. Источник истины для фронта и бэка.
import type { LotStatus } from './lot';

export type ResponseStatus = 'pending' | 'accepted' | 'rejected' | 'disputed';

// Краткая инфа о лоте, прикладываемая к отклику для блогера.
export interface ResponseLotBrief {
  title: string;
  status: LotStatus;
  budget: number;
  deadline: string; // ISO
}

// Краткая инфа о блогере для карточки отклика (компании).
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
