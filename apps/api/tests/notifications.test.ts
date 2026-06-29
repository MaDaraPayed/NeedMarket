import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';
import { notifyUser, notifyAdmins, notifyBloggers, notifyLotOwner } from '../src/services/notifications';

// ADMIN_TELEGRAM_IDS='555000111' в vitest.config.ts; signInitData без override → admin tgId.
const ADMIN_TG_ID = 555000111n;

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function futureISO(days = 7): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

// Создаём компанию с профилем. tgId=555000111 по умолчанию (admin).
async function companyClient(tgId?: number): Promise<{
  app: FastifyInstance;
  token: string;
  companyId: string;
  userId: string;
}> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), tgId ? { id: tgId } : {}) },
  });
  const token = auth.json().token;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
  const prof = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: { name: `ООО ${tgId ?? 'Ромашка'}` },
  });
  return { app, token, companyId: prof.json().user.profile.id, userId: prof.json().user.id };
}

// Создаём блогера с профилем.
async function bloggerClient(tgId: number): Promise<{
  app: FastifyInstance;
  token: string;
  bloggerId: string;
  userId: string;
}> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: tgId }) },
  });
  const token = auth.json().token;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
  const prof = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: { displayName: `Блогер ${tgId}`, categories: ['Красота'], linkedAccounts: [] },
  });
  return { app, token, bloggerId: prof.json().user.profile.id, userId: prof.json().user.id };
}

// Создаёт active-лот напрямую в БД.
async function createActiveLot(companyId: string, title = 'Тест-лот', slotsNeeded = 1) {
  return testDb.lot.create({
    data: {
      companyId,
      title,
      description: 'Описание',
      categories: ['Красота'],
      platforms: ['Instagram'],
      budget: 100_000,
      deadline: new Date(Date.now() + 7 * 86_400_000),
      requirements: [],
      status: 'active',
      slotsNeeded,
    },
  });
}

// Базовый fake-бот: счётчик вызовов + последний recipient.
function makeFakeBot(throwOnSend = false) {
  const calls: { to: number; text: string }[] = [];
  const bot = {
    api: {
      sendMessage: async (chatId: number, text: string) => {
        if (throwOnSend) throw new Error('Simulated send failure');
        calls.push({ to: chatId, text });
        return { ok: true };
      },
    },
  } as unknown as import('grammy').Bot;
  return { bot, calls };
}

// ─────────────────────────── Unit: сервис уведомлений ───────────────────────────

describe('notifyUser — флаг notificationsEnabled', () => {
  it('notificationsEnabled=true (дефолт) → бот вызывается', async () => {
    const { bot, calls } = makeFakeBot();

    const user = await testDb.user.upsert({
      where: { telegramId: BigInt(900001001) },
      update: { firstName: 'Test', username: null },
      create: { telegramId: BigInt(900001001), firstName: 'Test', username: null },
    });

    await notifyUser(testDb, bot, user.id, 'lot_activated', { lotId: 'lot-1', lotTitle: 'Тест' });
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe(900001001);
  });

  it('notificationsEnabled=false → бот НЕ вызывается', async () => {
    const { bot, calls } = makeFakeBot();

    const user = await testDb.user.upsert({
      where: { telegramId: BigInt(900002001) },
      update: { firstName: 'Test', username: null, notificationsEnabled: false },
      create: { telegramId: BigInt(900002001), firstName: 'Test', username: null, notificationsEnabled: false },
    });

    await notifyUser(testDb, bot, user.id, 'lot_activated', { lotId: 'lot-1', lotTitle: 'Тест' });
    expect(calls).toHaveLength(0);
  });

  it('bot=null → без ошибок, ничего не отправляется', async () => {
    const user = await testDb.user.upsert({
      where: { telegramId: BigInt(900003001) },
      update: { firstName: 'Test', username: null },
      create: { telegramId: BigInt(900003001), firstName: 'Test', username: null },
    });
    // Не должно бросить
    await expect(notifyUser(testDb, null, user.id, 'lot_activated', {})).resolves.toBeUndefined();
  });
});

