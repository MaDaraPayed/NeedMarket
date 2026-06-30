import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';

// ADMIN_TELEGRAM_IDS='555000111' → signInitData() без overrides = admin.
const NON_ADMIN_TG_ID = 888777666;

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function adminClient(): Promise<{ app: FastifyInstance; token: string }> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date()) },
  });
  return { app, token: auth.json().token as string };
}

async function createBlogger(
  app: FastifyInstance,
  tgId: number,
  displayName: string,
): Promise<{ token: string; userId: string }> {
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: tgId }) },
  });
  const token = auth.json().token as string;
  const userId = auth.json().user.id as string;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
  await app.inject({
    method: 'PUT', url: '/me/profile', headers: bearer(token),
    payload: { displayName, phone: '+77000000001', categories: ['Красота'], linkedAccounts: [], contact: `@${displayName.toLowerCase()}` },
  });
  return { token, userId };
}

async function createCompany(
  app: FastifyInstance,
  tgId: number,
  name: string,
): Promise<{ token: string; userId: string }> {
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: tgId }) },
  });
  const token = auth.json().token as string;
  const userId = auth.json().user.id as string;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
  await app.inject({
    method: 'PUT', url: '/me/profile', headers: bearer(token),
    payload: { name, contact: `contact@${name.toLowerCase()}.kz` },
  });
  return { token, userId };
}

