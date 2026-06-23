import type { Db } from '../types';

export interface RatingSummary {
  ratingAvg: number | null;
  ratingCount: number;
}

// Один groupBy по targetId → Map<userId, RatingSummary>. Без N+1.
// Округление avg до 1 знака; null если отзывов нет (пустой Set → пустая Map).
export async function fetchRatingMap(
  db: Db,
  userIds: string[],
): Promise<Map<string, RatingSummary>> {
  const map = new Map<string, RatingSummary>();
  if (userIds.length === 0) return map;

  const unique = [...new Set(userIds)];
  const rows = await db.review.groupBy({
    by: ['targetId'],
    where: { targetId: { in: unique } },
    _avg: { rating: true },
    _count: { rating: true },
  });

  for (const row of rows) {
    const avg = row._avg.rating;
    map.set(row.targetId, {
      ratingAvg: avg !== null ? Math.round(avg * 10) / 10 : null,
      ratingCount: row._count.rating,
    });
  }
  return map;
}
