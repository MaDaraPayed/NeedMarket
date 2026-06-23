import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 больше не загружает .env автоматически — делаем это сами.
// .env лежит в КОРНЕ монорепо, а этот файл в apps/api.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // В Prisma 7 connection URL для Migrate/CLI живёт здесь (не в schema).
  // Рантайм-клиент подключается через driver adapter (см. src/db.ts).
  datasource: {
    url: env('DATABASE_URL'),
  },
});
