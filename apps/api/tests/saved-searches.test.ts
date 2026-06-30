import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';
import { truncateAll } from './db';

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function futureISO(days = 7): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

beforeEach(async () => {
  await truncateAll();
});

// ── Хелперы ──────────────────────────────────────────────────────────────────

async function bloggerClient(tgId: number): Promise<{
  app: FastifyInstance; token: string; bloggerId: string; userId: string;
}> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST', url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: tgId }) },
  });
  const token = auth.json().token;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
  const prof = await app.inject({
    method: 'PUT', url: '/me/profile', headers: bearer(token),
    payload: { displayName: `Блогер ${tgId}`, phone: '+77000000001', categories: ['Красота'], linkedAccounts: [] },
  });
  return { app, token, bloggerId: prof.json().user.profile.id, userId: prof.json().user.id };
}

async function companyClient(tgId: number): Promise<{
  app: FastifyInstance; token: string; companyId: string; userId: string;
}> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST', url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: tgId }) },
  });
  const token = auth.json().token;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
  const prof = await app.inject({
    method: 'PUT', url: '/me/profile', headers: bearer(token),
    payload: { name: `ООО ${tgId}` },
  });
  return { app, token, companyId: prof.json().user.profile.id, userId: prof.json().user.id };
}

// Создаёт awaiting_payment лот и активирует его через /admin/lots/:id/activate.
async function createAndActivateLot(
  adminToken: string,
  adminApp: FastifyInstance,
  companyId: string,
  opts: { categories?: string[]; platforms?: string[]; budget?: number } = {},
) {
  const lot = await testDb.lot.create({
    data: {
      companyId,
      title: 'Тест-лот',
      description: 'Описание',
      categories: opts.categories ?? ['Красота'],
      platforms: opts.platforms ?? ['Instagram'],
      budget: opts.budget ?? 100_000,
      deadline: new Date(Date.now() + 7 * 86_400_000),
      requirements: [],
      status: 'awaiting_payment',
    },
  });
  const res = await adminApp.inject({
    method: 'POST',
    url: `/admin/lots/${lot.id}/activate`,
    headers: bearer(adminToken),
  });
  return { lot, activateRes: res };
}

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

// ── CRUD: авторизация ─────────────────────────────────────────────────────────

describe('POST /me/saved-searches — авторизация', () => {
  it('blogger без профиля → 400', async () => {
    const app = buildApp({ db: testDb });
    await app.ready();
    const auth = await app.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 1100001 }) },
    });
    const token = auth.json().token;
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });

    const res = await app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(token),
      payload: { categories: [], platforms: [] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('company → 403', async () => {
    const company = await companyClient(1100002);
    const res = await company.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(company.token),
      payload: { categories: [], platforms: [] },
    });
    expect(res.statusCode).toBe(403);
    await company.app.close();
  });

  it('без токена → 401', async () => {
    const app = buildApp({ db: testDb });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/me/saved-searches',
      payload: { categories: [], platforms: [] },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('blogger создаёт поиск → 201', async () => {
    const blogger = await bloggerClient(1100003);
    const res = await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { name: 'Мой поиск', categories: ['Красота'], platforms: ['Instagram'], minBudget: 50000 },
    });
    expect(res.statusCode).toBe(201);
    const s = res.json().savedSearch;
    expect(s.name).toBe('Мой поиск');
    expect(s.categories).toEqual(['Красота']);
    expect(s.platforms).toEqual(['Instagram']);
    expect(s.minBudget).toBe(50000);
    expect(s.isActive).toBe(true);
    await blogger.app.close();
  });
});

// ── CRUD: валидация ────────────────────────────────────────────────────────────

describe('POST /me/saved-searches — валидация', () => {
  it('категория вне списка → 400', async () => {
    const blogger = await bloggerClient(1200001);
    const res = await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: ['НесуществующаяКатегория'], platforms: [] },
    });
    expect(res.statusCode).toBe(400);
    await blogger.app.close();
  });

  it('платформа вне списка → 400', async () => {
    const blogger = await bloggerClient(1200002);
    const res = await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: [], platforms: ['MySpace'] },
    });
    expect(res.statusCode).toBe(400);
    await blogger.app.close();
  });

  it('отрицательный бюджет → 400', async () => {
    const blogger = await bloggerClient(1200003);
    const res = await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: [], platforms: [], minBudget: -1 },
    });
    expect(res.statusCode).toBe(400);
    await blogger.app.close();
  });

  it('лимит 20 поисков → 21-й возвращает 400', async () => {
    const blogger = await bloggerClient(1200004);
    for (let i = 0; i < 20; i++) {
      const r = await blogger.app.inject({
        method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
        payload: { categories: [], platforms: [] },
      });
      expect(r.statusCode).toBe(201);
    }
    const extra = await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: [], platforms: [] },
    });
    expect(extra.statusCode).toBe(400);
    expect(extra.json().error).toMatch(/limit/i);
    await blogger.app.close();
  });
});

// ── CRUD: GET ─────────────────────────────────────────────────────────────────

