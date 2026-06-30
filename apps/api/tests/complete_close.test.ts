import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';

// ADMIN_TELEGRAM_IDS='555000111' в vitest.config.ts — дефолтный signInitData → admin.
const NON_ADMIN_TG_ID = 999000999;

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function futureISO(days = 7): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

// Компания с профилем. tgId=555000111 по умолчанию (admin + owner).
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

// Блогер с профилем.
async function bloggerClient(tgId: number): Promise<{
  app: FastifyInstance;
  token: string;
  bloggerId: string;
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
    payload: {
      displayName: `Блогер ${tgId}`,
      phone: '+77000000001',
      categories: ['Красота'],
      linkedAccounts: [{ platform: 'Instagram', url: 'https://instagram.com/test' }],
      contact: `contact_${tgId}`,
    },
  });
  return { app, token, bloggerId: prof.json().user.profile.id };
}

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

// Создаёт лот напрямую в БД со статусом active (обход gate оплаты).
async function createActiveLot(companyId: string, slotsNeeded = 1): Promise<string> {
  const lot = await testDb.lot.create({
    data: {
      companyId,
      title: 'Тестовый лот',
      description: 'Описание',
      categories: ['Красота'],
      platforms: ['Instagram'],
      budget: 200_000,
      deadline: new Date(Date.now() + 7 * 86_400_000),
      requirements: [],
      status: 'active',
      slotsNeeded,
    },
  });
  return lot.id;
}

async function createResponse(app: FastifyInstance, token: string, lotId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/lots/${lotId}/responses`,
    headers: bearer(token),
    payload: { message: 'Хочу участвовать' },
  });
  return res.json().response.id;
}

async function acceptResponse(app: FastifyInstance, token: string, lotId: string, responseId: string) {
  await app.inject({
    method: 'POST',
    url: `/lots/${lotId}/responses/${responseId}/accept`,
    headers: bearer(token),
  });
}

// ─────────────────────── POST /lots/:id/complete ───────────────────────

describe('POST /lots/:id/complete', () => {
  it('не-владелец компания → 403', async () => {
    const owner = await companyClient(600001001);
    const lotId = await createActiveLot(owner.companyId);
    const blogger = await bloggerClient(601001001);
    const rId = await createResponse(blogger.app, blogger.token, lotId);
    await acceptResponse(owner.app, owner.token, lotId, rId);
    await blogger.app.close();
    await owner.app.close();

    const other = await companyClient(600001002);
    const res = await other.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/complete`,
      headers: bearer(other.token),
    });
    expect(res.statusCode).toBe(403);
    await other.app.close();
  });

  it('не-компания (blogger) → 403', async () => {
    const owner = await companyClient(600002001);
    const lotId = await createActiveLot(owner.companyId);
    const blogger = await bloggerClient(601002001);
    const rId = await createResponse(blogger.app, blogger.token, lotId);
    await acceptResponse(owner.app, owner.token, lotId, rId);
    await owner.app.close();

    const res = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/complete`,
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(403);
    await blogger.app.close();
  });

  it('лот active + 1 accepted → awaiting_payout, pending → rejected', async () => {
    const owner = await companyClient(600003001);
    const lotId = await createActiveLot(owner.companyId, 2); // 2 слота — можно принять 1 и остаться active

    const b1 = await bloggerClient(601003001);
    const b2 = await bloggerClient(601003002);
    const rId1 = await createResponse(b1.app, b1.token, lotId);
    await createResponse(b2.app, b2.token, lotId);
    await b1.app.close();
    await b2.app.close();

    // Принимаем только первого — лот остаётся active (2 слота).
    await acceptResponse(owner.app, owner.token, lotId, rId1);

    const lotBefore = await testDb.lot.findUnique({ where: { id: lotId } });
    expect(lotBefore?.status).toBe('active');

    const res = await owner.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/complete`,
      headers: bearer(owner.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.status).toBe('awaiting_payout');

    const lot = await testDb.lot.findUnique({ where: { id: lotId } });
    expect(lot?.status).toBe('awaiting_payout');

    // Pending отклик b2 → rejected.
    const responses = await testDb.response.findMany({ where: { lotId } });
    const accepted = responses.filter((r) => r.status === 'accepted');
    const rejected = responses.filter((r) => r.status === 'rejected');
    const pending = responses.filter((r) => r.status === 'pending');
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(pending).toHaveLength(0);

    await owner.app.close();
  });

  it('лот in_progress + accepted → awaiting_payout', async () => {
    const owner = await companyClient(600004001);
    const lotId = await createActiveLot(owner.companyId, 1);

    const blogger = await bloggerClient(601004001);
    const rId = await createResponse(blogger.app, blogger.token, lotId);
    await blogger.app.close();
    // Принимаем единственного → лот in_progress.
    await acceptResponse(owner.app, owner.token, lotId, rId);

    const lotBefore = await testDb.lot.findUnique({ where: { id: lotId } });
    expect(lotBefore?.status).toBe('in_progress');

    const res = await owner.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/complete`,
      headers: bearer(owner.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.status).toBe('awaiting_payout');

    await owner.app.close();
  });

  it('0 принятых откликов → 409', async () => {
    const owner = await companyClient(600005001);
    const lotId = await createActiveLot(owner.companyId);

    const blogger = await bloggerClient(601005001);
    await createResponse(blogger.app, blogger.token, lotId);
    await blogger.app.close();

    const res = await owner.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/complete`,
      headers: bearer(owner.token),
    });
    expect(res.statusCode).toBe(409);
    await owner.app.close();
  });

  it('лот awaiting_payment → 409', async () => {
    const owner = await companyClient(600006001);
    const lot = await testDb.lot.create({
      data: {
        companyId: owner.companyId,
        title: 'Лот',
        description: '—',
        categories: ['Красота'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'awaiting_payment',
      },
    });

    const res = await owner.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/complete`,
      headers: bearer(owner.token),
    });
    expect(res.statusCode).toBe(409);
    await owner.app.close();
  });

  it('лот completed → 409', async () => {
    const owner = await companyClient(600007001);
    const lot = await testDb.lot.create({
      data: {
        companyId: owner.companyId,
        title: 'Завершённый',
        description: '—',
        categories: ['Красота'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'completed',
      },
    });

    const res = await owner.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/complete`,
      headers: bearer(owner.token),
    });
    expect(res.statusCode).toBe(409);
    await owner.app.close();
  });

  it('уведомление бота вызывается best-effort (не блокирует, стаб бота)', async () => {
    let botCalled = false;
    const fakeBot = {
      api: {
        sendMessage: async () => {
          botCalled = true;
          return { ok: true };
        },
      },
    } as unknown as import('grammy').Bot;

    // Строим app с fakeBot; используем admin-пользователя (tgId=555000111) как владельца лота.
    const app = buildApp({ db: testDb, bot: fakeBot });
    await app.ready();
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) }, // tgId=555000111
    });
    const token = auth.json().token;
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
    const profRes = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { name: 'ООО Бот-тест', contact: 'bot@example.com' },
    });
    const companyId = profRes.json().user.profile.id as string;

    // Лот напрямую в БД (active).
    const lot = await testDb.lot.create({
      data: {
        companyId,
        title: 'Лот для бот-теста',
        description: '—',
        categories: ['Красота'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'active',
        slotsNeeded: 1,
      },
    });

    // Блогер-профиль + отклик напрямую в БД (нет нужды в HTTP-слое для setup).
    const bloggerUser = await testDb.user.upsert({
      where: { telegramId: BigInt(609008001) },
      update: { firstName: 'Блогер', username: null },
      create: { telegramId: BigInt(609008001), firstName: 'Блогер', username: null },
    });
    const bloggerProfile = await testDb.bloggerProfile.upsert({
      where: { userId: bloggerUser.id },
      update: { displayName: 'Блогер бот', categories: ['Красота'], linkedAccounts: [] },
      create: { userId: bloggerUser.id, displayName: 'Блогер бот', categories: ['Красота'], linkedAccounts: [] },
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
    // Даём micro-tick завершиться (Promise.allSettled void).
    await new Promise((r) => setTimeout(r, 10));
    expect(botCalled).toBe(true);
    await app.close();
  });
});