describe('GET /admin/users', () => {
  it('403 для не-администратора', async () => {
    const app = buildApp({ db: testDb });
    await app.ready();
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: NON_ADMIN_TG_ID }) },
    });
    const token = auth.json().token as string;

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users?role=blogger',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(403);
  });

  it('400 при отсутствии обязательного параметра role', async () => {
    const { app, token } = await adminClient();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(400);
  });

  it('role=blogger возвращает блогеров с именем, датой и рейтингом', async () => {
    const { app, token } = await adminClient();
    await createBlogger(app, 100001, 'Мария Иванова');
    await createBlogger(app, 100002, 'Алексей Петров');

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users?role=blogger',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const { users } = res.json() as { users: Array<Record<string, unknown>> };
    expect(users.length).toBe(2);
    const names = users.map((u) => u.name);
    expect(names).toContain('Мария Иванова');
    expect(names).toContain('Алексей Петров');
    // Поля присутствуют
    for (const u of users) {
      expect(u.role).toBe('blogger');
      expect(typeof u.createdAt).toBe('string');
      expect('ratingAvg' in u).toBe(true);
      expect(typeof u.ratingCount).toBe('number');
    }
  });

  it('role=company возвращает компании с именем, датой и контактом', async () => {
    const { app, token } = await adminClient();
    await createCompany(app, 200001, 'ОАО Тест');
    await createCompany(app, 200002, 'ТОО Ромашка');

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users?role=company',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const { users } = res.json() as { users: Array<Record<string, unknown>> };
    expect(users.length).toBe(2);
    const names = users.map((u) => u.name);
    expect(names).toContain('ОАО Тест');
    expect(names).toContain('ТОО Ромашка');
    for (const u of users) {
      expect(u.role).toBe('company');
      expect(typeof u.createdAt).toBe('string');
      expect(typeof u.contact).toBe('string'); // задан при создании
    }
  });

  it('role=blogger не возвращает компаний, и наоборот', async () => {
    const { app, token } = await adminClient();
    await createBlogger(app, 300001, 'Блогер Один');
    await createCompany(app, 300002, 'Компания Один');

    const bloggerRes = await app.inject({
      method: 'GET',
      url: '/admin/users?role=blogger',
      headers: bearer(token),
    });
    const companyRes = await app.inject({
      method: 'GET',
      url: '/admin/users?role=company',
      headers: bearer(token),
    });

    const bloggers = (bloggerRes.json() as { users: Array<Record<string, unknown>> }).users;
    const companies = (companyRes.json() as { users: Array<Record<string, unknown>> }).users;
    expect(bloggers.every((u) => u.role === 'blogger')).toBe(true);
    expect(companies.every((u) => u.role === 'company')).toBe(true);
  });

  it('search фильтрует по имени (регистронезависимо, частичное совпадение)', async () => {
    const { app, token } = await adminClient();
    await createBlogger(app, 400001, 'Светлана Романова');
    await createBlogger(app, 400002, 'Дмитрий Романов');
    await createBlogger(app, 400003, 'Иван Сидоров');

    const res = await app.inject({
      method: 'GET',
      url: `/admin/users?role=blogger&search=${encodeURIComponent('романов')}`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const { users } = res.json() as { users: Array<Record<string, unknown>> };
    // «Романова» и «Романов» содержат «романов» — оба должны попасть
    expect(users.length).toBe(2);
    expect(users.map((u) => u.name)).not.toContain('Иван Сидоров');
  });

  it('пустой search возвращает всех', async () => {
    const { app, token } = await adminClient();
    await createBlogger(app, 500001, 'Блогер А');
    await createBlogger(app, 500002, 'Блогер Б');

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users?role=blogger&search=',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const { users } = res.json() as { users: Array<Record<string, unknown>> };
    expect(users.length).toBe(2);
  });

  it('sort=date_asc сортирует от старых к новым', async () => {
    const { app, token } = await adminClient();
    // Создаём последовательно — createdAt будет чуть разным
    await createBlogger(app, 600001, 'Первый');
    await createBlogger(app, 600002, 'Второй');
    await createBlogger(app, 600003, 'Третий');

    const ascRes = await app.inject({
      method: 'GET',
      url: '/admin/users?role=blogger&sort=date_asc',
      headers: bearer(token),
    });
    const descRes = await app.inject({
      method: 'GET',
      url: '/admin/users?role=blogger&sort=date_desc',
      headers: bearer(token),
    });

    const ascending = (ascRes.json() as { users: Array<Record<string, unknown>> }).users;
    const descending = (descRes.json() as { users: Array<Record<string, unknown>> }).users;

    // Даты должны идти в разном порядке
    const ascDates = ascending.map((u) => u.createdAt as string);
    const descDates = descending.map((u) => u.createdAt as string);

    // date_asc: первый элемент ≤ последний
    expect(new Date(ascDates[0]!).getTime()).toBeLessThanOrEqual(new Date(ascDates[ascDates.length - 1]!).getTime());
    // date_desc: первый элемент ≥ последний
    expect(new Date(descDates[0]!).getTime()).toBeGreaterThanOrEqual(new Date(descDates[descDates.length - 1]!).getTime());
  });

  it('sort=date_desc — порядок по умолчанию', async () => {
    const { app, token } = await adminClient();
    await createCompany(app, 700001, 'Первая компания');
    await createCompany(app, 700002, 'Вторая компания');

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users?role=company',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const { users } = res.json() as { users: Array<Record<string, unknown>> };
    const dates = users.map((u) => new Date(u.createdAt as string).getTime());
    expect(dates[0]!).toBeGreaterThanOrEqual(dates[dates.length - 1]!);
  });

  it('search для компаний фильтрует по названию', async () => {
    const { app, token } = await adminClient();
    await createCompany(app, 800001, 'Казах Телеком');
    await createCompany(app, 800002, 'Казах Строй');
    await createCompany(app, 800003, 'Русский Дом');

    const res = await app.inject({
      method: 'GET',
      url: `/admin/users?role=company&search=${encodeURIComponent('казах')}`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const { users } = res.json() as { users: Array<Record<string, unknown>> };
    expect(users.length).toBe(2);
    expect(users.map((u) => u.name)).not.toContain('Русский Дом');
  });
});

describe('GET /admin/users/:userId', () => {
  it('403 для не-администратора', async () => {
    const { app, token: adminToken } = await adminClient();
    const { userId } = await createBlogger(app, 901001, 'Тест Блогер');

    const nonAdminAuth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: NON_ADMIN_TG_ID }) },
    });
    const nonAdminToken = nonAdminAuth.json().token as string;

    const res = await app.inject({
      method: 'GET',
      url: `/admin/users/${userId}`,
      headers: bearer(nonAdminToken),
    });
    expect(res.statusCode).toBe(403);

    // убедимся, что admin может
    const adminRes = await app.inject({
      method: 'GET',
      url: `/admin/users/${userId}`,
      headers: bearer(adminToken),
    });
    expect(adminRes.statusCode).toBe(200);
  });

  it('admin получает полный профиль блогера с приватными полями', async () => {
    const { app, token } = await adminClient();
    const { userId } = await createBlogger(app, 902001, 'Приватный Блогер');

    const res = await app.inject({
      method: 'GET',
      url: `/admin/users/${userId}`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const { user } = res.json() as { user: Record<string, unknown> };
    expect(user.userId).toBe(userId);
    expect(user.role).toBe('blogger');
    expect(user.name).toBe('Приватный Блогер');
    // Приватные поля присутствуют в ответе
    expect('phone' in user).toBe(true);
    expect('email' in user).toBe(true);
    expect('birthDate' in user).toBe(true);
    expect('termsAcceptedAt' in user).toBe(true);
    expect('marketingOptIn' in user).toBe(true);
  });

  it('admin получает профиль компании', async () => {
    const { app, token } = await adminClient();
    const { userId } = await createCompany(app, 903001, 'ТОО Профиль Тест');

    const res = await app.inject({
      method: 'GET',
      url: `/admin/users/${userId}`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const { user } = res.json() as { user: Record<string, unknown> };
    expect(user.userId).toBe(userId);
    expect(user.role).toBe('company');
    expect(user.name).toBe('ТОО Профиль Тест');
  });

  it('404 для несуществующего userId', async () => {
    const { app, token } = await adminClient();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users/nonexistent-user-id-xyz',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(404);
  });
});
