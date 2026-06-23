import { sign } from '@tma.js/init-data-node';
import { Readable } from 'node:stream';
import { type Storage } from '../src/app';

const BOT_TOKEN = process.env.BOT_TOKEN!; // задан в vitest.config.ts

// Реальный Postgres-клиент для тестов живёт в ./db (testDb + truncateAll).
// Telegram (storage/бот) остаётся заглушкой — тесты в сеть не ходят.
export { testDb } from './db';

// Фейковое хранилище: put запоминает байты, getStream отдаёт их обратно.
// Счётчики позволяют проверять, что media-прокси кэширует (getStream не зовётся
// повторно для одного file_id).
export function makeFakeStorage() {
  const files = new Map<string, { buffer: Buffer; contentType: string }>();
  let seq = 0;
  const calls = { put: 0, getStream: 0 };

  const storage: Storage = {
    async put(buffer, meta) {
      calls.put += 1;
      const fileId = `file_${++seq}`;
      files.set(fileId, { buffer, contentType: meta.contentType });
      return { fileId, messageId: 1000 + seq };
    },
    async getStream(fileId) {
      calls.getStream += 1;
      const f = files.get(fileId);
      if (!f) throw new Error('not found');
      return { stream: Readable.from(f.buffer), contentType: f.contentType };
    },
  };

  return { storage, calls, files };
}

// Подписываем валидный initData тем же токеном, что проверяет сервер.
export function signInitData(authDate: Date, userOverrides: Record<string, unknown> = {}): string {
  return sign(
    {
      user: { id: 555000111, first_name: 'Алиса', username: 'alice', ...userOverrides },
      query_id: 'AAH',
    },
    BOT_TOKEN,
    authDate,
  ) as string;
}
