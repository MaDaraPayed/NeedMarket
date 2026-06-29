import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';

// ADMIN_TELEGRAM_IDS='555000111' → signInitData() без overrides = admin.
const ADMIN_TG_ID = 555_000_111; // default signInitData id

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function adminClient(): Promise<{ app: FastifyInstance; token: string }> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: ADMIN_TG_ID }) },
  });
  return { app, token: auth.json().token as string };
}

// Создаём блогера с полным расширенным профилем (включая приватные поля).
async function createFullBlogger(
  app: FastifyInstance,
  tgId: number,
): Promise<{ token: string; bloggerId: string }> {
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: tgId }) },
  });
  const token = auth.json().token as string;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
  const prof = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: {
      displayName: `Блогер ${tgId}`,
      categories: ['Красота', 'Лайфстайл'],
      linkedAccounts: [{ platform: 'Instagram', url: 'https://instagram.com/test', followers: 75_000 }],
      phone: '+77001234567',
      email: 'blogger@test.kz',
      birthDate: '1995-03-15',
      audienceGender: 'mostly_female',
      audienceAge: '18-34',
      reachStories: 8000,
      engagementRate: 4.5,
      formats: ['stories', 'reels'],
      priceStories: 25_000,
      priceReels: 60_000,
      brandsWorkedWith: 'Nike, Adidas',
      barterAvailable: true,
      termsAcceptedAt: '2026-06-25T10:00:00.000Z',
      marketingOptIn: true,
    },
  });
  return { token, bloggerId: prof.json().user.profile.id as string };
}

// Создаём компанию.
async function createCompany(
  app: FastifyInstance,
  tgId: number,
): Promise<{ token: string; companyId: string }> {
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: tgId }) },
  });
  const token = auth.json().token as string;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
  const prof = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: { name: `ООО Тест ${tgId}` },
  });
  return { token, companyId: prof.json().user.profile.id as string };
}

// Создаём активный лот напрямую в БД (минуя оплату).
async function createActiveLot(companyId: string): Promise<string> {
  const lot = await testDb.lot.create({
    data: {
      companyId,
      title: 'Тестовый лот видимости',
      description: 'Описание',
      categories: ['Красота'],
      platforms: ['Instagram'],
      budget: 100_000,
      deadline: new Date(Date.now() + 7 * 86_400_000),
      requirements: [],
      status: 'active',
      slotsNeeded: 1,
    },
  });
  return lot.id;
}

const PRIVATE_FIELDS = ['phone', 'email', 'birthDate', 'termsAcceptedAt', 'marketingOptIn'] as const;
const PUBLIC_EXTENDED_FIELDS = [
  'tier',
  'audienceGender',
  'audienceAge',
  'reachStories',
  'engagementRate',
  'formats',
  'priceStories',
  'priceReels',
  'brandsWorkedWith',
  'barterAvailable',
] as const;

