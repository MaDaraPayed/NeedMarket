// Дев: VITE_API_URL не задан → API_URL = '' → запросы идут относительно origin
// и попадают в Vite dev-proxy (см. vite.config.ts) → один туннель на фронт.
// Прод: VITE_API_URL задан (адрес Railway) → ходим на абсолютный адрес.
const API_URL = import.meta.env.VITE_API_URL ?? '';

// Контракт API (типы DTO, роль, входные формы) — из общего пакета @needmarket/shared.
// Реэкспортируем, чтобы экраны продолжали импортировать их из '../api' без правок.
export type {
  Role,
  LinkedAccount,
  BloggerProfile,
  CompanyProfile,
  ApiUser,
  BloggerProfileInput,
  CompanyProfileInput,
  LogoContentType,
  Lot,
  LotStatus,
  LotCompanyBrief,
  LotAttachmentDto,
  CreateLotInput,
  AdminLotSummary,
  AdminBloggerBrief,
  Response as LotResponse,
  ResponseStatus,
  ResponseBloggerBrief,
  CreateResponseInput,
  ReviewDto,
  ReviewGiven,
  ReviewReceived,
  CreateReviewInput,
  SavedSearchDto,
  CreateSavedSearchInput,
  UpdateSavedSearchInput,
  DisputeDto,
  DisputeReason,
  DisputeStatus,
  DisputeResolution,
  CreateDisputeInput,
  AdminDisputeDto,
  ResolveDisputeInput,
  SupportTicketType,
  SupportTicketStatus,
  SupportTicketListItemDto,
  SupportTicketDto,
  SupportTicketThreadDto,
  TicketMessageDto,
  TicketAttachmentDto,
  CreateSupportTicketInput,
  CreateTicketMessageInput,
  AdminSupportUserDto,
  AdminSupportTicketListItemDto,
  AdminTicketAuthorDto,
  AdminSupportTicketThreadDto,
  AdminUpdateTicketInput,
  AdminUserCardDto,
  PlatformSettingsDto,
  // Типы профиля блогера
  AudienceGender,
  CollabFormat,
  BloggerTier,
} from '@needmarket/shared';

export {
  DISPUTE_REASONS,
  DISPUTE_RESOLUTIONS,
  SUPPORT_TICKET_TYPES,
  SUPPORT_TICKET_STATUSES,
  // Лейблы профиля блогера
  AUDIENCE_GENDER_LABELS,
  COLLAB_FORMAT_LABELS,
  BLOGGER_TIER_LABELS,
  FORMATS,
} from '@needmarket/shared';

import type {
  Role,
  ApiUser,
  BloggerProfileInput,
  CompanyProfileInput,
  LogoContentType,
  Lot,
  LotAttachmentDto,
  CreateLotInput,
  AdminLotSummary,
  Response as LotResponse,
  ReviewDto,
  SavedSearchDto,
  CreateSavedSearchInput,
  UpdateSavedSearchInput,
  DisputeDto,
  DisputeResolution,
  AdminDisputeDto,
  CreateDisputeInput,
  SupportTicketListItemDto,
  SupportTicketDto,
  SupportTicketThreadDto,
  CreateSupportTicketInput,
  CreateTicketMessageInput,
  TicketMessageDto,
  AdminSupportUserDto,
  AdminSupportTicketListItemDto,
  AdminSupportTicketThreadDto,
  AdminUserCardDto,
  PlatformSettingsDto,
} from '@needmarket/shared';

/** Абсолютный URL медиа из относительного /media/... (учитывает VITE_API_URL). */
export function resolveMediaUrl(path: string): string {
  return `${API_URL}${path}`;
}

