import type { Response as ResponseDto } from '@needmarket/shared';
import type { Db, ResponseRecord, BloggerProfileRecord, LotRecord } from '../types';
import { fetchRatingMap } from './rating';

// Краткая инфа о блогере, прикладываемая к отклику для компании.
function toBloggerBrief(
  bp: BloggerProfileRecord,
  telegramUsername: string | null,
  ratingAvg?: number | null,
  ratingCount?: number,
) {
  return {
    id: bp.id,
    userId: bp.userId,
    displayName: bp.displayName,
    avatarUrl: bp.avatarFileId ? `/media/${bp.avatarFileId}` : null,
    bio: bp.bio,
    city: bp.city,
    categories: bp.categories,
    linkedAccounts: Array.isArray(bp.linkedAccounts) ? bp.linkedAccounts : [],
    contact: bp.contact,
    telegramUsername,
    ratingAvg: ratingAvg ?? null,
    ratingCount: ratingCount ?? 0,
  };
}

// Отклик → DTO (без блогера, когда не нужен — например /me/responses).
export function toResponseDto(r: ResponseRecord): ResponseDto {
  return {
    id: r.id,
    lotId: r.lotId,
    bloggerId: r.bloggerId,
    message: r.message,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

// Краткая инфа о лоте, прикладываемая к отклику для блогера.
function toLotBrief(lot: LotRecord) {
  return {
    title: lot.title,
    status: lot.status,
    budget: lot.budget,
    deadline: lot.deadline.toISOString(),
  };
}

// Отклики блогера с краткой инфой лота одним запросом (без N+1).
// disputeByResponseId — опциональная карта status спора по responseId.
export async function toResponseDtosWithLot(
  db: Db,
  responses: ResponseRecord[],
  disputeByResponseId?: Map<string, 'open' | 'resolved'>,
): Promise<ResponseDto[]> {
  if (responses.length === 0) return [];
  const ids = [...new Set(responses.map((r) => r.lotId))];
  const lots = await db.lot.findMany({ where: { id: { in: ids } } });
  const byId = new Map(lots.map((l) => [l.id, l]));
  return responses.map((r) => ({
    ...toResponseDto(r),
    disputeStatus: disputeByResponseId?.get(r.id) ?? null,
    lot: byId.get(r.lotId) ? toLotBrief(byId.get(r.lotId)!) : undefined,
  }));
}

// Отклики со списком блогеров + рейтингом одним запросом (без N+1).
// Три отдельных batch-запроса: профили блогеров + users для telegramUsername + groupBy рейтингов.
// disputeByResponseId — опциональная карта status спора по responseId.
// resolvedFavorCompanyIds — Set responseId, по которым спор resolved с resolution=favor_company.
// awaitingDecisionIds — Set responseId, по которым компания ещё не приняла решение.
export async function toResponseDtosWithBlogger(
  db: Db,
  responses: ResponseRecord[],
  disputeByResponseId?: Map<string, 'open' | 'resolved'>,
  resolvedFavorCompanyIds?: Set<string>,
  awaitingDecisionIds?: Set<string>,
): Promise<ResponseDto[]> {
  if (responses.length === 0) return [];
  const bloggerIds = [...new Set(responses.map((r) => r.bloggerId))];
  const profiles = await db.bloggerProfile.findMany({ where: { id: { in: bloggerIds } } });
  const byId = new Map(profiles.map((p) => [p.id, p]));

  // Второй batch: Users для telegramUsername (отдельный запрос, не include).
  const userIds = [...new Set(profiles.map((p) => p.userId))];
  const users = await db.user.findMany({ where: { id: { in: userIds } } });
  const usernameByUserId = new Map(users.map((u) => [u.id, u.username]));

  // Третий batch: рейтинги блогеров (groupBy targetId = userId).
  const ratingMap = await fetchRatingMap(db, userIds);

  return responses.map((r) => {
    const profile = byId.get(r.bloggerId);
    const disputeStatus = disputeByResponseId?.get(r.id) ?? null;
    const resolvedFavorCompany = resolvedFavorCompanyIds?.has(r.id) ? true : undefined;
    const awaitingCompanyDecision = awaitingDecisionIds?.has(r.id) ? true : undefined;
    if (!profile) return { ...toResponseDto(r), disputeStatus, resolvedFavorCompany, awaitingCompanyDecision };
    const rating = ratingMap.get(profile.userId);
    return {
      ...toResponseDto(r),
      disputeStatus,
      resolvedFavorCompany,
      awaitingCompanyDecision,
      blogger: toBloggerBrief(
        profile,
        usernameByUserId.get(profile.userId) ?? null,
        rating?.ratingAvg,
        rating?.ratingCount,
      ),
    };
  });
}
