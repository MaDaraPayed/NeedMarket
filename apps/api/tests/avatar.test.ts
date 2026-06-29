import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, makeFakeStorage, signInitData } from './helpers';

// Минимальный валидный PNG 1x1.
const PNG_1x1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

// Авторизованный блогер с уже созданным профилем.
async function bloggerApp(): Promise<{ app: FastifyInstance; token: string; calls: ReturnType<typeof makeFakeStorage>['calls'] }> {
  const fake = makeFakeStorage();
  const app = buildApp({ db: testDb, storage: fake.storage });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date()) },
  });
  const token = auth.json().token as string;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
  await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: { displayName: 'Алиса', categories: ['Красота'] },
  });
  return { app, token, calls: fake.calls };
}

describe('POST /me/profile/avatar', () => {
  it('блогер с профилем: валидный PNG → 200, avatarUrl в профиле', async () => {
    const { app, token, calls } = await bloggerApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/profile/avatar',
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(200);
    const avatarUrl = res.json().user.profile.avatarUrl as string;
    expect(avatarUrl).toMatch(/^\/media\/file_/);
    expect(calls.put).toBe(1);

    // Переживает перезагрузку: /me отдаёт тот же avatarUrl.
    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.json().user.profile.avatarUrl).toBe(avatarUrl);
    await app.close();
  });

  it('роль company → 403', async () => {
    const fake = makeFakeStorage();
    const app = buildApp({ db: testDb, storage: fake.storage });
    await app.ready();
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });
    const token = auth.json().token as string;
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
    const res = await app.inject({
      method: 'POST',
      url: '/me/profile/avatar',
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('блогер без профиля → 400', async () => {
    const fake = makeFakeStorage();
    const app = buildApp({ db: testDb, storage: fake.storage });
    await app.ready();
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });
    const token = auth.json().token as string;
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
    const res = await app.inject({
      method: 'POST',
      url: '/me/profile/avatar',
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('без настроенного хранилища → 503', async () => {
    const app = buildApp({ db: testDb });
    await app.ready();
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });
    const token = auth.json().token as string;
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
    const res = await app.inject({
      method: 'POST',
      url: '/me/profile/avatar',
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('аватар отдаётся через /media/:fileId (тот же прокси, что и лого)', async () => {
    const { app, token } = await bloggerApp();
    const upload = await app.inject({
      method: 'POST',
      url: '/me/profile/avatar',
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(upload.statusCode).toBe(200);
    const avatarUrl = upload.json().user.profile.avatarUrl as string;

    const media = await app.inject({ method: 'GET', url: avatarUrl });
    expect(media.statusCode).toBe(200);
    expect(media.headers['content-type']).toBe('image/png');
    expect(media.rawPayload.equals(Buffer.from(PNG_1x1_BASE64, 'base64'))).toBe(true);
    await app.close();
  });
});
