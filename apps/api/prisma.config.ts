import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { defineConfig, env } from 'prisma/config';

// В production DATABASE_URL поступает из платформы — .env не читаем.
// Prisma CLI (migrate deploy) работает с теми же правилами: файл грузится
// только в не-prod окружениях и только если существует.
const here = dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV !== 'production') {
  const envPath = resolve(here, '../../.env');
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // В Prisma 7 connection URL для Migrate/CLI живёт здесь (не в schema).
  // Рантайм-клиент подключается через driver adapter (см. src/db.ts).
  datasource: {
    url: env('DATABASE_URL'),
  },
});