/** Меняем сырой initData на наш JWT + пользователя. */
export async function authWithTelegram(
  initData: string,
): Promise<{ ok: true; token: string; user: ApiUser } | { ok: false; status: number }> {
  const res = await fetch(`${API_URL}/auth/telegram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json()) as { token: string; user: ApiUser };
  return { ok: true, ...data };
}

/** Берём пользователя С БЭКЕНДА по нашему JWT. */
export async function fetchMe(token: string): Promise<ApiUser> {
  const res = await fetch(`${API_URL}/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /me failed: ${res.status}`);
  const data = (await res.json()) as { user: ApiUser };
  return data.user;
}

async function putJson(path: string, token: string, body: unknown): Promise<ApiUser> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
  const data = (await res.json()) as { user: ApiUser };
  return data.user;
}

/** Проставляем роль (один раз). */
export function updateRole(token: string, role: Role): Promise<ApiUser> {
  return putJson('/me/role', token, { role });
}

/** Создаём/обновляем профиль под текущую роль. */
export function updateProfile(
  token: string,
  body: BloggerProfileInput | CompanyProfileInput,
): Promise<ApiUser> {
  return putJson('/me/profile', token, body);
}

/** Загружаем логотип компании (base64 без data-URL префикса). */
export async function uploadCompanyLogo(
  token: string,
  contentType: LogoContentType,
  dataBase64: string,
): Promise<ApiUser> {
  const res = await fetch(`${API_URL}/me/profile/logo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ contentType, data: dataBase64 }),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Загрузка не удалась: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { user: ApiUser };
  return data.user;
}

/** Загружаем аватар блогера (base64 без data-URL префикса). */
export async function uploadBloggerAvatar(
  token: string,
  contentType: LogoContentType,
  dataBase64: string,
): Promise<ApiUser> {
  const res = await fetch(`${API_URL}/me/profile/avatar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ contentType, data: dataBase64 }),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Загрузка не удалась: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { user: ApiUser };
  return data.user;
}

// ───────────────────────── Лоты ─────────────────────────

async function authedJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

/** Создаём лот (только компания). Возвращает созданный лот. */
export async function createLot(token: string, input: CreateLotInput): Promise<Lot> {
  const res = await fetch(`${API_URL}/lots`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось создать лот: HTTP ${res.status}`);
  }
  return ((await res.json()) as { lot: Lot }).lot;
}

export interface LotsFilter {
  // Мультивыбор: ?category=X&category=Y → бэкенд делает hasSome.
  categories?: string[];
  platform?: string;
  limit?: number;
  offset?: number;
  hideResponded?: boolean;
}

/** Лента активных лотов (для блогера), с фильтрами и пагинацией. */
export async function fetchLots(token: string, filter: LotsFilter = {}): Promise<Lot[]> {
  const params = new URLSearchParams();
  if (filter.categories?.length) {
    for (const c of filter.categories) params.append('category', c);
  }
  if (filter.platform) params.set('platform', filter.platform);
  if (filter.limit != null) params.set('limit', String(filter.limit));
  if (filter.offset != null) params.set('offset', String(filter.offset));
  if (filter.hideResponded) params.set('hideResponded', 'true');
  const qs = params.toString();
  const data = await authedJson<{ lots: Lot[] }>(`/lots${qs ? `?${qs}` : ''}`, token);
  return data.lots;
}

/** Один лот детально. */
export async function fetchLot(token: string, id: string): Promise<Lot> {
  const data = await authedJson<{ lot: Lot }>(`/lots/${id}`, token);
  return data.lot;
}

/** Лоты текущей компании. */
export async function fetchMyLots(token: string): Promise<Lot[]> {
  const data = await authedJson<{ lots: Lot[] }>('/me/lots', token);
  return data.lots;
}

// ───────────────────────── Отклики ─────────────────────────