describe('notifyAdmins — игнорирует notificationsEnabled', () => {
  it('уведомляет ADMIN_TELEGRAM_IDS независимо от notificationsEnabled', async () => {
    const { bot, calls } = makeFakeBot();

    // Создаём запись admin-пользователя с notificationsEnabled=false.
    await testDb.user.upsert({
      where: { telegramId: ADMIN_TG_ID },
      update: { firstName: 'Admin', username: 'alice', notificationsEnabled: false },
      create: { telegramId: ADMIN_TG_ID, firstName: 'Admin', username: 'alice', notificationsEnabled: false },
    });

    // Всё равно должен отправить (стаф уведомляется всегда).
    await notifyAdmins(testDb, bot, 'admin_lot_to_verify', { lotId: 'lot-1', lotTitle: 'Тест' });
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe(Number(ADMIN_TG_ID));
  });
});

describe('Дедупликация уведомлений', () => {
  it('двойной вызов (recipient, type, lotId) → одна отправка, одна запись лога', async () => {
    const { bot, calls } = makeFakeBot();

    const user = await testDb.user.upsert({
      where: { telegramId: BigInt(900004001) },
      update: { firstName: 'Test', username: null },
      create: { telegramId: BigInt(900004001), firstName: 'Test', username: null },
    });

    await notifyUser(testDb, bot, user.id, 'new_response', { lotId: 'lot-dedup', lotTitle: 'Дедуп' });
    await notifyUser(testDb, bot, user.id, 'new_response', { lotId: 'lot-dedup', lotTitle: 'Дедуп' });

    expect(calls).toHaveLength(1);

    const logs = await testDb.notification.findMany({
      where: { recipientTgId: BigInt(900004001), type: 'new_response', lotId: 'lot-dedup' },
    });
    expect(logs).toHaveLength(1);
  });

  it('разные type → обе отправки', async () => {
    const { bot, calls } = makeFakeBot();

    const user = await testDb.user.upsert({
      where: { telegramId: BigInt(900005001) },
      update: { firstName: 'Test', username: null },
      create: { telegramId: BigInt(900005001), firstName: 'Test', username: null },
    });

    await notifyUser(testDb, bot, user.id, 'new_response', { lotId: 'lot-x', lotTitle: 'X' });
    await notifyUser(testDb, bot, user.id, 'lot_activated', { lotId: 'lot-x', lotTitle: 'X' });

    expect(calls).toHaveLength(2);
  });

  it('разные lotId → обе отправки', async () => {
    const { bot, calls } = makeFakeBot();

    const user = await testDb.user.upsert({
      where: { telegramId: BigInt(900006001) },
      update: { firstName: 'Test', username: null },
      create: { telegramId: BigInt(900006001), firstName: 'Test', username: null },
    });

    await notifyUser(testDb, bot, user.id, 'new_response', { lotId: 'lot-a', lotTitle: 'A' });
    await notifyUser(testDb, bot, user.id, 'new_response', { lotId: 'lot-b', lotTitle: 'B' });

    expect(calls).toHaveLength(2);
  });
});

