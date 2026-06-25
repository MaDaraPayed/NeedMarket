// DTO для справочника пользователей администратора (GET /admin/users).
import type { AudienceGender, CollabFormat, BloggerTier } from './blogger';

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
  // Базовый профиль
  bio: string | null;
  city: string | null;
  categories: string[];
  linkedAccounts: Array<{ platform: string; url: string; followers?: number }>;

  // Расширенная анкета блогера (null/undefined для компаний)
  tier?: BloggerTier | null;

  audienceGender?: AudienceGender | null;
  audienceAge?: string | null;
  audienceGeo?: string | null;
  audienceLanguage?: string | null;

  reachStories?: number | null;
  reachReels?: number | null;
  reachPosts?: number | null;
  engagementRate?: number | null;
  statsScreenshotUrl?: string | null;

  formats?: CollabFormat[];

  priceStories?: number | null;
  priceStoriesSeries?: number | null;
  priceReels?: number | null;
  pricePost?: number | null;
  priceEvent?: number | null;
  priceUgc?: number | null;
  avgPrice3m?: number | null;

  brandsWorkedWith?: string | null;
  bestCaseUrl?: string | null;

  barterAvailable?: boolean;
  travelAvailable?: boolean;
  preferredAdvertiserCategories?: string[];

  // Приватные поля — только в AdminUserCardDto (не попадают в компанийский DTO)
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  termsAcceptedAt?: string | null;
  marketingOptIn?: boolean;
}
