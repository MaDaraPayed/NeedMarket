import { z } from 'zod';
import { CATEGORIES, PLATFORMS } from '@needmarket/shared';

// Все zod-схемы валидации тел запросов — в одном месте.

export const authBodySchema = z.object({ initData: z.string().min(1) });

export const roleBodySchema = z.object({ role: z.enum(['blogger', 'company']) });

export const linkedAccountSchema = z.object({
  platform: z.string().min(1),
  url: z.string().min(1),
  followers: z.number().int().nonnegative().optional(),
});

export const bloggerProfileSchema = z.object({
  displayName: z.string().min(1),
  bio: z.string().optional(),
  categories: z.array(z.enum(CATEGORIES)).default([]),
  city: z.string().optional(),
  contact: z.string().optional(),
  linkedAccounts: z.array(linkedAccountSchema).default([]),
});

export const companyProfileSchema = z.object({
  name: z.string().min(1),
  sphere: z.string().optional(),
  city: z.string().optional(),
  contact: z.string().optional(),
});

// Загрузка лого: base64 проще, чем multipart, и для картинок до 5 МБ достаточно.
export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const LOGO_EXT: Record<(typeof LOGO_CONTENT_TYPES)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export const logoBodySchema = z.object({
  contentType: z.enum(LOGO_CONTENT_TYPES),
  data: z.string().min(1), // base64 (без data-URL префикса)
});

// Вложения к лоту: изображения + документы. ~10 МБ лимит.
export const ATTACHMENT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const ATTACHMENT_DOC_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
] as const;
export const ATTACHMENT_CONTENT_TYPES = [...ATTACHMENT_IMAGE_TYPES, ...ATTACHMENT_DOC_TYPES] as const;
export type AttachmentContentType = (typeof ATTACHMENT_CONTENT_TYPES)[number];

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 МБ
export const ATTACHMENT_MAX_COUNT = 10;

export const attachmentBodySchema = z.object({
  contentType: z.enum(ATTACHMENT_CONTENT_TYPES),
  data: z.string().min(1), // base64
  fileName: z.string().min(1).optional(), // для документов
});

// Создание лота. categories ⊆ CATEGORIES и непусто; platforms ⊆ PLATFORMS и непусто;
// budget > 0 (тенге, целое); deadline — дата в будущем; requirements — чек-лист.
export const createLotSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  categories: z.array(z.enum(CATEGORIES)).min(1),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  budget: z.number().int().positive(),
  deadline: z.coerce.date().refine((d) => d.getTime() > Date.now(), 'deadline must be in the future'),
  requirements: z.array(z.string().min(1)).default([]),
  slotsNeeded: z.number().int().min(1).max(20).default(1),
});

// Создание отклика блогера на лот.
export const createResponseSchema = z.object({
  message: z.string().min(1).max(2000),
});

// Dispute-whitelist mime-типов (тот же список, что у вложений лота).
export const DISPUTE_ATTACHMENT_MIME_TYPES = ATTACHMENT_CONTENT_TYPES;
export const DISPUTE_ATTACHMENT_MAX_COUNT = 5;

// Открытие спора участником пары (company или blogger).
export const createDisputeSchema = z.object({
  responseId: z.string().min(1),
  reason: z.enum([
    'not_delivered',
    'poor_quality',
    'no_contact',
    'no_payment',
    'terms_violation',
    'other',
  ]),
  description: z.string().min(1).max(1000),
  attachments: z
    .array(
      z.object({
        fileId: z.string().min(1),
        fileName: z.string().min(1),
        mimeType: z.enum(ATTACHMENT_CONTENT_TYPES),
      }),
    )
    .max(DISPUTE_ATTACHMENT_MAX_COUNT)
    .optional(),
});

// Разрешение спора администратором.
export const resolveDisputeSchema = z.object({
  resolution: z.enum(['favor_company', 'favor_blogger', 'partial']),
  note: z.string().max(1000).optional(),
});

// Вложение к тикету поддержки: принимаем ЛЮБОЙ формат (mimeType не ограничен).
// Размер и количество — как у существующих вложений.
export const SUPPORT_ATTACHMENT_MAX_COUNT = ATTACHMENT_MAX_COUNT; // 10

// Загрузка файла для тикета поддержки: base64 → Telegram storage → fileId.
export const supportUploadSchema = z.object({
  contentType: z.string().min(1),
  data: z.string().min(1), // base64 без data-URL префикса
  fileName: z.string().min(1),
});

export const supportAttachmentSchema = z.object({
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1), // любой формат
});

const supportMessageBodySchema = z
  .object({
    body: z.string().max(4000).optional(),
    attachments: z.array(supportAttachmentSchema).max(SUPPORT_ATTACHMENT_MAX_COUNT).optional(),
  })
  .refine(
    (d) => (d.body !== undefined && d.body.trim().length > 0) || (d.attachments !== undefined && d.attachments.length > 0),
    { message: 'Message must contain body or at least one attachment' },
  );

// Создание тикета поддержки.
export const createSupportTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  type: z.enum(['request', 'idea']),
  message: supportMessageBodySchema,
});

// Добавление сообщения в тикет.
export const createTicketMessageSchema = supportMessageBodySchema;

// Лента GET /lots: фильтры по категории/площадке + пагинация.
// category принимает одно или несколько значений (?category=X&category=Y → hasSome).
export const LOTS_LIMIT_DEFAULT = 20;
export const LOTS_LIMIT_MAX = 100;
export const lotsQuerySchema = z.object({
  category: z.preprocess(
    (v) => (v === undefined || v === '' ? undefined : Array.isArray(v) ? v : [v]),
    z.array(z.enum(CATEGORIES)).optional(),
  ),
  platform: z.enum(PLATFORMS).optional(),
  limit: z.coerce.number().int().positive().max(LOTS_LIMIT_MAX).default(LOTS_LIMIT_DEFAULT),
  offset: z.coerce.number().int().nonnegative().default(0),
  // Для блогера: скрыть лоты, на которые уже откликнулся.
  hideResponded: z.preprocess((v) => v === 'true' || v === '1', z.boolean()).optional(),
});