describe('Падение отправки — best-effort', () => {
  it('бот бросает → notifyUser не пробрасывает ошибку', async () => {
    const { bot } = makeFakeBot(true);

    const user = await testDb.user.upsert({
      where: { telegramId: BigInt(900007001) },
      update: { firstName: 'Test', username: null },
      create: { telegramId: BigInt(900007001), firstName: 'Test', username: null },
    });

    await expect(notifyUser(testDb, bot, user.id, 'lot_activated', { lotId: 'lot-err', lotTitle: 'Err' })).resolves.toBeUndefined();

    // Лог НЕ должен быть создан (отправка не удалась).
    const logs = await testDb.notification.findMany({ where: { type: 'lot_activated', lotId: 'lot-err' } });
    expect(logs).toHaveLength(0);
  });

  it('бот бросает → HTTP-запрос всё равно 2xx + изменение применено', async () => {
    const failBot = makeFakeBot(true).bot;

    const app = buildApp({ db: testDb, bot: failBot });
    await app.ready();

    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) }, // tgId=555000111 (admin)
    });
    const token = auth.json().token;
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
    const profRes = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { name: 'ООО Бот-фейл' },
    });
    const companyId = profRes.json().user.profile.id as string;

    const lot = await createActiveLot(companyId, 'Лот бот-фейл');

    // POST /lots/:id/complete — бот бросит, но запрос должен вернуть 200.
    const bloggerUser = await testDb.user.upsert({
      where: { telegramId: BigInt(900008001) },
      update: { firstName: 'Блогер', username: null },
      create: { telegramId: BigInt(900008001), firstName: 'Блогер', username: null },
    });
    const bloggerProfile = await testDb.bloggerProfile.upsert({
      where: { userId: bloggerUser.id },
      update: { displayName: 'Блогер', categories: ['Красота'], linkedAccounts: [] },
      create: { userId: bloggerUser.id, displayName: 'Блогер', categories: ['Красота'], linkedAccounts: [] },
    });
    await testDb.response.create({
      data: { lotId: lot.id, bloggerId: bloggerProfile.id, message: 'ok', status: 'accepted' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/complete`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.status).toBe('awaiting_payout');

    // Убеждаемся, что лот реально обновился в БД.
    const updatedLot = await testDb.lot.findUnique({ where: { id: lot.id } });
    expect(updatedLot?.status).toBe('awaiting_payout');

    await app.close();
  });
});

// ─────────────────────────── Интеграция: переходы триггерят уведомления ───────────────────────────

describe('POST /lots — admin_lot_to_verify', () => {
  it('новый лот → уведомление всем админам', async () => {
    const { bot, calls } = makeFakeBot();

    const app = buildApp({ db: testDb, bot });
    await app.ready();
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) }, // admin
    });
    const token = auth.json().token;
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
    await app.inject({ method: 'PUT', url: '/me/profile', headers: bearer(token), payload: { name: 'ООО Тест' } });

    await app.inject({
      method: 'POST',
      url: '/lots',
      headers: bearer(token),
      payload: {
        title: 'Новый лот',
        description: 'Описание',
        categories: ['Красота'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: futureISO(),
        requirements: [],
      },
    });

    // Ждём fire-and-forget.
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.some((c) => c.to === Number(ADMIN_TG_ID))).toBe(true);
    await app.close();
  });
});

describe('POST /lots/:id/responses — new_response', () => {
  it('блогер откликается → владелец лота получает уведомление', async () => {
    const { bot, calls } = makeFakeBot();

    const company = await companyClient(910001001);
    await company.app.close();
    const lot = await createActiveLot(company.companyId, 'Лот отклик');

    // Уведомления нужны для компании-владельца, но через HTTP используем buildApp с ботом.
    const blogger = await bloggerClient(910002001);

    // Создаём app для блогера с ботом.
    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();
    const authRes = await appWithBot.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 910002001 }) },
    });
    const bloggerToken = authRes.json().token;
    await blogger.app.close();

    await appWithBot.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses`,
      headers: bearer(bloggerToken),
      payload: { message: 'Хочу участвовать' },
    });

    await new Promise((r) => setTimeout(r, 30));

    // Владелец компании (tgId=910001001) должен получить уведомление.
    expect(calls.some((c) => c.to === 910001001)).toBe(true);
    await appWithBot.close();
  });
});