describe('GET /me/saved-searches', () => {
  it('возвращает только свои поиски', async () => {
    const b1 = await bloggerClient(1300001);
    const b2 = await bloggerClient(1300002);
    await b1.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(b1.token),
      payload: { categories: ['Питание'], platforms: [] },
    });
    const res = await b2.app.inject({
      method: 'GET', url: '/me/saved-searches', headers: bearer(b2.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().savedSearches).toHaveLength(0);
    await b1.app.close();
    await b2.app.close();
  });

  it('company → 403', async () => {
    const company = await companyClient(1300003);
    const res = await company.app.inject({
      method: 'GET', url: '/me/saved-searches', headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(403);
    await company.app.close();
  });
});

// ── CRUD: PATCH ───────────────────────────────────────────────────────────────

describe('PATCH /me/saved-searches/:id', () => {
  it('блогер редактирует свой поиск', async () => {
    const blogger = await bloggerClient(1400001);
    const created = await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: ['Красота'], platforms: [], minBudget: 10000 },
    });
    const id = created.json().savedSearch.id;

    const res = await blogger.app.inject({
      method: 'PATCH', url: `/me/saved-searches/${id}`, headers: bearer(blogger.token),
      payload: { minBudget: 50000, isActive: false },
    });
    expect(res.statusCode).toBe(200);
    const s = res.json().savedSearch;
    expect(s.minBudget).toBe(50000);
    expect(s.isActive).toBe(false);
    await blogger.app.close();
  });

  it('чужой поиск → 403', async () => {
    const b1 = await bloggerClient(1400002);
    const b2 = await bloggerClient(1400003);
    const created = await b1.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(b1.token),
      payload: { categories: [], platforms: [] },
    });
    const id = created.json().savedSearch.id;

    const res = await b2.app.inject({
      method: 'PATCH', url: `/me/saved-searches/${id}`, headers: bearer(b2.token),
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
    await b1.app.close();
    await b2.app.close();
  });

  it('несуществующий → 404', async () => {
    const blogger = await bloggerClient(1400004);
    const res = await blogger.app.inject({
      method: 'PATCH', url: '/me/saved-searches/nonexistent', headers: bearer(blogger.token),
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(404);
    await blogger.app.close();
  });
});

// ── CRUD: DELETE ──────────────────────────────────────────────────────────────

describe('DELETE /me/saved-searches/:id', () => {
  it('блогер удаляет свой поиск → 204', async () => {
    const blogger = await bloggerClient(1500001);
    const created = await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: [], platforms: [] },
    });
    const id = created.json().savedSearch.id;
    const res = await blogger.app.inject({
      method: 'DELETE', url: `/me/saved-searches/${id}`, headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(204);

    // Проверяем, что поиск исчез.
    const list = await blogger.app.inject({
      method: 'GET', url: '/me/saved-searches', headers: bearer(blogger.token),
    });
    expect(list.json().savedSearches).toHaveLength(0);
    await blogger.app.close();
  });

  it('чужой поиск → 403', async () => {
    const b1 = await bloggerClient(1500002);
    const b2 = await bloggerClient(1500003);
    const created = await b1.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(b1.token),
      payload: { categories: [], platforms: [] },
    });
    const id = created.json().savedSearch.id;
    const res = await b2.app.inject({
      method: 'DELETE', url: `/me/saved-searches/${id}`, headers: bearer(b2.token),
    });
    expect(res.statusCode).toBe(403);
    await b1.app.close();
    await b2.app.close();
  });

  it('несуществующий → 404', async () => {
    const blogger = await bloggerClient(1500004);
    const res = await blogger.app.inject({
      method: 'DELETE', url: '/me/saved-searches/nonexistent', headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(404);
    await blogger.app.close();
  });
});

// ── Матчинг ───────────────────────────────────────────────────────────────────

// Нужен admin-пользователь (tgId=555000111 по vitest.config.ts).
const ADMIN_TG_ID = 555000111;

async function adminClient(): Promise<{ app: FastifyInstance; token: string }> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST', url: '/auth/telegram',
    payload: { initData: signInitData(new Date()) }, // admin tgId по умолчанию
  });
  return { app, token: auth.json().token };
}

