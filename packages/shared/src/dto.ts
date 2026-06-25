// Контракт API между фронтом и бэком — СЕРИАЛИЗОВАННАЯ форма (то, что реально
// летит в JSON: BigInt → string, Date → ISO-string). Бэкенд сериализует свои
// Prisma-записи в эти типы (serializers), фронт их же потребляет. Источник истины.

import type { AudienceGender, CollabFormat, BloggerTier } from './blogger';

// Роль пользователя.
export type Role = 'blogger' | 'company';

// Один аккаунт блогера в соцсети (хранится внутри linkedAccounts).
export interface LinkedAccount {
  platform: string;
  url: string;
  followers?: number;
}

// Профиль блогера в ответе API.
export interface BloggerProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  categories: string[];
  city: string | null;
  contact: string | null;
  linkedAccounts: LinkedAccount[];
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;

  // Расширенная анкета (все опциональны — заполняются поэтапно).
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;

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

  termsAcceptedAt?: string | null;
  marketingOptIn?: boolean;

  // Вычисляемый тир (из максимальных подписчиков в linkedAccounts).
  tier?: BloggerTier;
}

// Профиль компании в ответе API.
export interface CompanyProfile {
  id: string;
  userId: string;
  name: string;
  sphere: string | null;
  city: string | null;
  contact: string | null;
  logoUrl: string | null; // наш media-URL (/media/:fileId) или null
  createdAt: string;
  updatedAt: string;
}

// Пользователь в ответе API (форма /me и /auth/telegram).
export interface ApiUser {
  id: string;
  telegramId: string;
  firstName: string;
  username: string | null;
  role: Role | null;
  isAdmin: boolean;
  notificationsEnabled: boolean;
  profile: BloggerProfile | CompanyProfile | null;
  createdAt: string;
}

// Тело PUT /me/profile для блогера.
export interface BloggerProfileInput {
  displayName: string;
  bio?: string;
  categories: string[];
  city?: string;
  contact?: string;
  linkedAccounts: LinkedAccount[];

  birthDate?: string;
  phone?: string;
  email?: string;

  audienceGender?: AudienceGender;
  audienceAge?: string;
  audienceGeo?: string;
  audienceLanguage?: string;

  reachStories?: number;
  reachReels?: number;
  reachPosts?: number;
  engagementRate?: number;
  statsScreenshotUrl?: string;

  formats?: CollabFormat[];

  priceStories?: number;
  priceStoriesSeries?: number;
  priceReels?: number;
  pricePost?: number;
  priceEvent?: number;
  priceUgc?: number;
  avgPrice3m?: number;

  brandsWorkedWith?: string;
  bestCaseUrl?: string;

  barterAvailable?: boolean;
  travelAvailable?: boolean;
  preferredAdvertiserCategories?: string[];

  termsAcceptedAt?: string;
  marketingOptIn?: boolean;
}

// Тело PUT /me/profile для компании.
export interface CompanyProfileInput {
  name: string;
  sphere?: string;
  city?: string;
  contact?: string;
}

// Допустимые типы логотипа (POST /me/profile/logo).
export type LogoContentType = 'image/png' | 'image/jpeg' | 'image/webp';