describe('accept/reject → уведомление блогеру', () => {
  it('accept → блогер получает response_accepted', async () => {
    const { bot, calls } = makeFakeBot();

    const company = await companyClient(920001001);
    const lot = await createActiveLot(company.companyId, 'Лот accept');
    const blogger = await bloggerClient(920002001);

    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();
    const authRes = await appWithBot.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 920001001 }) },
    });
    const companyToken = authRes.json().token;

    // Создаём отклик блогера напрямую.
    const resp = await testDb.response.create({
      data: { lotId: lot.id, bloggerId: blogger.bloggerId, message: 'ok', status: 'pending' },
    });

    await appWithBot.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses/${resp.id}/accept`,
      headers: bearer(companyToken),
    });

    await new Promise((r) => setTimeout(r, 30));

    expect(calls.some((c) => c.to === 920002001)).toBe(true);
    const msgs = calls.filter((c) => c.to === 920002001).map((c) => c.text);
    expect(msgs.some((m) => m.includes('принят'))).toBe(true);

    await appWithBot.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('reject явный → блогер получает response_rejected', async () => {
    const { bot, calls } = makeFakeBot();

    const company = await companyClient(930001001);
    const lot = await createActiveLot(company.companyId, 'Лот reject');
    const blogger = await bloggerClient(930002001);

    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();
    const authRes = await appWithBot.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 930001001 }) },
    });
    const companyToken = authRes.json().token;

    const resp = await testDb.response.create({
      data: { lotId: lot.id, bloggerId: blogger.bloggerId, message: 'ok', status: 'pending' },
    });

    await appWithBot.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses/${resp.id}/reject`,
      headers: bearer(companyToken),
    });

    await new Promise((r) => setTimeout(r, 30));

    expect(calls.some((c) => c.to === 930002001)).toBe(true);
    const msgs = calls.filter((c) => c.to === 930002001).map((c) => c.text);
    expect(msgs.some((m) => m.includes('отклонён'))).toBe(true);

    await appWithBot.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('accept с заполнением слотов → авто-reject уведомляет другого блогера', async () => {
    const { bot, calls } = makeFakeBot();

    const company = await companyClient(940001001);
    const lot = await createActiveLot(company.companyId, 'Лот автоотклон', 1);
    const b1 = await bloggerClient(940002001);
    const b2 = await bloggerClient(940003001);

    const resp1 = await testDb.response.create({
      data: { lotId: lot.id, bloggerId: b1.bloggerId, message: 'ok', status: 'pending' },
    });
    await testDb.response.create({
      data: { lotId: lot.id, bloggerId: b2.bloggerId, message: 'ok2', status: 'pending' },
    });

    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();
    const authRes = await appWithBot.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 940001001 }) },
    });
    const companyToken = authRes.json().token;

    // Принимаем b1 — b2 должен авто-отклониться.
    await appWithBot.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses/${resp1.id}/accept`,
      headers: bearer(companyToken),
    });

    await new Promise((r) => setTimeout(r, 30));

    // b1 → accepted
    expect(calls.some((c) => c.to === 940002001 && c.text.includes('принят'))).toBe(true);
    // b2 → rejected (авто)
    expect(calls.some((c) => c.to === 940003001 && c.text.includes('отклонён'))).toBe(true);

    await appWithBot.close();
    await company.app.close();
    await b1.app.close();
    await b2.app.close();
  });
});

describe('POST /lots/:id/complete — уведомления', () => {
  it('принятые получают lot_completed, pending→rejected получают response_rejected, админы admin_lot_to_payout', async () => {
    const { bot, calls } = makeFakeBot();

    const company = await companyClient(950001001);
    const lot = await createActiveLot(company.companyId, 'Лот complete', 1);
    const b1 = await bloggerClient(950002001); // будет accepted
    const b2 = await bloggerClient(950003001); // будет pending → rejected

    await testDb.response.create({
      data: { lotId: lot.id, bloggerId: b1.bloggerId, message: 'ok', status: 'accepted' },
    });
    await testDb.response.create({
      data: { lotId: lot.id, bloggerId: b2.bloggerId, message: 'ok2', status: 'pending' },
    });

    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();
    const authRes = await appWithBot.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 950001001 }) },
    });
    const companyToken = authRes.json().token;

    const res = await appWithBot.inject({
      method: 'POST',
      url: `/lots/${lot.id}/complete`,
      headers: bearer(companyToken),
    });
    expect(res.statusCode).toBe(200);

    await new Promise((r) => setTimeout(r, 30));

    // b1 (accepted) → lot_completed
    expect(calls.some((c) => c.to === 950002001 && c.text.includes('завершён'))).toBe(true);
    // b2 (pending) → response_rejected
    expect(calls.some((c) => c.to === 950003001 && c.text.includes('отклонён'))).toBe(true);
    // Админы → admin_lot_to_payout
    expect(calls.some((c) => c.to === Number(ADMIN_TG_ID) && c.text.includes('выплат'))).toBe(true);

    await appWithBot.close();
    await company.app.close();
    await b1.app.close();
    await b2.app.close();
  });
});

describe('POST /admin/lots/:id/activate — lot_activated', () => {
  it('активация → владелец лота получает уведомление', async () => {
    const { bot, calls } = makeFakeBot();

    const company = await companyClient(960001001);
    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Лот активация',
        description: 'Описание',
        categories: ['Красота'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'awaiting_payment',
      },
    });
    await company.app.close();

    // Используем admin-пользователя (tgId=555000111) для активации.
    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();
    const authRes = await appWithBot.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) }, // admin
    });
    const adminToken = authRes.json().token;

    await appWithBot.inject({
      method: 'POST',
      url: `/admin/lots/${lot.id}/activate`,
      headers: bearer(adminToken),
    });

    await new Promise((r) => setTimeout(r, 30));

    // Владелец (tgId=960001001) должен получить уведомление.
    expect(calls.some((c) => c.to === 960001001 && c.text.includes('активирован'))).toBe(true);

    await appWithBot.close();
  });
});

// ─────────────────────────── GET /me + PATCH /me/settings ───────────────────────────

describe('GET /me — notificationsEnabled', () => {
  it('дефолт true включён в ответ', async () => {
    const app = buildApp({ db: testDb });
    await app.ready();
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 970001001 }) },
    });
    const token = auth.json().token;

    const res = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.notificationsEnabled).toBe(true);
    await app.close();
  });
});

describe('PATCH /me/settings', () => {
  it('переключает notificationsEnabled', async () => {
    const app = buildApp({ db: testDb });
    await app.ready();
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 970002001 }) },
    });
    const token = auth.json().token;

    // Выключаем.
    const res1 = await app.inject({
      method: 'PATCH',
      url: '/me/settings',
      headers: bearer(token),
      payload: { notificationsEnabled: false },
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().user.notificationsEnabled).toBe(false);

    // Включаем обратно.
    const res2 = await app.inject({
      method: 'PATCH',
      url: '/me/settings',
      headers: bearer(token),
      payload: { notificationsEnabled: true },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().user.notificationsEnabled).toBe(true);

    // Проверяем в GET /me.
    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.json().user.notificationsEnabled).toBe(true);

    await app.close();
  });

  it('невалидное тело → 400', async () => {
    const app = buildApp({ db: testDb });
    await app.ready();
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 970003001 }) },
    });
    const token = auth.json().token;

    const res = await app.inject({
      method: 'PATCH',
      url: '/me/settings',
      headers: bearer(token),
      payload: { notificationsEnabled: 'yes' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('без токена → 401', async () => {
    const app = buildApp({ db: testDb });
    await app.ready();
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/settings',
      payload: { notificationsEnabled: false },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('notifyUser с notificationsEnabled=false через PATCH /me/settings', () => {
  it('после выключения уведомлений — бот не вызывается для этого пользователя', async () => {
    const { bot, calls } = makeFakeBot();

    const app = buildApp({ db: testDb });
    await app.ready();
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 970004001 }) },
    });
    const token = auth.json().token;
    const userId = auth.json().user.id;

    // Выключаем уведомления.
    await app.inject({
      method: 'PATCH',
      url: '/me/settings',
      headers: bearer(token),
      payload: { notificationsEnabled: false },
    });
    await app.close();

    // Вызываем сервис напрямую.
    await notifyUser(testDb, bot, userId, 'lot_activated', { lotId: 'lot-z', lotTitle: 'Z' });
    expect(calls).toHaveLength(0);
  });
});

describe('notifyBloggers — батч блогеров', () => {
  it('пачка блогеров → каждый получает уведомление', async () => {
    const { bot, calls } = makeFakeBot();

    const b1 = await bloggerClient(980001001);
    const b2 = await bloggerClient(980002001);
    await b1.app.close();
    await b2.app.close();

    await notifyBloggers(testDb, bot, [b1.bloggerId, b2.bloggerId], 'lot_completed', { lotId: 'lot-batch', lotTitle: 'Батч' });

    expect(calls.some((c) => c.to === 980001001)).toBe(true);
    expect(calls.some((c) => c.to === 980002001)).toBe(true);
  });
});
