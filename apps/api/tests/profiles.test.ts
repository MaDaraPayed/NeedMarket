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
        categories: ['Бьюти', 'Лайфстайл'],
        city: 'Алматы',
        linkedAccounts: [{ platform: 'Instagram', url: 'https://instagram.com/alice', followers: 12000 }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.profile.displayName).toBe('Алиса Блог');
    expect(res.json().user.profile.categories).toEqual(['Бьюти', 'Лайфстайл']);

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
      payload: { displayName: 'Новое имя', categories: ['Еда'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.profile.displayName).toBe('Новое имя');
    expect(res.json().user.profile.categories).toEqual(['Еда']);
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

describe('BloggerProfile.contact — round-trip', () => {
  it('сохраняет contact и отдаёт через /me', async () => {
    const { app, token } = await authedApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });

    const res = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { displayName: 'Блогер', categories: ['Бьюти'], linkedAccounts: [], contact: '@myhandle' },
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