async function postJson<T>(path: string, token: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `POST ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Блогер откликается на лот. */
export async function createResponse(token: string, lotId: string, message: string): Promise<LotResponse> {
  const data = await postJson<{ response: LotResponse }>(`/lots/${lotId}/responses`, token, { message });
  return data.response;
}

/** Компания получает список откликов на свой лот. */
export async function fetchLotResponses(token: string, lotId: string): Promise<LotResponse[]> {
  const data = await authedJson<{ responses: LotResponse[] }>(`/lots/${lotId}/responses`, token);
  return data.responses;
}

/** Блогер — мои отклики. */
export async function fetchMyResponses(token: string): Promise<LotResponse[]> {
  const data = await authedJson<{ responses: LotResponse[] }>('/me/responses', token);
  return data.responses;
}

/** Компания принимает отклик. Возвращает обновлённый лот. */
export async function acceptResponse(
  token: string,
  lotId: string,
  responseId: string,
): Promise<{ id: string; status: string; slotsNeeded: number }> {
  const data = await postJson<{ lot: { id: string; status: string; slotsNeeded: number } }>(
    `/lots/${lotId}/responses/${responseId}/accept`,
    token,
  );
  return data.lot;
}

/** Компания отклоняет отклик. */
export async function rejectResponse(
  token: string,
  lotId: string,
  responseId: string,
): Promise<LotResponse> {
  const data = await postJson<{ response: LotResponse }>(
    `/lots/${lotId}/responses/${responseId}/reject`,
    token,
  );
  return data.response;
}

/** Компания отклоняет блогера в окне ожидания (awaitingCompanyDecision=true). */
export async function rejectResponseAfterDispute(
  token: string,
  lotId: string,
  responseId: string,
): Promise<LotResponse> {
  const data = await postJson<{ response: LotResponse }>(
    `/lots/${lotId}/responses/${responseId}/reject-after-dispute`,
    token,
  );
  return data.response;
}

/** Компания выбирает «Продолжить» — блогер остаётся, лот → in_progress. */
export async function continueAfterDispute(
  token: string,
  lotId: string,
  responseId: string,
): Promise<{ id: string; status: string }> {
  const data = await postJson<{ lot: { id: string; status: string } }>(
    `/lots/${lotId}/responses/${responseId}/continue-after-dispute`,
    token,
  );
  return data.lot;
}

// ───────────────────────── Вложения лота ─────────────────────────

/** Компания загружает вложение к лоту (base64). */
export async function uploadLotAttachment(
  token: string,
  lotId: string,
  contentType: string,
  dataBase64: string,
  fileName?: string,
): Promise<LotAttachmentDto> {
  const res = await fetch(`${API_URL}/lots/${lotId}/attachments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ contentType, data: dataBase64, fileName }),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Загрузка не удалась: HTTP ${res.status}`);
  }
  return ((await res.json()) as { attachment: LotAttachmentDto }).attachment;
}

/** Компания удаляет вложение. */
export async function deleteLotAttachment(
  token: string,
  lotId: string,
  attachmentId: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/lots/${lotId}/attachments/${attachmentId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Удаление не удалось: HTTP ${res.status}`);
  }
}

// ───────────────────────── Отзывы ─────────────────────────

/** Оставить отзыв на лот (auth). targetId обязателен для компании-владельца. */
export async function createReview(
  token: string,
  lotId: string,
  rating: number,
  comment?: string,
  targetId?: string,
): Promise<{ id: string; rating: number; comment: string | null; targetId: string; createdAt: string }> {
  const body: Record<string, unknown> = { rating };
  if (comment) body.comment = comment;
  if (targetId) body.targetId = targetId;
  const data = await postJson<{ review: { id: string; rating: number; comment: string | null; targetId: string; createdAt: string } }>(
    `/lots/${lotId}/reviews`,
    token,
    body,
  );
  return data.review;
}

/** Список отзывов о пользователе (последние 20). */
export async function fetchProfileReviews(token: string, userId: string): Promise<ReviewDto[]> {
  const data = await authedJson<{ reviews: ReviewDto[] }>(`/profiles/${userId}/reviews`, token);
  return data.reviews;
}

// ───────────────────────── Админ ─────────────────────────

/** Список лотов по статусу (по умолчанию awaiting_payment). */
export async function fetchAdminLots(
  token: string,
  status = 'awaiting_payment',
): Promise<AdminLotSummary[]> {
  const res = await fetch(`${API_URL}/admin/lots?status=${encodeURIComponent(status)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /admin/lots failed: ${res.status}`);
  return ((await res.json()) as { lots: AdminLotSummary[] }).lots;
}

