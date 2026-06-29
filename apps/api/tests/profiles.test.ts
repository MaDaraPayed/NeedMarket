import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';

// Свежий app + JWT на каждый тест. Состояние БД изолируется TRUNCATE'ом перед
// каждым тестом (см. tests/setup.ts), поэтому общий testDb не делит данные.
async function authedApp(): Promise<{ app: FastifyInstance; token: string }> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date()) },
  });
  return { app, token: auth.json().token };
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe('PUT /me/role', () => {
  it('первая установка роли → 200, роль проставлена', async () => {
    const { app, token } = await authedApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/me/role',
      headers: bearer(token),
      payload: { role: 'blogger' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.role).toBe('blogger');
    await app.close();
  });

  it('повторная установка (роль уже задана) → 409', async () => {
    const { app, token } = await authedApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
    const res = await app.inject({
      method: 'PUT',
      url: '/me/role',
      headers: bearer(token),
      payload: { role: 'company' },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('некорректная роль → 400', async () => {
    const { app, token } = await authedApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/me/role',
      headers: bearer(token),
      payload: { role: 'wizard' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('без токена → 401', async () => {
    const { app } = await authedApp();
    const res = await app.inject({ method: 'PUT', url: '/me/role', payload: { role: 'blogger' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('PUT /me/profile', () => {
  it('блогер: валидный профиль → 200, /me отдаёт его', async () => {
    const { app, token } = await authedApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });

    const res = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: {
        displayName: 'Алиса Блог',
        bio: 'Пишу про бьюти',
        categories: ['Красота', 'Лайфстайл'],
        city: 'Алматы',
        linkedAccounts: [{ platform: 'Instagram', url: 'https://instagram.com/alice', followers: 12000 }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.profile.displayName).toBe('Алиса Блог');
    expect(res.json().user.profile.categories).toEqual(['Красота', 'Лайфстайл']);

    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.json().user.role).toBe('blogger');
    expect(me.json().user.profile.displayName).toBe('Алиса Блог');
    expect(me.json().user.profile.linkedAccounts[0].followers).toBe(12000);
    await app.close();
  });

  it('блогер: повторный PUT обновляет профиль (upsert)', async () => {
    const { app, token } = await authedApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
    await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { displayName: 'Старое имя', categories: [] },
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { displayName: 'Новое имя', categories: ['Питание'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.profile.displayName).toBe('Новое имя');
    expect(res.json().user.profile.categories).toEqual(['Питание']);
    await app.close();
  });

  it('блогер: невалидный профиль (нет displayName) → 400', async () => {
    const { app, token } = await authedApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
    const res = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { bio: 'без имени' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('блогер: неизвестная категория → 400', async () => {
    const { app, token } = await authedApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
    const res = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { displayName: 'Имя', categories: ['Несуществующая'] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('компания: валидный профиль → 200', async () => {
    const { app, token } = await authedApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
    const res = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { name: 'ООО Ромашка', sphere: 'Косметика', city: 'Астана', contact: '@romashka' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.profile.name).toBe('ООО Ромашка');

    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.json().user.profile.name).toBe('ООО Ромашка');
    await app.close();
  });

  it('компания: невалидный профиль (нет name) → 400', async () => {
    const { app, token } = await authedApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
    const res = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { sphere: 'без названия' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('роль не выбрана → 400', async () => {
    const { app, token } = await authedApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { displayName: 'Имя', categories: [] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /me', () => {
  it('новый пользователь без роли → role и profile null', async () => {
    const { app, token } = await authedApp();
    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.role).toBeNull();
    expect(me.json().user.profile).toBeNull();
    await app.close();
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function bloggerApp() {
  const { app, token } = await authedApp();
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
  return { app, token };
}

async function putProfile(app: FastifyInstance, token: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'PUT', url: '/me/profile', headers: bearer(token), payload });
}

const BASE_PROFILE = { displayName: 'Блогер', categories: [] as string[], linkedAccounts: [] as unknown[] };

// ── Новые поля: персист и round-trip через /me ────────────────────────────────

describe('BloggerProfile: расширенные поля (round-trip)', () => {
  it('сохраняет базовые поля (phone, email, birthDate) и отдаёт через /me', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, {
      ...BASE_PROFILE,
      phone: '+77001234567',
      email: 'blogger@example.com',
      birthDate: '1995-06-15',
    });
    expect(res.statusCode).toBe(200);
    const p = res.json().user.profile;
    expect(p.phone).toBe('+77001234567');
    expect(p.email).toBe('blogger@example.com');
    expect(p.birthDate).toBeTruthy();

    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.json().user.profile.email).toBe('blogger@example.com');
    await app.close();
  });

  it('сохраняет аудиторию (audienceGender, audienceAge, audienceGeo)', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, {
      ...BASE_PROFILE,
      audienceGender: 'mostly_female',
      audienceAge: '18-34',
      audienceGeo: 'Алматы',
      audienceLanguage: 'ru',
    });
    expect(res.statusCode).toBe(200);
    const p = res.json().user.profile;
    expect(p.audienceGender).toBe('mostly_female');
    expect(p.audienceAge).toBe('18-34');
    expect(p.audienceGeo).toBe('Алматы');
    await app.close();
  });

  it('сохраняет статистику (reach, engagementRate)', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, {
      ...BASE_PROFILE,
      reachStories: 5000,
      reachReels: 12000,
      reachPosts: 3000,
      engagementRate: 4.5,
    });
    expect(res.statusCode).toBe(200);
    const p = res.json().user.profile;
    expect(p.reachStories).toBe(5000);
    expect(p.reachReels).toBe(12000);
    expect(p.engagementRate).toBe(4.5);
    await app.close();
  });

  it('сохраняет форматы (formats)', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, {
      ...BASE_PROFILE,
      formats: ['stories', 'reels', 'ugc'],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.profile.formats).toEqual(['stories', 'reels', 'ugc']);
    await app.close();
  });

  it('сохраняет прайс (priceStories, priceReels)', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, {
      ...BASE_PROFILE,
      priceStories: 50000,
      priceReels: 120000,
      avgPrice3m: 75000,
    });
    expect(res.statusCode).toBe(200);
    const p = res.json().user.profile;
    expect(p.priceStories).toBe(50000);
    expect(p.priceReels).toBe(120000);
    expect(p.avgPrice3m).toBe(75000);
    await app.close();
  });

  it('сохраняет barter/travel/preferredCategories/согласия', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, {
      ...BASE_PROFILE,
      barterAvailable: true,
      travelAvailable: false,
      preferredAdvertiserCategories: ['Красота', 'Питание'],
      marketingOptIn: true,
      termsAcceptedAt: new Date().toISOString(),
    });
    expect(res.statusCode).toBe(200);
    const p = res.json().user.profile;
    expect(p.barterAvailable).toBe(true);
    expect(p.preferredAdvertiserCategories).toEqual(['Красота', 'Питание']);
    expect(p.marketingOptIn).toBe(true);
    await app.close();
  });

  it('linkedAccounts с followers сохраняется и читается', async () => {
    const { app, token } = await bloggerApp();
    const accounts = [
      { platform: 'Instagram', url: 'https://instagram.com/test', followers: 80000 },
      { platform: 'TikTok', url: 'https://tiktok.com/@test', followers: 30000 },
    ];
    const res = await putProfile(app, token, { ...BASE_PROFILE, linkedAccounts: accounts });
    expect(res.statusCode).toBe(200);
    const p = res.json().user.profile;
    expect(p.linkedAccounts[0].followers).toBe(80000);
    expect(p.linkedAccounts[1].followers).toBe(30000);

    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.json().user.profile.linkedAccounts[0].followers).toBe(80000);
    await app.close();
  });
});

// ── deriveTier: граничные значения ───────────────────────────────────────────

describe('BloggerProfile: tier (deriveTier через endpoint)', () => {
  async function tierFor(followers: number | undefined) {
    const { app, token } = await bloggerApp();
    const accounts =
      followers !== undefined
        ? [{ platform: 'Instagram', url: 'https://instagram.com/t', followers }]
        : [];
    const res = await putProfile(app, token, { ...BASE_PROFILE, linkedAccounts: accounts });
    const tier = res.json().user.profile.tier;
    await app.close();
    return tier;
  }

  it('49999 подписчиков → micro', async () => {
    expect(await tierFor(49999)).toBe('micro');
  });

  it('50000 подписчиков → medium', async () => {
    expect(await tierFor(50000)).toBe('medium');
  });

  it('199999 подписчиков → medium', async () => {
    expect(await tierFor(199999)).toBe('medium');
  });

  it('200000 подписчиков → large', async () => {
    expect(await tierFor(200000)).toBe('large');
  });

  it('нет linkedAccounts → tier undefined', async () => {
    expect(await tierFor(undefined)).toBeUndefined();
  });

  it('берёт MAX из нескольких аккаунтов', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, {
      ...BASE_PROFILE,
      linkedAccounts: [
        { platform: 'Instagram', url: 'https://instagram.com/a', followers: 30000 },
        { platform: 'YouTube', url: 'https://youtube.com/b', followers: 210000 },
      ],
    });
    expect(res.json().user.profile.tier).toBe('large');
    await app.close();
  });
});

// ── Валидация: невалидные значения → 400 ─────────────────────────────────────

describe('BloggerProfile: валидация новых полей', () => {
  it('невалидный email → 400', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, { ...BASE_PROFILE, email: 'not-an-email' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('невалидный statsScreenshotUrl → 400', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, { ...BASE_PROFILE, statsScreenshotUrl: 'not-a-url' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('невалидный bestCaseUrl → 400', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, { ...BASE_PROFILE, bestCaseUrl: 'не-url' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('engagementRate > 100 → 400', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, { ...BASE_PROFILE, engagementRate: 101 });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('отрицательный priceStories → 400', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, { ...BASE_PROFILE, priceStories: -1 });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('невалидный format → 400', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, { ...BASE_PROFILE, formats: ['invalid_format'] });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('невалидная preferredAdvertiserCategories → 400', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, {
      ...BASE_PROFILE,
      preferredAdvertiserCategories: ['НесуществующаяКатегория'],
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('отрицательный reachStories → 400', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, { ...BASE_PROFILE, reachStories: -100 });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ── Регресс: минимальный профиль без новых полей по-прежнему валиден ─────────

describe('BloggerProfile: регресс (минимальный профиль)', () => {
  it('displayName + пустые categories + пустые linkedAccounts → 200', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, { displayName: 'Минимум', categories: [], linkedAccounts: [] });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.profile.displayName).toBe('Минимум');
    await app.close();
  });

  it('только displayName (категории по дефолту []) → 200', async () => {
    const { app, token } = await bloggerApp();
    const res = await putProfile(app, token, { displayName: 'Минимум2' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('BloggerProfile.contact — round-trip', () => {
  it('сохраняет contact и отдаёт через /me', async () => {
    const { app, token } = await authedApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });

    const res = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { displayName: 'Блогер', categories: ['Красота'], linkedAccounts: [], contact: '@myhandle' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.profile.contact).toBe('@myhandle');

    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.json().user.profile.contact).toBe('@myhandle');
    await app.close();
  });

  it('contact опционален: null если не передан', async () => {
    const { app, token } = await authedApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });

    const res = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { displayName: 'Блогер', categories: [], linkedAccounts: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.profile.contact).toBeNull();
    await app.close();
  });

  it('upsert обновляет contact', async () => {
    const { app, token } = await authedApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
    await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { displayName: 'Блогер', categories: [], linkedAccounts: [], contact: '+77001234567' },
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { displayName: 'Блогер', categories: [], linkedAccounts: [], contact: '@newhandle' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.profile.contact).toBe('@newhandle');
    await app.close();
  });
});
