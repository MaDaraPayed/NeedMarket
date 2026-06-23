import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';

describe('POST /auth/telegram + GET /me', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ db: testDb });
    await app.ready();
    return async () => {
      await app.close();
    };
  });

  it('валидный initData → 200, токен и корректный пользователь', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.token).toBe('string');
    expect(body.user.telegramId).toBe('555000111');
    expect(body.user.firstName).toBe('Алиса');
    expect(body.user.username).toBe('alice');
  });

  it('GET /me с Bearer возвращает того же пользователя', async () => {
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });
    const { token } = auth.json();

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json().user.telegramId).toBe('555000111');
  });

  it('GET /me без токена → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });

  it('подделанная подпись → 401', async () => {
    const params = new URLSearchParams(signInitData(new Date()));
    const hash = params.get('hash')!;
    params.set('hash', hash.split('').reverse().join('')); // ломаем hash
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: params.toString() },
    });
    expect(res.statusCode).toBe(401);
  });

  it('просроченный initData → 401', async () => {
    const old = new Date(Date.now() - 4000 * 1000); // старше expiresIn=3600s
    const res = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(old) },
    });
    expect(res.statusCode).toBe(401);
  });

  it('пустое тело → 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/telegram', payload: {} });
    expect(res.statusCode).toBe(400);
  });
});
