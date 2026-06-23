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

async function authed(app: FastifyInstance): Promise<string> {
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date()) },
  });
  return auth.json().token;
}

// Авторизованное приложение компании с уже созданным профилем и хранилищем.
async function companyApp() {
  const fake = makeFakeStorage();
  const app = buildApp({ db: testDb, storage: fake.storage });
  await app.ready();
  const token = await authed(app);
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
  await app.inject({ method: 'PUT', url: '/me/profile', headers: bearer(token), payload: { name: 'ООО Ромашка' } });
  return { app, token, calls: fake.calls };
}

describe('POST /me/profile/logo', () => {
  it('компания с профилем: валидный PNG → 200, logoUrl в профиле', async () => {
    const { app, token, calls } = await companyApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/profile/logo',
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(200);
    const logoUrl = res.json().user.profile.logoUrl as string;
    expect(logoUrl).toMatch(/^\/media\/file_/);
    expect(calls.put).toBe(1);

    // Переживает перезагрузку: /me отдаёт тот же logoUrl.
    const me = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });
    expect(me.json().user.profile.logoUrl).toBe(logoUrl);
    await app.close();
  });

  it('недопустимый тип (gif) → 400', async () => {
    const { app, token } = await companyApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/profile/logo',
      headers: bearer(token),
      payload: { contentType: 'image/gif', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('слишком большой файл (>5 МБ) → 400', async () => {
    const { app, token } = await companyApp();
    const big = Buffer.alloc(5 * 1024 * 1024 + 10).toString('base64');
    const res = await app.inject({
      method: 'POST',
      url: '/me/profile/logo',
      headers: bearer(token),
      payload: { contentType: 'image/png', data: big },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('роль blogger → 403', async () => {
    const fake = makeFakeStorage();
    const app = buildApp({ db: testDb, storage: fake.storage });
    await app.ready();
    const token = await authed(app);
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
    const res = await app.inject({
      method: 'POST',
      url: '/me/profile/logo',
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('компания без профиля → 400 (сначала создать профиль)', async () => {
    const fake = makeFakeStorage();
    const app = buildApp({ db: testDb, storage: fake.storage });
    await app.ready();
    const token = await authed(app);
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
    const res = await app.inject({
      method: 'POST',
      url: '/me/profile/logo',
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('без настроенного хранилища → 503', async () => {
    const app = buildApp({ db: testDb });
    await app.ready();
    const token = await authed(app);
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
    await app.inject({ method: 'PUT', url: '/me/profile', headers: bearer(token), payload: { name: 'X' } });
    const res = await app.inject({
      method: 'POST',
      url: '/me/profile/logo',
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('GET /media/:fileId', () => {
  it('отдаёт байты с content-type и кэширует (getStream один раз)', async () => {
    const { app, token, calls } = await companyApp();
    const upload = await app.inject({
      method: 'POST',
      url: '/me/profile/logo',
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    const logoUrl = upload.json().user.profile.logoUrl as string;

    const first = await app.inject({ method: 'GET', url: logoUrl });
    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toBe('image/png');
    expect(first.headers['x-cache']).toBe('MISS');
    expect(first.rawPayload.equals(Buffer.from(PNG_1x1_BASE64, 'base64'))).toBe(true);

    const second = await app.inject({ method: 'GET', url: logoUrl });
    expect(second.statusCode).toBe(200);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(calls.getStream).toBe(1); // второй раз — из кэша
    await app.close();
  });

  it('неизвестный file_id → 404', async () => {
    const { app } = await companyApp();
    const res = await app.inject({ method: 'GET', url: '/media/file_does_not_exist' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('без настроенного хранилища → 503', async () => {
    const app = buildApp({ db: testDb });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/media/whatever' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});