describe('Асимметрия видимости профиля блогера', () => {
  it('компанийский DTO (GET /lots/:id/responses) НЕ содержит приватных полей', async () => {
    const { app, token: adminToken } = await adminClient();
    const { token: bloggerToken, bloggerId } = await createFullBlogger(app, 9_001_001);
    const { token: companyToken, companyId } = await createCompany(app, 9_001_002);
    const lotId = await createActiveLot(companyId);

    // Блогер откликается на лот.
    await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses`,
      headers: bearer(bloggerToken),
      payload: { message: 'Хочу участвовать' },
    });

    // Компания читает отклики.
    const res = await app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(companyToken),
    });
    expect(res.statusCode).toBe(200);
    const { responses } = res.json() as { responses: Array<{ blogger: Record<string, unknown> }> };
    expect(responses.length).toBe(1);
    const blogger = responses[0]!.blogger;
    expect(blogger).toBeTruthy();

    // Приватные поля отсутствуют в JSON-ответе.
    for (const field of PRIVATE_FIELDS) {
      expect(field in blogger).toBe(false);
    }
  });

  it('компанийский DTO содержит публичные расширенные поля', async () => {
    const { app } = await adminClient();
    const { token: bloggerToken } = await createFullBlogger(app, 9_002_001);
    const { token: companyToken, companyId } = await createCompany(app, 9_002_002);
    const lotId = await createActiveLot(companyId);

    await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses`,
      headers: bearer(bloggerToken),
      payload: { message: 'Хочу участвовать' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(companyToken),
    });
    const { responses } = res.json() as { responses: Array<{ blogger: Record<string, unknown> }> };
    const blogger = responses[0]!.blogger;

    // Публичные расширенные поля присутствуют.
    expect(blogger.tier).toBe('medium'); // 75 000 подписчиков → medium
    expect(blogger.audienceGender).toBe('mostly_female');
    expect(blogger.audienceAge).toBe('18-34');
    expect(blogger.reachStories).toBe(8000);
    expect(blogger.engagementRate).toBe(4.5);
    expect(Array.isArray(blogger.formats)).toBe(true);
    expect((blogger.formats as string[]).length).toBeGreaterThan(0);
    expect(blogger.priceStories).toBe(25_000);
    expect(blogger.brandsWorkedWith).toBe('Nike, Adidas');
    expect(blogger.barterAvailable).toBe(true);
  });

  it('админский DTO (GET /admin/users) содержит приватные поля', async () => {
    const { app, token: adminToken } = await adminClient();
    await createFullBlogger(app, 9_003_001);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users?role=blogger',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const { users } = res.json() as { users: Array<Record<string, unknown>> };
    expect(users.length).toBe(1);
    const u = users[0]!;

    // Приватные поля присутствуют.
    expect(u.phone).toBe('+77001234567');
    expect(u.email).toBe('blogger@test.kz');
    expect(typeof u.birthDate).toBe('string');
    expect(typeof u.termsAcceptedAt).toBe('string');
    expect(u.marketingOptIn).toBe(true);
  });

  it('админский DTO содержит публичные расширенные поля', async () => {
    const { app, token: adminToken } = await adminClient();
    await createFullBlogger(app, 9_004_001);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users?role=blogger',
      headers: bearer(adminToken),
    });
    const { users } = res.json() as { users: Array<Record<string, unknown>> };
    const u = users[0]!;

    expect(u.tier).toBe('medium');
    expect(u.audienceGender).toBe('mostly_female');
    expect(u.reachStories).toBe(8000);
    expect(u.engagementRate).toBe(4.5);
    expect(Array.isArray(u.formats)).toBe(true);
    expect(u.priceStories).toBe(25_000);
    expect(u.brandsWorkedWith).toBe('Nike, Adidas');
    expect(u.barterAvailable).toBe(true);
  });

  it('batch: несколько блогеров откликаются — компания получает все с расширенными полями', async () => {
    const app = buildApp({ db: testDb });
    await app.ready();

    const { token: companyToken, companyId } = await createCompany(app, 9_005_000);
    const lotId = await createActiveLot(companyId);

    // 3 блогера откликаются на один лот.
    for (const id of [9_005_001, 9_005_002, 9_005_003]) {
      const { token: bt } = await createFullBlogger(app, id);
      await app.inject({
        method: 'POST',
        url: `/lots/${lotId}/responses`,
        headers: bearer(bt),
        payload: { message: 'Участвую' },
      });
    }

    const res = await app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(companyToken),
    });
    expect(res.statusCode).toBe(200);
    const { responses } = res.json() as { responses: Array<{ blogger: Record<string, unknown> }> };
    // Все три отклика вернулись.
    expect(responses.length).toBe(3);
    // Каждый содержит расширенные публичные поля но не приватные.
    for (const r of responses) {
      expect(r.blogger.tier).toBe('medium');
      expect(r.blogger.audienceGender).toBe('mostly_female');
      for (const field of PRIVATE_FIELDS) {
        expect(field in r.blogger).toBe(false);
      }
    }
  });
});