/** Активировать лот (awaiting_payment → active). */
export async function activateLot(token: string, lotId: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_URL}/admin/lots/${lotId}/activate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Активация не удалась: HTTP ${res.status}`);
  }
  return ((await res.json()) as { lot: { id: string; status: string } }).lot;
}

/** Обновляем настройки текущего пользователя (например, флаг уведомлений). */
export async function patchSettings(
  token: string,
  settings: { notificationsEnabled: boolean },
): Promise<ApiUser> {
  const res = await fetch(`${API_URL}/me/settings`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`PATCH /me/settings failed: ${res.status}`);
  const data = (await res.json()) as { user: ApiUser };
  return data.user;
}

/** Компания удаляет лот (awaiting_payment/active). */
export async function deleteLot(token: string, lotId: string): Promise<void> {
  const res = await fetch(`${API_URL}/lots/${lotId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

/** Компания отмечает проект выполненным (active/in_progress → awaiting_payout). */
export async function completeLot(token: string, lotId: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_URL}/lots/${lotId}/complete`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось завершить лот: HTTP ${res.status}`);
  }
  return ((await res.json()) as { lot: { id: string; status: string } }).lot;
}

// ───────────────────────── Сохранённые поиски ─────────────────────────

/** Список сохранённых поисков блогера. */
export async function fetchSavedSearches(token: string): Promise<SavedSearchDto[]> {
  const data = await authedJson<{ savedSearches: SavedSearchDto[] }>('/me/saved-searches', token);
  return data.savedSearches;
}

/** Создать сохранённый поиск. */
export async function createSavedSearch(token: string, input: CreateSavedSearchInput): Promise<SavedSearchDto> {
  const res = await fetch(`${API_URL}/me/saved-searches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `POST /me/saved-searches failed: ${res.status}`);
  }
  return ((await res.json()) as { savedSearch: SavedSearchDto }).savedSearch;
}

/** Обновить сохранённый поиск (критерии и/или isActive). */
export async function updateSavedSearch(token: string, id: string, input: UpdateSavedSearchInput): Promise<SavedSearchDto> {
  const res = await fetch(`${API_URL}/me/saved-searches/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `PATCH /me/saved-searches/${id} failed: ${res.status}`);
  }
  return ((await res.json()) as { savedSearch: SavedSearchDto }).savedSearch;
}

/** Удалить сохранённый поиск. */
export async function deleteSavedSearch(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/me/saved-searches/${id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `DELETE /me/saved-searches/${id} failed: ${res.status}`);
  }
}

/** Админ закрывает лот (awaiting_payout → completed). */
export async function closeLot(token: string, lotId: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_URL}/admin/lots/${lotId}/close`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось закрыть лот: HTTP ${res.status}`);
  }
  return ((await res.json()) as { lot: { id: string; status: string } }).lot;
}

// ───────────────────────── Споры ─────────────────────────

/** Открыть спор (company или blogger — участник пары). */
export async function createDispute(
  token: string,
  lotId: string,
  input: CreateDisputeInput,
): Promise<DisputeDto> {
  const res = await fetch(`${API_URL}/lots/${lotId}/disputes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось открыть спор: HTTP ${res.status}`);
  }
  return ((await res.json()) as { dispute: DisputeDto }).dispute;
}

/** Список споров для администратора. */
export async function fetchAdminDisputes(
  token: string,
  status: 'open' | 'resolved' = 'open',
): Promise<AdminDisputeDto[]> {
  const res = await fetch(`${API_URL}/admin/disputes?status=${encodeURIComponent(status)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /admin/disputes failed: ${res.status}`);
  return ((await res.json()) as { disputes: AdminDisputeDto[] }).disputes;
}

/** Справочник пользователей по роли для администратора. */
export async function fetchAdminUsers(
  token: string,
  params: { role: 'blogger' | 'company'; search?: string; sort?: 'date_desc' | 'date_asc' },
): Promise<AdminUserCardDto[]> {
  const qs = new URLSearchParams({ role: params.role });
  if (params.search) qs.set('search', params.search);
  if (params.sort) qs.set('sort', params.sort);
  const res = await fetch(`${API_URL}/admin/users?${qs.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /admin/users failed: ${res.status}`);
  return ((await res.json()) as { users: AdminUserCardDto[] }).users;
}

