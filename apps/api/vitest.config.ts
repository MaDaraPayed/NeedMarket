import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './tests/testDbUrl';

export default defineConfig({
  test: {
    // Значения окружения для тестов задаём здесь, до загрузки модулей
    // (env.ts читает process.env при импорте; dotenv их не перетирает).
    env: {
      BOT_TOKEN: '7654321:TEST-BOT-TOKEN-FOR-VITEST',
      JWT_SECRET: 'test-jwt-secret',
      // Боевой DATABASE_URL в тестах НЕ используется (src/db.ts не импортируется);
      // реальное подключение идёт по TEST_DATABASE_URL (см. tests/db.ts).
      DATABASE_URL: TEST_DATABASE_URL,
      TEST_DATABASE_URL,
      CORS_ORIGIN: '*',
      // Тестовый пользователь по умолчанию (signInitData id=555000111) — админ.
      ADMIN_TELEGRAM_IDS: '555000111',
    },
    // Один раз перед прогоном накатываем миграции на тестовую БД.
    globalSetup: ['./tests/globalSetup.ts'],
    // Перед каждым тестом — TRUNCATE (изоляция). После всех — disconnect.
    setupFiles: ['./tests/setup.ts'],
    // Реальная БД одна на процесс — гоняем файлы последовательно, без гонок за
    // таблицы между воркерами.
    fileParallelism: false,
  },
});
