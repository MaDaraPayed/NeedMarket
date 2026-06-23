import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';

// В production переменные поступают из платформы (Railway) — .env не читаем.
// В dev/test грузим .env из корня монорепо только если файл существует.
const here = dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV !== 'production') {
  const envPath = resolve(here, '../../../.env');
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);

const schema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  MINI_APP_URL: z.string().optional(),
  // numeric id служебного канала-хранилища медиа (бот — админ в нём).
  // Необязателен: без него загрузка/раздача лого вернёт 503 (см. storage.ts).
  MEDIA_CHANNEL_ID: z.coerce.number().optional(),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default('*'),
  // CSV telegram id администраторов платформы: "123456,789012". Пусто = нет админов.
  ADMIN_TELEGRAM_IDS: z.string().default(''),
  // Webhook-режим бота (прод): базовый HTTPS-URL API без trailing slash.
  // Если задан — бот работает через webhook; иначе — long polling (дев).
  WEBHOOK_URL: z.string().url().optional(),
  // Секрет для верификации входящих webhook-запросов от Telegram (любая строка).
  // Обязателен если задан WEBHOOK_URL.
  WEBHOOK_SECRET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment variables:\n${issues}\nПроверь .env в корне (см. .env.example).`);
}

export const env = parsed.data;

// Вычисляется один раз при старте; BigInt для точного сравнения с telegramId.
export const adminTelegramIds: Set<bigint> = new Set(
  env.ADMIN_TELEGRAM_IDS
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s)),
);