/** Выгрузить всех блогеров в Excel — файл доставляется ботом в Telegram-чат администратора. */
export async function exportBloggersToExcel(token: string): Promise<{ ok: boolean; count: number }> {
  const res = await fetch(`${API_URL}/admin/users/export`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `POST /admin/users/export failed: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; count: number }>;
}

// ───────────────────────── Поддержка ─────────────────────────

/** Загрузить файл для тикета поддержки → получить fileId. */
export async function uploadSupportFile(
  token: string,
  contentType: string,
  dataBase64: string,
  fileName: string,
): Promise<{ fileId: string; fileName: string; mimeType: string }> {
  const res = await fetch(`${API_URL}/support/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ contentType, data: dataBase64, fileName }),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Загрузка не удалась: HTTP ${res.status}`);
  }
  return (await res.json()) as { fileId: string; fileName: string; mimeType: string };
}

/** Список моих тикетов (сортировка desc по lastMessageAt). */
export async function fetchSupportTickets(token: string): Promise<SupportTicketListItemDto[]> {
  const data = await authedJson<{ tickets: SupportTicketListItemDto[] }>('/support/tickets', token);
  return data.tickets;
}

/** Создать тикет поддержки (с первым сообщением). */
export async function createSupportTicket(
  token: string,
  input: CreateSupportTicketInput,
): Promise<SupportTicketDto> {
  const res = await fetch(`${API_URL}/support/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось создать тикет: HTTP ${res.status}`);
  }
  return ((await res.json()) as { ticket: SupportTicketDto }).ticket;
}

/** Тред тикета (мета + сообщения). Пометит lastReadByUserAt. */
export async function fetchSupportTicket(token: string, id: string): Promise<SupportTicketThreadDto> {
  const data = await authedJson<{ ticket: SupportTicketThreadDto }>(`/support/tickets/${id}`, token);
  return data.ticket;
}

/** Добавить сообщение в открытый тикет. */
export async function createTicketMessage(
  token: string,
  ticketId: string,
  input: CreateTicketMessageInput,
): Promise<TicketMessageDto> {
  const res = await fetch(`${API_URL}/support/tickets/${ticketId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось отправить сообщение: HTTP ${res.status}`);
  }
  return ((await res.json()) as { message: TicketMessageDto }).message;
}

// ───────────────────────── Поддержка (Admin) ─────────────────────────

/** Список пользователей с тикетами (для администратора). */
export async function fetchAdminSupportUsers(token: string): Promise<AdminSupportUserDto[]> {
  const data = await authedJson<{ users: AdminSupportUserDto[] }>('/admin/support/users', token);
  return data.users;
}

/** Список тикетов (для администратора), с необязательным фильтром userId/status. */
export async function fetchAdminSupportTickets(
  token: string,
  params: { userId?: string; status?: 'open' | 'closed' } = {},
): Promise<AdminSupportTicketListItemDto[]> {
  const qs = new URLSearchParams();
  if (params.userId) qs.set('userId', params.userId);
  if (params.status) qs.set('status', params.status);
  const q = qs.toString();
  const data = await authedJson<{ tickets: AdminSupportTicketListItemDto[] }>(
    `/admin/support/tickets${q ? `?${q}` : ''}`,
    token,
  );
  return data.tickets;
}

/** Тред тикета для администратора. Помечает lastReadByAdminAt. */
export async function fetchAdminSupportTicket(
  token: string,
  ticketId: string,
): Promise<AdminSupportTicketThreadDto> {
  const data = await authedJson<{ ticket: AdminSupportTicketThreadDto }>(
    `/admin/support/tickets/${ticketId}`,
    token,
  );
  return data.ticket;
}

/** Администратор отправляет сообщение в тикет. */
export async function createAdminTicketMessage(
  token: string,
  ticketId: string,
  input: CreateTicketMessageInput,
): Promise<TicketMessageDto> {
  const res = await fetch(`${API_URL}/admin/support/tickets/${ticketId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось отправить ответ: HTTP ${res.status}`);
  }
  return ((await res.json()) as { message: TicketMessageDto }).message;
}

/** Администратор закрывает или открывает тикет. */
export async function updateAdminTicket(
  token: string,
  ticketId: string,
  status: 'open' | 'closed',
): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_URL}/admin/support/tickets/${ticketId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось обновить тикет: HTTP ${res.status}`);
  }
  return ((await res.json()) as { ticket: { id: string; status: string } }).ticket;
}

