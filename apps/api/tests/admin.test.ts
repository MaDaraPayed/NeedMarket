import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';

// vitest.config.ts задаёт ADMIN_TELEGRAM_IDS='555000111' — тот же id, что
// у стандартного signInitData(). Поэтому дефолтный пользователь — admin.
// Для не-администратора используем другой tgId.
const NON_ADMIN_TG_ID = 999000999;

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function futureISO(days = 7): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

// Компания с профилем. По умолчанию — пользователь с tgId=555000111 (admin).
async function companyClient(tgId?: number): Promise<{
  app: FastifyInstance;
  token: string;
  companyId: string;
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
    payload: { name: `ООО ${tgId ?? 'Ромашка'}`, contact: 'test@example.com' },
  });
  return { app, token, companyId: prof.json().user.profile.id };
}

// Залогиниться как компания без профиля (любой роли) — только для not-admin тестов.
async function nonAdminToken(): Promise<{ app: FastifyInstance; token: string }> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: NON_ADMIN_TG_ID }) },
  });
  return { app, token: auth.json().token };
}

async function createLot(app: FastifyInstance, token: string, title = 'Тест-лот') {
  return app.inject({
    method: 'POST',
    url: '/lots',
    headers: bearer(token),
    payload: {
      title,
      description: 'Описание',
      categories: ['Бьюти'],
      platforms: ['Instagram'],
      budget: 100_000,
      deadline: futureISO(),
      requirements: [],
    },
  });
}

// ─────────────────────────── /me isAdmin ───────────────────────────

describe('GET /me — isAdmin', () => {
  it('admin-пользователь видит isAdmin=true', async () => {
    const { app, token } = await companyClient();
    const res = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.isAdmin).toBe(true);
    await app.close();
  });

  it('обычный пользователь видит isAdmin=false', async () => {
    const { app, token } = await nonAdminToken();
    const res = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.isAdmin).toBe(false);
    await app.close();
  });
});

// ─────────────────────────── GET /admin/lots ───────────────────────────

describe('GET /admin/lots', () => {
  it('не-админ → 403', async () => {
    const { app, token } = await nonAdminToken();
    const res = await app.inject({ method: 'GET', url: '/admin/lots', headers: bearer(token) });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('без токена → 401', async () => {
    const { app } = await companyClient();
    const res = await app.inject({ method: 'GET', url: '/admin/lots' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('дефолт: возвращает лоты awaiting_payment с данными компании и username владельца', async () => {
    const { app, token } = await companyClient(); // tgId=555000111 (admin + owner)
    await createLot(app, token, 'Лот-1');
    await createLot(app, token, 'Лот-2');

    // active-лот не должен попасть в дефолтный список awaiting_payment
    await testDb.lot.create({
      data: {
        companyId: (await testDb.companyProfile.findFirst())!.id,
        title: 'Активный',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 50_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'active',
      },
    });

    const res = await app.inject({ method: 'GET', url: '/admin/lots', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const lots = res.json().lots;
    expect(lots).toHaveLength(2);
    // Каждый лот несёт данные компании и username
    expect(lots[0].company.name).toBe('ООО Ромашка');
    expect(lots[0].company.contact).toBe('test@example.com');
    expect(lots[0].ownerTelegramUsername).toBe('alice'); // signInitData фиксирует username='alice'
    expect(lots[0].status).toBe('awaiting_payment');
    await app.close();
  });

  it('?status=active фильтрует по нужному статусу', async () => {
    const { app, token, companyId } = await companyClient();
    await createLot(app, token, 'Ждёт'); // awaiting_payment
    await testDb.lot.create({
      data: {
        companyId,
        title: 'Активный',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 50_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'active',
      },
    });

    const res = await app.inject({ method: 'GET', url: '/admin/lots?status=active', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const lots = res.json().lots;
    expect(lots).toHaveLength(1);
    expect(lots[0].title).toBe('Активный');
    await app.close();
  });
});

// ─────────────────────────── POST /admin/lots/:id/activate ───────────────────────────

describe('POST /admin/lots/:id/activate', () => {
  it('не-админ → 403', async () => {
    const admin = await companyClient();
    const lotRes = await createLot(admin.app, admin.token);
    const lotId = lotRes.json().lot.id;
    await admin.app.close();

    const { app, token } = await nonAdminToken();
    const res = await app.inject({
      method: 'POST',
      url: `/admin/lots/${lotId}/activate`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('без токена → 401', async () => {
    const { app, token } = await companyClient();
    const lotRes = await createLot(app, token);
    const lotId = lotRes.json().lot.id;
    const res = await app.inject({ method: 'POST', url: `/admin/lots/${lotId}/activate` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('несуществующий лот → 404', async () => {
    const { app, token } = await companyClient();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/lots/nonexistent_id/activate',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('лот awaiting_payment → переходит в active', async () => {
    const { app, token } = await companyClient();
    const lotRes = await createLot(app, token);
    const lotId = lotRes.json().lot.id;
    expect(lotRes.json().lot.status).toBe('awaiting_payment');

    const res = await app.inject({
      method: 'POST',
      url: `/admin/lots/${lotId}/activate`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.status).toBe('active');
    expect(res.json().lot.id).toBe(lotId);

    // Лот теперь появляется в ленте
    const feed = await app.inject({ method: 'GET', url: '/lots', headers: bearer(token) });
    expect(feed.json().lots.some((l: { id: string }) => l.id === lotId)).toBe(true);
    await app.close();
  });

  it('лот уже active → 409 (нельзя активировать снова)', async () => {
    const { app, token, companyId } = await companyClient();
    const lot = await testDb.lot.create({
      data: {
        companyId,
        title: 'Уже активный',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 50_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'active',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/admin/lots/${lot.id}/activate`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('активированный лот появляется в ленте GET /lots, но не виден до активации', async () => {
    const { app, token } = await companyClient();
    const lotRes = await createLot(app, token, 'Ждёт активации');
    const lotId = lotRes.json().lot.id;

    // До активации — не в ленте
    const before = await app.inject({ method: 'GET', url: '/lots', headers: bearer(token) });
    expect(before.json().lots.every((l: { id: string }) => l.id !== lotId)).toBe(true);

    // Активируем
    await app.inject({
      method: 'POST',
      url: `/admin/lots/${lotId}/activate`,
      headers: bearer(token),
    });

    // После активации — в ленте
    const after = await app.inject({ method: 'GET', url: '/lots', headers: bearer(token) });
    expect(after.json().lots.some((l: { id: string }) => l.id === lotId)).toBe(true);
    await app.close();
  });
});
