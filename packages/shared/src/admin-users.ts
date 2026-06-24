// DTO для справочника пользователей администратора (GET /admin/users).

export interface AdminUserCardDto {
  userId: string;
  role: 'blogger' | 'company';
  name: string;
  createdAt: string; // ISO
  telegramUsername: string | null;
  avatarUrl: string | null; // /media/:fileId или null
  contact: string | null;
  // Рейтинг (null/0 для компаний)
  ratingAvg: number | null;
  ratingCount: number;
  // Полные данные профиля блогера для ProfileModal
  bio: string | null;
  city: string | null;
  categories: string[];
  linkedAccounts: Array<{ platform: string; url: string; followers?: number }>;
}
