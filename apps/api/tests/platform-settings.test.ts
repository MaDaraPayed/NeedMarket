import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';
import { truncateAll } from './db';
import { getPlatformSettings } from '../src/services/platform-settings';

const ADMIN_TG_ID = 555000111;
const NON_ADMIN_TG_ID = 9990001;

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeEach(async () => {
  await truncateAll();
});

// ── Хелперы ──────────────────────────────────────────────────────────────────

async function adminClient(): Promise<{ app: FastifyInstance; token: string }> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST', url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
  });
  return { app, token: auth.json().token };
}

async function nonAdminClient(): Promise<{ app: FastifyInstance; token: string }> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST', url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: NON_ADMIN_TG_ID }) },
  });
  return { app, token: auth.json().token };
}

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
    payload: { displayName: `Блогер ${tgId}`, categories: ['Бьюти'], linkedAccounts: [] },
  });
  return { app, token, bloggerId: prof.json().user.profile.id, userId: prof.json().user.id };
}

async function companyClient(tgId: number): Promise<{
  app: FastifyInstance; token: string; companyId: string;
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
  return { app, token, companyId: prof.json().user.profile.id };
}

function makeFakeBot() {
  const calls: { to: number; text: string }[] = [];
  const bot = {
    api: {
      sendMessage: async (chatId: number, text: string) => {
        calls.push({ to: chatId, text });
        return { ok: true };
      },
    },
  } as unknown as import('grammy').Bot;
  return { bot, calls };
}

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
      categories: opts.categories ?? ['Бьюти'],
      platforms: opts.platforms ?? ['Instagram'],
      budget: opts.budget ?? 100_000,
      deadline: new Date(Date.now() + 7 * 86_400_000),
      requirements: [],
      status: 'awaiting_payment',
    },
  });
  await adminApp.inject({
    method: 'POST',
    url: `/admin/lots/${lot.id}/activate`,
    headers: bearer(adminToken),
  });
  return lot;
}

// ── getPlatformSettings ───────────────────────────────────────────────────────

describe('getPlatformSettings', () => {
  it('создаёт синглтон с дефолтами если строки нет', async () => {
    const settings = await getPlatformSettings(testDb);
    expect(settings.id).toBe('global');
    expect(settings.budgetFilterEnabled).toBe(false);
  });

  it('идемпотентен: повторный вызов возвращает ту же строку', async () => {
    await getPlatformSettings(testDb);
    const settings = await getPlatformSettings(testDb);
    expect(settings.budgetFilterEnabled).toBe(false);
  });
});

// ── GET /admin/settings ───────────────────────────────────────────────────────