// ─────────────────────── POST /admin/lots/:id/close ───────────────────────

describe('POST /admin/lots/:id/close', () => {
  it('не-админ → 403', async () => {
    const admin = await companyClient();
    const lotId = await createActiveLot(admin.companyId);
    await testDb.lot.update({ where: { id: lotId }, data: { status: 'awaiting_payout' } });
    await admin.app.close();

    const { app, token } = await nonAdminToken();
    const res = await app.inject({
      method: 'POST',
      url: `/admin/lots/${lotId}/close`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('awaiting_payout → completed', async () => {
    const admin = await companyClient();
    const lotId = await createActiveLot(admin.companyId);
    await testDb.lot.update({ where: { id: lotId }, data: { status: 'awaiting_payout' } });

    const res = await admin.app.inject({
      method: 'POST',
      url: `/admin/lots/${lotId}/close`,
      headers: bearer(admin.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.status).toBe('completed');

    const lot = await testDb.lot.findUnique({ where: { id: lotId } });
    expect(lot?.status).toBe('completed');
    await admin.app.close();
  });

  it('лот active → 409', async () => {
    const admin = await companyClient();
    const lotId = await createActiveLot(admin.companyId);

    const res = await admin.app.inject({
      method: 'POST',
      url: `/admin/lots/${lotId}/close`,
      headers: bearer(admin.token),
    });
    expect(res.statusCode).toBe(409);
    await admin.app.close();
  });

  it('лот completed → 409 (повторное закрытие)', async () => {
    const admin = await companyClient();
    const lot = await testDb.lot.create({
      data: {
        companyId: admin.companyId,
        title: 'Уже завершён',
        description: '—',
        categories: ['Красота'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'completed',
      },
    });

    const res = await admin.app.inject({
      method: 'POST',
      url: `/admin/lots/${lot.id}/close`,
      headers: bearer(admin.token),
    });
    expect(res.statusCode).toBe(409);
    await admin.app.close();
  });

  it('несуществующий лот → 404', async () => {
    const admin = await companyClient();
    const res = await admin.app.inject({
      method: 'POST',
      url: '/admin/lots/nonexistent/close',
      headers: bearer(admin.token),
    });
    expect(res.statusCode).toBe(404);
    await admin.app.close();
  });
});

// ─────────────────────── GET /admin/lots?status=awaiting_payout ───────────────────────

describe('GET /admin/lots?status=awaiting_payout', () => {
  it('возвращает budget/commission/payoutPool/acceptedBloggers без N+1', async () => {
    // admin = tgId=555000111 (admin), чтобы GET /admin/lots работало.
    const admin = await companyClient();
    const lotId = await createActiveLot(admin.companyId, 1);

    const blogger = await bloggerClient(701001001);
    const rId = await createResponse(blogger.app, blogger.token, lotId);
    await blogger.app.close();
    await acceptResponse(admin.app, admin.token, lotId, rId);
    // Переводим в awaiting_payout напрямую (минуем complete).
    await testDb.lot.update({ where: { id: lotId }, data: { status: 'awaiting_payout' } });

    const res = await admin.app.inject({
      method: 'GET',
      url: '/admin/lots?status=awaiting_payout',
      headers: bearer(admin.token),
    });
    expect(res.statusCode).toBe(200);
    const lots = res.json().lots;
    expect(lots).toHaveLength(1);
    const lot = lots[0];

    // Бюджет 200_000: commission = 20_000, payoutPool = 180_000.
    expect(lot.budget).toBe(200_000);
    expect(lot.commission).toBe(20_000);
    expect(lot.payoutPool).toBe(180_000);

    // Принятый блогер.
    expect(lot.acceptedBloggers).toHaveLength(1);
    const b = lot.acceptedBloggers[0];
    expect(b.displayName).toBe('Блогер 701001001');
    expect(b.contact).toBe('contact_701001001');
    expect(b.categories).toContain('Красота');
    expect(b.linkedAccounts[0].platform).toBe('Instagram');

    await admin.app.close();
  });

  it('commission = Math.round(10%)', async () => {
    // Используем admin-пользователя для доступа к /admin/lots.
    const admin = await companyClient();
    // budget = 199_999 → 10% = 19999.9 → Math.round = 20000
    const lot = await testDb.lot.create({
      data: {
        companyId: admin.companyId,
        title: 'Округление',
        description: '—',
        categories: ['Красота'],
        platforms: ['Instagram'],
        budget: 199_999,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'active',
      },
    });
    const blogger = await bloggerClient(701002001);
    const rId = await createResponse(blogger.app, blogger.token, lot.id);
    await blogger.app.close();
    await acceptResponse(admin.app, admin.token, lot.id, rId);
    await testDb.lot.update({ where: { id: lot.id }, data: { status: 'awaiting_payout' } });

    const res = await admin.app.inject({
      method: 'GET',
      url: '/admin/lots?status=awaiting_payout',
      headers: bearer(admin.token),
    });
    expect(res.statusCode).toBe(200);
    const l = res.json().lots.find((x: { id: string }) => x.id === lot.id);
    expect(l?.commission).toBe(20_000); // Math.round(199_999 * 0.1) = Math.round(19999.9) = 20000
    expect(l?.payoutPool).toBe(199_999 - 20_000);

    await admin.app.close();
  });

  it('awaiting_payment статус НЕ содержит payout-полей', async () => {
    // Используем дефолтный tgId=555000111 (admin), чтобы GET /admin/lots прошло.
    const admin = await companyClient();
    // POST /lots создаёт лот с awaiting_payment.
    const lotRes = await admin.app.inject({
      method: 'POST',
      url: '/lots',
      headers: bearer(admin.token),
      payload: {
        title: 'Ожидает оплаты',
        description: '—',
        categories: ['Красота'],
        platforms: ['Instagram'],
        budget: 50_000,
        deadline: futureISO(),
        requirements: [],
      },
    });
    expect(lotRes.json().lot.status).toBe('awaiting_payment');

    const res = await admin.app.inject({
      method: 'GET',
      url: '/admin/lots?status=awaiting_payment',
      headers: bearer(admin.token),
    });
    expect(res.statusCode).toBe(200);
    const lot = res.json().lots.find((l: { title: string }) => l.title === 'Ожидает оплаты');
    expect(lot).toBeDefined();
    expect(lot.commission).toBeUndefined();
    expect(lot.payoutPool).toBeUndefined();
    expect(lot.acceptedBloggers).toBeUndefined();

    await admin.app.close();
  });
});
