import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Тесты ходят в РЕАЛЬНЫЙ Postgres (отдельная тестовая БД), а не в фейк.
// URL берём из TEST_DATABASE_URL (env/.env в корне). dotenv не перетирает уже
// заданные переменные — поэтому значение из shell имеет приоритет над .env.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../.env') });

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/needmarket_test?schema=public';