describe('GET /admin/settings', () => {
  it('возвращает дефолтные настройки (budgetFilterEnabled=false)', async () => {
    const { app, token } = await adminClient();
    const res = await app.inject({
      method: 'GET', url: '/admin/settings', headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.budgetFilterEnabled).toBe(false);
    await app.close();
  });

  it('не-админ → 403', async () => {
    const { app, token } = await nonAdminClient();
    const res = await app.inject({
      method: 'GET', url: '/admin/settings', headers: bearer(token),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ── PATCH /admin/settings ─────────────────────────────────────────────────────

describe('PATCH /admin/settings', () => {
  it('включает флаг budgetFilterEnabled', async () => {
    const { app, token } = await adminClient();
    const res = await app.inject({
      method: 'PATCH', url: '/admin/settings', headers: bearer(token),
      payload: { budgetFilterEnabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.budgetFilterEnabled).toBe(true);
    await app.close();
  });

  it('выключает флаг обратно', async () => {
    const { app, token } = await adminClient();
    await app.inject({
      method: 'PATCH', url: '/admin/settings', headers: bearer(token),
      payload: { budgetFilterEnabled: true },
    });
    const res = await app.inject({
      method: 'PATCH', url: '/admin/settings', headers: bearer(token),
      payload: { budgetFilterEnabled: false },
    });
    expect(res.json().settings.budgetFilterEnabled).toBe(false);
    await app.close();
  });

  it('не-админ → 403', async () => {
    const { app, token } = await nonAdminClient();
    const res = await app.inject({
      method: 'PATCH', url: '/admin/settings', headers: bearer(token),
      payload: { budgetFilterEnabled: true },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('невалидный payload → 400', async () => {
    const { app, token } = await adminClient();
    const res = await app.inject({
      method: 'PATCH', url: '/admin/settings', headers: bearer(token),
      payload: { budgetFilterEnabled: 'yes' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── GET /me includer platformSettings ────────────────────────────────────────

describe('GET /me — platformSettings', () => {
  it('возвращает platformSettings с budgetFilterEnabled=false по умолчанию', async () => {
    const { app, token } = await adminClient();
    const res = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.platformSettings).toEqual({ budgetFilterEnabled: false });
    await app.close();
  });

  it('отражает актуальное значение флага', async () => {
    const { app, token } = await adminClient();
    await app.inject({
      method: 'PATCH', url: '/admin/settings', headers: bearer(token),
      payload: { budgetFilterEnabled: true },
    });
    const res = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(res.json().user.platformSettings.budgetFilterEnabled).toBe(true);
    await app.close();
  });
});

// ── Матчинг сохранённых поисков ───────────────────────────────────────────────

describe('matchSavedSearches — флаг budgetFilterEnabled', () => {
  it('при false: сохранённый поиск с minBudget матчит лот с меньшим бюджетом', async () => {
    const { bot, calls } = makeFakeBot();
    const company = await companyClient(5100001);
    const blogger = await bloggerClient(5100002);

    // Блогер ищет лоты от 500 000 ₸
    await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: ['Бьюти'], platforms: [], minBudget: 500_000 },
    });

    // Флаг выключен (default)
    const adminApp = buildApp({ db: testDb, bot });
    await adminApp.ready();
    const adminAuth = await adminApp.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = adminAuth.json().token;

    // Активируем лот с бюджетом 100 000 — МЕНЬШЕ minBudget
    await createAndActivateLot(adminToken, adminApp, company.companyId, {
      categories: ['Бьюти'], platforms: ['Instagram'], budget: 100_000,
    });
    await new Promise((r) => setTimeout(r, 80));

    // При budgetFilterEnabled=false → бюджет игнорируется → блогер получает уведомление
    expect(calls.some((c) => c.to === 5100002)).toBe(true);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('при true: сохранённый поиск с minBudget НЕ матчит лот с меньшим бюджетом', async () => {
    const { bot, calls } = makeFakeBot();
    const company = await companyClient(5200001);
    const blogger = await bloggerClient(5200002);

    await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: ['Бьюти'], platforms: [], minBudget: 500_000 },
    });

    const adminApp = buildApp({ db: testDb, bot });
    await adminApp.ready();
    const adminAuth = await adminApp.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = adminAuth.json().token;

    // Включаем фильтр бюджета
    await adminApp.inject({
      method: 'PATCH', url: '/admin/settings', headers: bearer(adminToken),
      payload: { budgetFilterEnabled: true },
    });

    await createAndActivateLot(adminToken, adminApp, company.companyId, {
      categories: ['Бьюти'], platforms: ['Instagram'], budget: 100_000,
    });
    await new Promise((r) => setTimeout(r, 80));

    // При budgetFilterEnabled=true → бюджет < minBudget → уведомления нет
    expect(calls.some((c) => c.to === 5200002)).toBe(false);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('при true: бюджет >= minBudget → уведомление приходит (прежнее поведение)', async () => {
    const { bot, calls } = makeFakeBot();
    const company = await companyClient(5300001);
    const blogger = await bloggerClient(5300002);

    await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: ['Бьюти'], platforms: [], minBudget: 50_000 },
    });

    const adminApp = buildApp({ db: testDb, bot });
    await adminApp.ready();
    const adminAuth = await adminApp.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = adminAuth.json().token;

    await adminApp.inject({
      method: 'PATCH', url: '/admin/settings', headers: bearer(adminToken),
      payload: { budgetFilterEnabled: true },
    });

    await createAndActivateLot(adminToken, adminApp, company.companyId, {
      categories: ['Бьюти'], platforms: ['Instagram'], budget: 100_000,
    });
    await new Promise((r) => setTimeout(r, 80));

    expect(calls.some((c) => c.to === 5300002)).toBe(true);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('категории и платформы матчатся при любом значении флага', async () => {
    const { bot, calls } = makeFakeBot();
    const company = await companyClient(5400001);
    const blogger = await bloggerClient(5400002);

    await blogger.app.inject({
      method: 'POST', url: '/me/saved-searches', headers: bearer(blogger.token),
      payload: { categories: ['Игры'], platforms: ['TikTok'], minBudget: null },
    });

    const adminApp = buildApp({ db: testDb, bot });
    await adminApp.ready();
    const adminAuth = await adminApp.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
    });
    const adminToken = adminAuth.json().token;

    // Лот другой категории — не матчит
    await createAndActivateLot(adminToken, adminApp, company.companyId, {
      categories: ['Бьюти'], platforms: ['Instagram'], budget: 100_000,
    });
    await new Promise((r) => setTimeout(r, 80));
    expect(calls.some((c) => c.to === 5400002)).toBe(false);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });
});