/** Администратор разрешает спор. */
export async function resolveAdminDispute(
  token: string,
  disputeId: string,
  resolution: DisputeResolution,
  note?: string,
): Promise<{ id: string; status: string; resolution: string }> {
  const res = await fetch(`${API_URL}/admin/disputes/${disputeId}/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ resolution, ...(note ? { note } : {}) }),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось разрешить спор: HTTP ${res.status}`);
  }
  return ((await res.json()) as { dispute: { id: string; status: string; resolution: string } }).dispute;
}

/** Получить платформенные настройки (только для администратора). */
export async function fetchAdminSettings(token: string): Promise<PlatformSettingsDto> {
  const res = await fetch(`${API_URL}/admin/settings`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /admin/settings failed: ${res.status}`);
  return ((await res.json()) as { settings: PlatformSettingsDto }).settings;
}

/** Обновить платформенные настройки (только для администратора). */
export async function updateAdminSettings(
  token: string,
  patch: Partial<PlatformSettingsDto>,
): Promise<PlatformSettingsDto> {
  const res = await fetch(`${API_URL}/admin/settings`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `PATCH /admin/settings failed: ${res.status}`);
  }
  return ((await res.json()) as { settings: PlatformSettingsDto }).settings;
}

// ───────────────────────── Публикации ─────────────────────────

export type {
  PublicationStatus,
  PublicationReplyMode,
  PublicationMediaKind,
  PublicationAttachmentDto,
  PublicationRatingAggregateDto,
  PublicationThreadAttachmentDto,
  PublicationThreadMessageDto,
  PublicationThreadDto,
  PublicationCommentAuthorDto,
  PublicationCommentDto,
  PublicationListItemDto,
  PublicationDetailDto,
} from '@needmarket/shared';

import type {
  PublicationListItemDto,
  PublicationDetailDto,
  PublicationRatingAggregateDto,
  PublicationThreadDto,
  PublicationThreadMessageDto,
  PublicationCommentDto,
} from '@needmarket/shared';

/** Лента публикаций (published + в аудитории текущего пользователя). */
export async function fetchPublications(token: string): Promise<PublicationListItemDto[]> {
  const data = await authedJson<{ publications: PublicationListItemDto[] }>('/publications', token);
  return data.publications;
}

/** Одна публикация — помечает прочитанной. */
export async function fetchPublicationDetail(token: string, id: string): Promise<PublicationDetailDto> {
  const data = await authedJson<{ publication: PublicationDetailDto }>(`/publications/${id}`, token);
  return data.publication;
}

/** Поставить/изменить оценку ★1–5. */
export async function ratePublication(
  token: string,
  id: string,
  value: number,
): Promise<PublicationRatingAggregateDto> {
  const res = await fetch(`${API_URL}/publications/${id}/rating`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось выставить оценку: HTTP ${res.status}`);
  }
  return ((await res.json()) as { rating: PublicationRatingAggregateDto }).rating;
}

/** Приватный тред (replyMode='private'): загрузить сообщения + пометить прочитанным. */
export async function fetchPublicationThread(
  token: string,
  id: string,
): Promise<PublicationThreadDto> {
  const data = await authedJson<{ thread: PublicationThreadDto }>(
    `/publications/${id}/thread`,
    token,
  );
  return data.thread;
}

/** Приватный тред: отправить сообщение (текст и/или вложения). */
export async function sendPublicationMessage(
  token: string,
  id: string,
  input: {
    body?: string;
    attachments?: Array<{ fileId: string; fileName: string; mimeType: string }>;
  },
): Promise<PublicationThreadMessageDto> {
  const res = await fetch(`${API_URL}/publications/${id}/thread/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось отправить сообщение: HTTP ${res.status}`);
  }
  return ((await res.json()) as { message: PublicationThreadMessageDto }).message;
}

/** Публичные комментарии (replyMode='public'): список. */
export async function fetchPublicationComments(
  token: string,
  id: string,
): Promise<PublicationCommentDto[]> {
  const data = await authedJson<{ comments: PublicationCommentDto[] }>(
    `/publications/${id}/comments`,
    token,
  );
  return data.comments;
}

/** Публичные комментарии: добавить. */
export async function postPublicationComment(
  token: string,
  id: string,
  body: string,
): Promise<{ id: string }> {
  const res = await fetch(`${API_URL}/publications/${id}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось добавить комментарий: HTTP ${res.status}`);
  }
  return ((await res.json()) as { comment: { id: string } }).comment;
}

