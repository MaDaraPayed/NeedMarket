// Доменные интерфейсы бэкенда: форма записей БД (то, что нам нужно от Prisma),
// контракт media-хранилища и узкий интерфейс Db для инъекции в роуты/тесты.
// Role, LinkedAccount — из общего пакета (источник истины), реэкспортируем.
import type { Bot } from 'grammy';
import type { Role, LotStatus, ResponseStatus, DisputeStatus, DisputeReason, DisputeResolution, SupportTicketType, SupportTicketStatus, AudienceGender, CollabFormat } from '@needmarket/shared';

export type { Role, LinkedAccount, LotStatus, ResponseStatus, DisputeStatus, DisputeReason, DisputeResolution, SupportTicketType, SupportTicketStatus, AudienceGender, CollabFormat } from '@needmarket/shared';

// Минимальная форма пользователя из БД (то, что нам нужно от Prisma).
export interface UserRecord {
  id: string;
  telegramId: bigint;
  firstName: string;
  username: string | null;
  role: Role | null;
  notificationsEnabled: boolean;
  createdAt: Date;
}

// Запись уведомления из БД.
export interface NotificationRecord {
  id: string;
  recipientTgId: bigint;
  userId: string | null;
  type: string;
  lotId: string | null;
  dedupeKey: string | null;
  createdAt: Date;
}

// Данные для создания записи уведомления.
export interface NotificationCreateData {
  recipientTgId: bigint;
  userId?: string | null;
  type: string;
  lotId?: string | null;
  dedupeKey?: string | null;
}

export interface BloggerProfileRecord {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  categories: string[];
  city: string | null;
  contact: string | null;
  linkedAccounts: unknown; // JSON-поле Prisma
  avatarFileId: string | null;
  avatarMsgId: number | null;
  createdAt: Date;
  updatedAt: Date;

  birthDate: Date | null;
  phone: string | null;
  email: string | null;

  audienceGender: AudienceGender | null;
  audienceAge: string | null;
  audienceGeo: string | null;
  audienceLanguage: string | null;

  reachStories: number | null;
  reachReels: number | null;
  reachPosts: number | null;
  engagementRate: number | null;
  statsScreenshotUrl: string | null;

  formats: CollabFormat[];

  priceStories: number | null;
  priceStoriesSeries: number | null;
  priceReels: number | null;
  pricePost: number | null;
  priceEvent: number | null;
  priceUgc: number | null;
  avgPrice3m: number | null;

  brandsWorkedWith: string | null;
  bestCaseUrl: string | null;

  barterAvailable: boolean;
  travelAvailable: boolean;
  preferredAdvertiserCategories: string[];

  termsAcceptedAt: Date | null;
  marketingOptIn: boolean;
}