describe('Матчинг при активации лота', () => {
  it('совпадающий активный поиск → notifyUser вызван для блогера', async () => {
    const { bot, calls } = makeFakeBot();

    const company = await companyClient(1600001);
    const blogger = await bloggerClient(1600002);
    // Создаём поиск: категория Красота, платформа Instagram, бюджет ≥ 50 000.
    await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: ['Красота'], platforms: ['Instagram'], minBudget: 50000 },
    });

    const adminApp = buildApp({ db: testDb, bot });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = auth.json().token;

    const { activateRes } = await createAndActivateLot(adminToken, adminApp, company.companyId, {
      categories: ['Красота'], platforms: ['Instagram'], budget: 100_000,
    });
    expect(activateRes.statusCode).toBe(200);

    // Ждём fire-and-forget.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.some((c) => c.to === 1600002 && c.text.includes('поиску'))).toBe(true);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('несовпадающая категория → уведомление не отправляется', async () => {
    const { bot, calls } = makeFakeBot();

    const company = await companyClient(1700001);
    const blogger = await bloggerClient(1700002);
    await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: ['Питание'], platforms: [], minBudget: null },
    });

    const adminApp = buildApp({ db: testDb, bot });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = auth.json().token;

    await createAndActivateLot(adminToken, adminApp, company.companyId, {
      categories: ['Красота'], platforms: ['Instagram'], budget: 100_000,
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.some((c) => c.to === 1700002)).toBe(false);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('выключенный поиск (isActive=false) → уведомление не отправляется', async () => {
    const { bot, calls } = makeFakeBot();

    const company = await companyClient(1800001);
    const blogger = await bloggerClient(1800002);
    const created = await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: ['Красота'], platforms: [], minBudget: null },
    });
    const id = created.json().savedSearch.id;
    // Выключаем поиск.
    await blogger.app.inject({
      method: 'PATCH', url: `/me/saved-searches/${id}`, headers: bearer(blogger.token),
      payload: { isActive: false },
    });

    const adminApp = buildApp({ db: testDb, bot });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = auth.json().token;

    await createAndActivateLot(adminToken, adminApp, company.companyId, {
      categories: ['Красота'], platforms: ['Instagram'], budget: 100_000,
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.some((c) => c.to === 1800002)).toBe(false);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('пустые categories = любая категория → совпадает', async () => {
    const { bot, calls } = makeFakeBot();

    const company = await companyClient(1900001);
    const blogger = await bloggerClient(1900002);
    // Пустые категории — любая.
    await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: [], platforms: [], minBudget: null },
    });

    const adminApp = buildApp({ db: testDb, bot });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = auth.json().token;

    await createAndActivateLot(adminToken, adminApp, company.companyId, {
      categories: ['Игры'], platforms: ['TikTok'], budget: 100_000,
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.some((c) => c.to === 1900002)).toBe(true);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('budget < minBudget → уведомление не отправляется', async () => {
    const { bot, calls } = makeFakeBot();

    const company = await companyClient(2000001);
    const blogger = await bloggerClient(2000002);
    await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: [], platforms: [], minBudget: 200000 },
    });

    const adminApp = buildApp({ db: testDb, bot });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = auth.json().token;

    // Включаем фильтр бюджета, чтобы minBudget учитывался при матчинге.
    await adminApp.inject({
      method: 'PATCH', url: '/admin/settings', headers: bearer(adminToken),
      payload: { budgetFilterEnabled: true },
    });

    await createAndActivateLot(adminToken, adminApp, company.companyId, {
      categories: ['Красота'], platforms: ['Instagram'], budget: 100_000,
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.some((c) => c.to === 2000002)).toBe(false);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('две подписки одного блогера → один вызов notifyUser', async () => {
    const { bot, calls } = makeFakeBot();

    const company = await companyClient(2100001);
    const blogger = await bloggerClient(2100002);
    // Два совпадающих поиска.
    await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: ['Красота'], platforms: [], minBudget: null },
    });
    await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: [], platforms: ['Instagram'], minBudget: null },
    });

    const adminApp = buildApp({ db: testDb, bot });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = auth.json().token;

    await createAndActivateLot(adminToken, adminApp, company.companyId, {
      categories: ['Красота'], platforms: ['Instagram'], budget: 100_000,
    });
    await new Promise((r) => setTimeout(r, 50));
    // Блогер 2100002 должен получить ровно один пинг.
    expect(calls.filter((c) => c.to === 2100002)).toHaveLength(1);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('падение bot.sendMessage не валит активацию', async () => {
    const { bot } = makeFakeBot(true); // бот бросает ошибку

    const company = await companyClient(2200001);
    const blogger = await bloggerClient(2200002);
    await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: ['Красота'], platforms: [], minBudget: null },
    });

    const adminApp = buildApp({ db: testDb, bot });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = auth.json().token;

    const { activateRes } = await createAndActivateLot(adminToken, adminApp, company.companyId, {
      categories: ['Красота'], platforms: [], budget: 100_000,
    });
    // Активация прошла несмотря на ошибку бота.
    expect(activateRes.statusCode).toBe(200);
    expect(activateRes.json().lot.status).toBe('active');

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('lot_activated владельцу по-прежнему отправляется вместе с матчингом', async () => {
    const { bot, calls } = makeFakeBot();

    const company = await companyClient(2300001);
    const blogger = await bloggerClient(2300002);
    await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: ['Красота'], platforms: [], minBudget: null },
    });

    const adminApp = buildApp({ db: testDb, bot });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = auth.json().token;

    await createAndActivateLot(adminToken, adminApp, company.companyId, {
      categories: ['Красота'], platforms: ['Instagram'], budget: 100_000,
    });
    await new Promise((r) => setTimeout(r, 50));

    // Компания-владелец (tgId=2300001) получает lot_activated.
    expect(calls.some((c) => c.to === 2300001 && c.text.includes('активирован'))).toBe(true);
    // Блогер получает saved_search_match.
    expect(calls.some((c) => c.to === 2300002 && c.text.includes('поиску'))).toBe(true);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });
});
