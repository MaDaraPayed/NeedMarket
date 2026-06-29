import type { Db } from '../types';

// Резолвер аудитории публикации (batch, без N+1).
// Возвращает множество userId получателей:
//   (пользователи с role ∈ audienceRoles) ∪ (audienceUserIds).
export async function resolveAudienceUserIds(
  db: Db,
  audienceRoles: string[],
  audienceUserIds: string[],
): Promise<string[]> {
  const idSet = new Set<string>(audienceUserIds);

  if (audienceRoles.length > 0) {
    const usersPerRole = await Promise.all(
      audienceRoles.map((role) =>
        db.user.findMany({ where: { role: role as 'blogger' | 'company' } }),
      ),
    );
    for (const users of usersPerRole) {
      for (const u of users) idSet.add(u.id);
    }
  }

  return [...idSet];
}

// Проверяет, входит ли userId в аудиторию публикации.
export function isInAudience(
  userId: string,
  userRole: string | null,
  audienceRoles: string[],
  audienceUserIds: string[],
): boolean {
  if (audienceUserIds.includes(userId)) return true;
  if (userRole && audienceRoles.includes(userRole)) return true;
  return false;
}
