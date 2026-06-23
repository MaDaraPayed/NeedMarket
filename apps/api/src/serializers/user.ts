import type {
  Db,
  UserRecord,
  BloggerProfileRecord,
  CompanyProfileRecord,
} from '../types';
import { adminTelegramIds } from '../env';
import { fetchRatingMap } from './rating';

// Централизованная сериализация Prisma-записей в DTO ответов: форма /me и профиля,
// готовый logoUrl и корректная сериализация BigInt (telegramId → string).

type ProfileRecord = BloggerProfileRecord | CompanyProfileRecord;
type ProfileDto = ProfileRecord | null;

// Наш media-URL лого (относительный → проходит через тот же origin/прокси).
function logoUrl(fileId: string): string {
  return `/media/${fileId}`;
}

// Профиль наружу: для компании — logoUrl, для блогера — avatarUrl.
// rating* — собственный рейтинг пользователя (опциональные поля, добавляются в toUserDto).
export function toProfileDto(profile: ProfileDto, rating?: { ratingAvg: number | null; ratingCount: number }) {
  if (!profile) return profile;
  const ratingFields = {
    ratingAvg: rating?.ratingAvg ?? null,
    ratingCount: rating?.ratingCount ?? 0,
  };
  if ('logoFileId' in profile) {
    return { ...profile, logoUrl: profile.logoFileId ? logoUrl(profile.logoFileId) : null, ...ratingFields };
  }
  return { ...profile, avatarUrl: profile.avatarFileId ? logoUrl(profile.avatarFileId) : null, ...ratingFields };
}

export function toUserDto(u: UserRecord, profile: ProfileDto = null, rating?: { ratingAvg: number | null; ratingCount: number }) {
  return {
    id: u.id,
    telegramId: u.telegramId.toString(), // BigInt не сериализуется в JSON
    firstName: u.firstName,
    username: u.username,
    role: u.role,
    isAdmin: adminTelegramIds.has(u.telegramId),
    notificationsEnabled: u.notificationsEnabled,
    profile: toProfileDto(profile, rating),
    createdAt: u.createdAt,
  };
}

// Достаём профиль текущего пользователя под его роль (или null).
export async function loadProfile(db: Db, user: UserRecord): Promise<ProfileDto> {
  if (user.role === 'blogger') return db.bloggerProfile.findUnique({ where: { userId: user.id } });
  if (user.role === 'company') return db.companyProfile.findUnique({ where: { userId: user.id } });
  return null;
}

// Версия toUserDto с рейтингом: загружает groupBy для user.id (один запрос).
export async function toUserDtoWithRating(db: Db, u: UserRecord, profile: ProfileDto) {
  const ratingMap = await fetchRatingMap(db, [u.id]);
  const rating = ratingMap.get(u.id);
  return toUserDto(u, profile, rating);
}