/** Публичные комментарии: удалить (автор или администратор). */
export async function deletePublicationComment(
  token: string,
  pubId: string,
  commentId: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/publications/${pubId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось удалить комментарий: HTTP ${res.status}`);
  }
}

// ───────────────────────── Публикации (Admin) ─────────────────────────

export type {
  AdminPublicationListItemDto,
  AdminPublicationDetailDto,
  AdminPublicationThreadListItemDto,
  AdminPublicationThreadDto,
  PublicationAudienceSummaryDto,
  PublicationAttachmentInput,
  CreatePublicationInput,
  UpdatePublicationInput,
} from '@needmarket/shared';

import type {
  AdminPublicationListItemDto,
  AdminPublicationDetailDto,
  AdminPublicationThreadListItemDto,
  AdminPublicationThreadDto,
  CreatePublicationInput,
  UpdatePublicationInput,
} from '@needmarket/shared';

/** Список всех публикаций для администратора. */
export async function fetchAdminPublications(token: string): Promise<AdminPublicationListItemDto[]> {
  const data = await authedJson<{ publications: AdminPublicationListItemDto[] }>('/admin/publications', token);
  return data.publications;
}

/** Полный DTO публикации для администратора. */
export async function fetchAdminPublication(token: string, id: string): Promise<AdminPublicationDetailDto> {
  const data = await authedJson<{ publication: AdminPublicationDetailDto }>(`/admin/publications/${id}`, token);
  return data.publication;
}

/** Создать публикацию (черновик или сразу опубликовать). */
export async function createAdminPublication(
  token: string,
  input: CreatePublicationInput,
): Promise<{ id: string }> {
  const res = await fetch(`${API_URL}/admin/publications`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось создать публикацию: HTTP ${res.status}`);
  }
  return ((await res.json()) as { publication: { id: string } }).publication;
}

/** Обновить публикацию (черновик — все поля; опубликованная — только replyMode). */
export async function updateAdminPublication(
  token: string,
  id: string,
  patch: UpdatePublicationInput,
): Promise<void> {
  const res = await fetch(`${API_URL}/admin/publications/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось обновить публикацию: HTTP ${res.status}`);
  }
}

/** Удалить публикацию (каскадно). */
export async function deleteAdminPublication(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/publications/${id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось удалить публикацию: HTTP ${res.status}`);
  }
}

/** Загрузить медиафайл для публикации → получить fileId. */
export async function uploadPublicationMedia(
  token: string,
  contentType: string,
  dataBase64: string,
  fileName: string,
): Promise<{ fileId: string; fileName: string; mimeType: string }> {
  const res = await fetch(`${API_URL}/admin/publications/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ contentType, data: dataBase64, fileName }),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Загрузка медиа не удалась: HTTP ${res.status}`);
  }
  return (await res.json()) as { fileId: string; fileName: string; mimeType: string };
}

/** Список тредов публикации (admin). */
export async function fetchAdminPublicationThreads(
  token: string,
  pubId: string,
): Promise<AdminPublicationThreadListItemDto[]> {
  const data = await authedJson<{ threads: AdminPublicationThreadListItemDto[] }>(
    `/admin/publications/${pubId}/threads`,
    token,
  );
  return data.threads;
}

/** Один тред публикации (admin) — помечает прочитанным. */
export async function fetchAdminPublicationThread(
  token: string,
  pubId: string,
  userId: string,
): Promise<AdminPublicationThreadDto> {
  const data = await authedJson<{ thread: AdminPublicationThreadDto }>(
    `/admin/publications/${pubId}/threads/${userId}`,
    token,
  );
  return data.thread;
}

/** Ответить в треде публикации (admin → user). */
export async function sendAdminPublicationMessage(
  token: string,
  pubId: string,
  userId: string,
  input: {
    body?: string;
    attachments?: Array<{ fileId: string; fileName: string; mimeType: string }>;
  },
): Promise<PublicationThreadMessageDto> {
  const res = await fetch(`${API_URL}/admin/publications/${pubId}/threads/${userId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? `Не удалось отправить сообщение: HTTP ${res.status}`);
  }
  return ((await res.json()) as { message: PublicationThreadMessageDto }).message;
}
