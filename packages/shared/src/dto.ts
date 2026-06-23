// Контракт API между фронтом и бэком — СЕРИАЛИЗОВАННАЯ форма (то, что реально
// летит в JSON: BigInt → string, Date → ISO-string). Бэкенд сериализует свои
// Prisma-записи в эти типы (serializers), фронт их же потребляет. Источник истины.

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
  avatarUrl: string | null; // наш media-URL (/media/:fileId) или null
  createdAt: string;
  updatedAt: string;
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
