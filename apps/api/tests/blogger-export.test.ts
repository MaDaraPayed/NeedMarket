import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { InputFile } from 'grammy';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';

const ADMIN_TG_ID = 555_000_111;

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function makeFakeBot() {
  const calls: { chatId: number; file: InputFile; caption?: string }[] = [];
  const bot = {
    api: {
      sendDocument: async (chatId: number, file: InputFile, opts?: { caption?: string }) => {
        calls.push({ chatId, file, caption: opts?.caption });
        return { ok: true };
      },
    },
  } as unknown as import('grammy').Bot;
  return { bot, calls };
}

async function createBlogger(app: FastifyInstance, tgId: number): Promise<string> {
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: tgId }) },
  });
  const token = auth.json().token as string;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
  await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: {
      displayName: `Блогер ${tgId}`,
      categories: ['Бьюти'],
      linkedAccounts: [{ platform: 'Instagram', url: 'https://instagram.com/b', followers: 10_000 }],
    },
  });
  return token;
}

describe('POST /admin/users/export', () => {
  it('возвращает 403 не-администратору', async () => {
    const { bot } = makeFakeBot();
    const app = buildApp({ db: testDb, bot });
    await app.ready();

    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 8_001_001 }) },
    });
    const token = auth.json().token as string;

    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/export',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin success: sendDocument вызван ровно раз с xlsx-файлом', async () => {
    const { bot, calls } = makeFakeBot();
    const app = buildApp({ db: testDb, bot });
    await app.ready();

    await createBlogger(app, 8_002_001);
    await createBlogger(app, 8_002_002);

    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = auth.json().token as string;

    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/export',
      headers: bearer(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; count: number };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.chatId).toBe(ADMIN_TG_ID);
    expect(call.file).toBeInstanceOf(InputFile);
    expect(call.file.filename).toMatch(/^bloggers_export_\d{4}-\d{2}-\d{2}\.xlsx$/);
    // Буфер не пустой
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = Buffer.from((call.file as any).fileData as ArrayBuffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('xlsx содержит строку заголовков и по одной строке на каждого блогера', async () => {
    const { bot, calls } = makeFakeBot();
    const app = buildApp({ db: testDb, bot });
    await app.ready();

    await createBlogger(app, 8_003_001);
    await createBlogger(app, 8_003_002);
    await createBlogger(app, 8_003_003);

    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = auth.json().token as string;

    await app.inject({
      method: 'POST',
      url: '/admin/users/export',
      headers: bearer(adminToken),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: Uint8Array = (calls[0]!.file as any).fileData as Uint8Array;
    const buf = Buffer.from(raw);

    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet('Блогеры')!;
    expect(ws).toBeTruthy();

    // Первая строка — заголовки, далее по одной строке на блогера
    const rowCount = ws.actualRowCount;
    expect(rowCount).toBe(4); // 1 заголовок + 3 блогера

    // Проверяем заголовок первой колонки
    const headerCell = ws.getRow(1).getCell(1).value;
    expect(headerCell).toBe('ФИО');

    // Данные строк содержат имена блогеров
    const names = [2, 3, 4].map((r) => ws.getRow(r).getCell(1).value as string);
    expect(names.some((n) => n.includes('Блогер'))).toBe(true);
  });

  it('возвращает 503 если бот не инициализирован', async () => {
    const app = buildApp({ db: testDb, bot: null });
    await app.ready();

    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = auth.json().token as string;

    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/export',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(503);
  });
});