export interface CompanyProfileRecord {
  id: string;
  userId: string;
  name: string;
  sphere: string | null;
  city: string | null;
  contact: string | null;
  logoFileId: string | null;
  logoMsgId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BloggerProfileData {
  displayName: string;
  bio: string | null;
  categories: string[];
  city: string | null;
  contact: string | null;
  // JSON-граница Prisma: его InputJsonValue не принимает именованные интерфейсы
  // (нет индекс-сигнатуры) и не совместим с unknown через дженерик upsert,
  // поэтому здесь `any` — значение валидируется zod'ом (linkedAccountSchema) до записи.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  linkedAccounts: any;

  birthDate: Date | null;
  phone: string | null;
  email: string | null;

  audienceGender: AudienceGender | null;
  audienceAge: string | null;
  audienceGeo: string | null;
  audienceLanguage: string | null;

  reachStories: number | null;
  reachReels: number | null;
  reachPosts: number | null;
  engagementRate: number | null;
  statsScreenshotUrl: string | null;

  formats: CollabFormat[];

  priceStories: number | null;
  priceStoriesSeries: number | null;
  priceReels: number | null;
  pricePost: number | null;
  priceEvent: number | null;
  priceUgc: number | null;
  avgPrice3m: number | null;

  brandsWorkedWith: string | null;
  bestCaseUrl: string | null;

  barterAvailable: boolean;
  travelAvailable: boolean;
  preferredAdvertiserCategories: string[];

  termsAcceptedAt: Date | null;
  marketingOptIn: boolean;
}

export interface CompanyProfileData {
  name: string;
  sphere: string | null;
  city: string | null;
  contact: string | null;
}

// Базовая запись лота (то, что нам нужно от Prisma). Краткую инфу о компании
// прикладываем отдельным запросом (companyProfile.findMany) — так узкий Db
// остаётся структурно совместимым с реальным PrismaClient без generic-include.
export interface LotRecord {
  id: string;
  companyId: string;
  title: string;
  description: string;
  categories: string[];
  platforms: string[];
  budget: number;
  deadline: Date;
  requirements: string[];
  status: LotStatus;
  slotsNeeded: number;
  createdAt: Date;
}

// Запись отклика блогера на лот.
export interface ResponseRecord {
  id: string;
  lotId: string;
  bloggerId: string;
  message: string;
  status: ResponseStatus;
  createdAt: Date;
}

// Запись вложения к лоту.
export interface LotAttachmentRecord {
  id: string;
  lotId: string;
  fileId: string;
  msgId: number | null;
  contentType: string;
  fileName: string | null;
  position: number;
  createdAt: Date;
}

// Данные для создания вложения.
export interface LotAttachmentCreateData {
  lotId: string;
  fileId: string;
  msgId: number | null;
  contentType: string;
  fileName: string | null;
  position: number;
}

// Данные для создания отклика.
export interface ResponseCreateData {
  lotId: string;
  bloggerId: string;
  message: string;
}

// Запись отзыва из БД.
export interface ReviewRecord {
  id: string;
  lotId: string;
  authorId: string;
  targetId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

// Данные для создания отзыва.
export interface ReviewCreateData {
  lotId: string;
  authorId: string;
  targetId: string;
  rating: number;
  comment?: string | null;
}

// Запись платформенных настроек (синглтон, id='global').
export interface PlatformSettingsRecord {
  id: string;
  budgetFilterEnabled: boolean;
  updatedAt: Date;
}

// Данные для обновления платформенных настроек.
export interface PlatformSettingsUpdateData {
  budgetFilterEnabled?: boolean;
}

// Запись сохранённого поиска блогера.
export interface SavedSearchRecord {
  id: string;
  bloggerId: string;
  name: string | null;
  categories: string[];
  platforms: string[];
  minBudget: number | null;
  isActive: boolean;
  createdAt: Date;
}

// Данные для создания сохранённого поиска.
export interface SavedSearchCreateData {
  bloggerId: string;
  name?: string | null;
  categories: string[];
  platforms: string[];
  minBudget?: number | null;
}

// Запись спора из БД.
export interface DisputeRecord {
  id: string;
  lotId: string;
  responseId: string;
  raisedById: string;
  againstId: string;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  resolution: DisputeResolution | null;
  resolutionNote: string | null;
  resolvedById: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  awaitingCompanyDecision: boolean;
}

// Запись вложения к спору из БД.
export interface DisputeAttachmentRecord {
  id: string;
  disputeId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  createdAt: Date;
}

// Данные для создания спора.
export interface DisputeCreateData {
  lotId: string;
  responseId: string;
  raisedById: string;
  againstId: string;
  reason: DisputeReason;
  description: string;
}

// Данные для создания вложения к спору.
export interface DisputeAttachmentCreateData {
  disputeId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
}

// Запись тикета поддержки из БД.
export interface SupportTicketRecord {
  id: string;
  authorId: string;
  subject: string;
  type: SupportTicketType;
  status: SupportTicketStatus;
  createdAt: Date;
  lastMessageAt: Date;
  lastReadByUserAt: Date | null;
  lastReadByAdminAt: Date | null;
}

// Запись сообщения тикета из БД.
export interface TicketMessageRecord {
  id: string;
  ticketId: string;
  senderId: string;
  fromAdmin: boolean;
  body: string | null;
  createdAt: Date;
}

// Запись вложения к сообщению из БД.
export interface TicketAttachmentRecord {
  id: string;
  messageId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
}

// Данные для создания тикета.
export interface SupportTicketCreateData {
  authorId: string;
  subject: string;
  type: SupportTicketType;
  lastMessageAt: Date;
  lastReadByUserAt: Date;
}

// Данные для обновления тикета.
export interface SupportTicketUpdateData {
  lastMessageAt?: Date;
  lastReadByUserAt?: Date | null;
  lastReadByAdminAt?: Date | null;
  status?: SupportTicketStatus;
}

// Данные для создания сообщения тикета.
export interface TicketMessageCreateData {
  ticketId: string;
  senderId: string;
  fromAdmin: boolean;
  body?: string | null;
}

// Данные для создания вложения к сообщению.
export interface TicketAttachmentCreateData {
  messageId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
}

// Данные для обновления сохранённого поиска (все опциональны).
export interface SavedSearchUpdateData {
  name?: string | null;
  categories?: string[];
  platforms?: string[];
  minBudget?: number | null;
  isActive?: boolean;
}

// Данные для создания лота.
export interface LotCreateData {
  companyId: string;
  title: string;
  description: string;
  categories: string[];
  platforms: string[];
  budget: number;
  deadline: Date;
  requirements: string[];
  status: LotStatus;
  slotsNeeded?: number; // default Prisma = 1; optional чтобы не ломать testDb.lot.create
}

// Параметры выборки ленты/списка лотов. Все поля where опциональны, чтобы один
// тип покрывал и ленту (status + categories/platform содержит выбранное), и
// /me/lots (companyId). Для массивов фильтр — `{ has: value }` (array-containment).
interface LotFindManyArgs {
  where: {
    status?: LotStatus;
    // hasSome покрывает и одну категорию, и мультивыбор (array-overlap в Postgres).
    categories?: { hasSome: string[] };
    platforms?: { has: string };
    companyId?: string;
    // id.in — выборка по списку (сериализатор); id.notIn — для hideResponded.
    id?: { in: string[] } | { notIn: string[] };
  };
  orderBy?: { createdAt: 'desc' };
  skip?: number;
  take?: number;
}

// Абстракция медиа-хранилища. Сейчас — Telegram-канал (services/storage.ts),
// позже drop-in заменяется на R2/S3 без правок роутов.
export interface StorageRef {
  fileId: string;
  messageId?: number;
}

export interface Storage {
  put(buffer: Buffer, meta: { filename: string; contentType: string }): Promise<StorageRef>;
  getStream(fileId: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string }>;
}

// Только те операции Prisma, что используем — удобно подменять в тестах.
export interface Db {
  user: {
    upsert(args: {
      where: { telegramId: bigint };
      update: { firstName: string; username: string | null };
      create: { telegramId: bigint; firstName: string; username: string | null };
    }): Promise<UserRecord>;
    findUnique(args: { where: { id: string } }): Promise<UserRecord | null>;
    findMany(args: {
      where: {
        id?: { in: string[] };
        role?: Role;
        bloggerProfile?: { displayName: { contains: string; mode: 'insensitive' } };
        companyProfile?: { name: { contains: string; mode: 'insensitive' } };
      };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }): Promise<UserRecord[]>;
    update(args: { where: { id: string }; data: { role: Role } | { notificationsEnabled: boolean } }): Promise<UserRecord>;
  };
  bloggerProfile: {
    findUnique(args: { where: { userId: string } }): Promise<BloggerProfileRecord | null>;
    findMany(args: { where: { id?: { in: string[] }; userId?: { in: string[] } } }): Promise<BloggerProfileRecord[]>;
    upsert(args: {
      where: { userId: string };
      update: BloggerProfileData;
      create: BloggerProfileData & { userId: string };
    }): Promise<BloggerProfileRecord>;
    update(args: {
      where: { userId: string };
      data: { avatarFileId: string | null; avatarMsgId: number | null };
    }): Promise<BloggerProfileRecord>;
  };
  companyProfile: {
    findUnique(args: { where: { userId: string } }): Promise<CompanyProfileRecord | null>;
    findMany(args: { where: { id?: { in: string[] }; userId?: { in: string[] } } }): Promise<CompanyProfileRecord[]>;
    upsert(args: {
      where: { userId: string };
      update: CompanyProfileData;
      create: CompanyProfileData & { userId: string };
    }): Promise<CompanyProfileRecord>;
    update(args: {
      where: { userId: string };
      data: { logoFileId: string | null; logoMsgId: number | null };
    }): Promise<CompanyProfileRecord>;
  };
  lot: {
    create(args: { data: LotCreateData }): Promise<LotRecord>;
    findMany(args: LotFindManyArgs): Promise<LotRecord[]>;
    findUnique(args: { where: { id: string } }): Promise<LotRecord | null>;
    update(args: {
      where: { id: string };
      data: { status?: LotStatus };
    }): Promise<LotRecord>;
    delete(args: { where: { id: string } }): Promise<LotRecord>;
  };
  lotAttachment: {
    create(args: { data: LotAttachmentCreateData }): Promise<LotAttachmentRecord>;
    findMany(args: {
      where: { lotId: string } | { lotId: { in: string[] } };
      orderBy?: { position: 'asc' };
    }): Promise<LotAttachmentRecord[]>;
    findUnique(args: { where: { id: string } }): Promise<LotAttachmentRecord | null>;
    count(args: { where: { lotId: string } }): Promise<number>;
    delete(args: { where: { id: string } }): Promise<LotAttachmentRecord>;
  };
  review: {
    create(args: { data: ReviewCreateData }): Promise<ReviewRecord>;
    findFirst(args: {
      where: { lotId: string; authorId: string; targetId: string };
    }): Promise<ReviewRecord | null>;
    findMany(args: {
      where: {
        targetId?: string | { in: string[] };
        lotId?: string | { in: string[] };
        authorId?: string;
      };
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
    }): Promise<ReviewRecord[]>;
    groupBy(args: {
      by: ['targetId'];
      where: { targetId: { in: string[] } };
      _avg: { rating: true };
      _count: { rating: true };
    }): Promise<Array<{ targetId: string; _avg: { rating: number | null }; _count: { rating: number } }>>;
  };
  notification: {
    findFirst(args: {
      where: { recipientTgId: bigint; type: string; lotId?: string | null; dedupeKey?: string | null };
    }): Promise<NotificationRecord | null>;
    create(args: { data: NotificationCreateData }): Promise<NotificationRecord>;
    findMany(args: {
      where: { recipientTgId?: bigint; type?: string; lotId?: string | null; dedupeKey?: string | null };
    }): Promise<NotificationRecord[]>;
  };
  savedSearch: {
    create(args: { data: SavedSearchCreateData }): Promise<SavedSearchRecord>;
    findMany(args: {
      where: {
        bloggerId?: string;
        isActive?: boolean;
        // SQL-префильтр для матчинга: пусто ИЛИ пересечение с lot.categories
        OR?: Array<{ categories: { isEmpty: true } } | { categories: { hasSome: string[] } }>;
      };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }): Promise<SavedSearchRecord[]>;
    findUnique(args: { where: { id: string } }): Promise<SavedSearchRecord | null>;
    update(args: { where: { id: string }; data: SavedSearchUpdateData }): Promise<SavedSearchRecord>;
    delete(args: { where: { id: string } }): Promise<SavedSearchRecord>;
    count(args: { where: { bloggerId: string } }): Promise<number>;
  };
  dispute: {
    create(args: { data: DisputeCreateData }): Promise<DisputeRecord>;
    findFirst(args: {
      where: { id?: string; responseId?: string; lotId?: string; status?: DisputeStatus };
    }): Promise<DisputeRecord | null>;
    findMany(args: {
      where: { lotId?: string | { in: string[] }; responseId?: { in: string[] }; status?: DisputeStatus };
      orderBy?: { createdAt: 'desc' };
    }): Promise<DisputeRecord[]>;
    count(args: { where: { lotId: string; status: DisputeStatus } }): Promise<number>;
    update(args: {
      where: { id: string };
      data: {
        status?: DisputeStatus;
        resolution?: DisputeResolution | null;
        resolutionNote?: string | null;
        resolvedById?: string | null;
        resolvedAt?: Date | null;
        awaitingCompanyDecision?: boolean;
      };
    }): Promise<DisputeRecord>;
  };
  disputeAttachment: {
    createMany(args: { data: DisputeAttachmentCreateData[] }): Promise<{ count: number }>;
    findMany(args: { where: { disputeId: string | { in: string[] } } }): Promise<DisputeAttachmentRecord[]>;
  };
  supportTicket: {
    create(args: { data: SupportTicketCreateData }): Promise<SupportTicketRecord>;
    findUnique(args: { where: { id: string } }): Promise<SupportTicketRecord | null>;
    findMany(args: {
      where: { authorId?: string; status?: SupportTicketStatus };
      orderBy?: { lastMessageAt: 'desc' };
    }): Promise<SupportTicketRecord[]>;
    update(args: { where: { id: string }; data: SupportTicketUpdateData }): Promise<SupportTicketRecord>;
  };
  ticketMessage: {
    create(args: { data: TicketMessageCreateData }): Promise<TicketMessageRecord>;
    findMany(args: {
      where: { ticketId?: string | { in: string[] } };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }): Promise<TicketMessageRecord[]>;
  };
  ticketAttachment: {
    createMany(args: { data: TicketAttachmentCreateData[] }): Promise<{ count: number }>;
    findMany(args: { where: { messageId: string | { in: string[] } } }): Promise<TicketAttachmentRecord[]>;
  };
  platformSettings: {
    upsert(args: {
      where: { id: string };
      create: { id: string; budgetFilterEnabled: boolean };
      update: PlatformSettingsUpdateData;
    }): Promise<PlatformSettingsRecord>;
    findUnique(args: { where: { id: string } }): Promise<PlatformSettingsRecord | null>;
    update(args: { where: { id: string }; data: PlatformSettingsUpdateData }): Promise<PlatformSettingsRecord>;
  };
  $transaction<T>(fn: (tx: TxDb) => Promise<T>): Promise<T>;
  response: {
    create(args: { data: ResponseCreateData }): Promise<ResponseRecord>;
    findUnique(args: {
      where: { lotId_bloggerId: { lotId: string; bloggerId: string } } | { id: string };
    }): Promise<ResponseRecord | null>;
    findMany(args: {
      where: { id?: { in: string[] }; lotId?: string | { in: string[] }; bloggerId?: string; status?: ResponseStatus | { in: ResponseStatus[] } };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }): Promise<ResponseRecord[]>;
    updateMany(args: {
      where: { lotId: string; id?: { not: string }; status?: ResponseStatus };
      data: { status: ResponseStatus };
    }): Promise<{ count: number }>;
    update(args: {
      where: { id: string };
      data: { status: ResponseStatus };
    }): Promise<ResponseRecord>;
  };
}

// Минимальный клиент внутри $transaction.
export interface TxDb {
  response: Db['response'];
  lot: Db['lot'];
  dispute: Pick<Db['dispute'], 'create' | 'update'>;
  disputeAttachment: Pick<Db['disputeAttachment'], 'createMany'>;
  supportTicket: Pick<Db['supportTicket'], 'create' | 'update'>;
  ticketMessage: Pick<Db['ticketMessage'], 'create'>;
  ticketAttachment: Pick<Db['ticketAttachment'], 'createMany'>;
}

// Инъекция в buildApp и роуты: реальная БД + (опционально) media-хранилище + бот.
export interface AppDeps {
  db: Db;
  storage?: Storage | null;
  bot?: Bot | null;
}
