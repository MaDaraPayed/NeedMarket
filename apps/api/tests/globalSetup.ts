import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { TEST_DATABASE_URL } from './testDbUrl';

// Один раз перед всем прогоном накатываем схему на ТЕСТОВУЮ БД (миграции).
// DATABASE_URL переопределяем на TEST_DATABASE_URL — prisma.config.ts читает его
// для Migrate/CLI. Сама БД должна существовать (см. README, раздел про тесты).
export default function setup(): void {
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  execSync('npx prisma migrate deploy', {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
