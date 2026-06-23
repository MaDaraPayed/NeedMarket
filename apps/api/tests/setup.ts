import { beforeEach, afterAll } from 'vitest';
import { testDb, truncateAll } from './db';

// Перед каждым тестом — пустые таблицы (изоляция). После всех — закрываем пул.
beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testDb.$disconnect();
});
