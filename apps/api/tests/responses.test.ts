import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

// Компания с профилем и лотом.
async function companyClient(tgId?: number): Promise<{ app: FastifyInstance; token: string; companyId: string }> {
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
    payload: { name: `ООО ${tgId ?? 'Ромашка'}` },
  });
  return { app, token, companyId: prof.json().user.profile.id };
}

// Блогер с профилем.
async function bloggerClient(
  tgId?: number,
): Promise<{ app: FastifyInstance; token: string; bloggerId: string }> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), tgId ? { id: tgId } : { id: 777000001 }) },
  });
  const token = auth.json().token;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
  const prof = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: {
      displayName: `Блогер ${tgId ?? 777000001}`,
      categories: ['Красота'],
      linkedAccounts: [{ platform: 'Instagram', url: 'https://instagram.com/test' }],
    },
  });
  return { app, token, bloggerId: prof.json().user.profile.id };
}

// Создаём лот прямо в БД со статусом active (минуя gate оплаты), чтобы блогеры
// могли откликаться на него в тестах откликов.
async function createActiveLot(companyId: string, opts: { slotsNeeded?: number } = {}): Promise<string> {
  const lot = await testDb.lot.create({
    data: {
      companyId,
      title: 'Тестовый лот',
      description: 'Описание',
      categories: ['Красота'],
      platforms: ['Instagram'],
      budget: 100_000,
      deadline: new Date(Date.now() + 7 * 86_400_000),
      requirements: [],
      status: 'active',
      slotsNeeded: opts.slotsNeeded ?? 1,
    },
  });
  return lot.id;
}

async function createResponse(app: FastifyInstance, token: string, lotId: string, message = 'Хочу участвовать') {
  return app.inject({
    method: 'POST',
    url: `/lots/${lotId}/responses`,
    headers: bearer(token),
    payload: { message },
  });
}

describe('POST /lots/:id/responses', () => {
  it('блогер откликается → 200, response с pending-статусом', async () => {
    const company = await companyClient(100000001);
    const lotId = await createActiveLot(company.companyId);
    await company.app.close();

    const blogger = await bloggerClient(200000001);
    const res = await createResponse(blogger.app, blogger.token, lotId);

    expect(res.statusCode).toBe(200);
    const r = res.json().response;
    expect(r.id).toBeTruthy();
    expect(r.lotId).toBe(lotId);
    expect(r.status).toBe('pending');
    expect(r.message).toBe('Хочу участвовать');
    await blogger.app.close();
  });

  it('повторный отклик → 409', async () => {
    const company = await companyClient(100000002);
    const lotId = await createActiveLot(company.companyId);
    await company.app.close();

    const blogger = await bloggerClient(200000002);
    await createResponse(blogger.app, blogger.token, lotId);
    const res2 = await createResponse(blogger.app, blogger.token, lotId);

    expect(res2.statusCode).toBe(409);
    await blogger.app.close();
  });

  it('лот не active (draft) → 400', async () => {
    const company = await companyClient(100000003);
    // Создаём неактивный лот напрямую в БД.
    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Черновик',
        description: 'Описание',
        categories: ['Красота'],
        platforms: ['Instagram'],
        budget: 1000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'draft',
      },
    });
    await company.app.close();

    const blogger = await bloggerClient(200000003);
    const res = await createResponse(blogger.app, blogger.token, lot.id);
    expect(res.statusCode).toBe(400);
    await blogger.app.close();
  });

  it('роль company → 403', async () => {
    const company = await companyClient(100000004);
    const lotId = await createActiveLot(company.companyId);
    const res = await createResponse(company.app, company.token, lotId);
    expect(res.statusCode).toBe(403);
    await company.app.close();
  });

  it('несуществующий лот → 404', async () => {
    const blogger = await bloggerClient(200000005);
    const res = await createResponse(blogger.app, blogger.token, 'no_such_lot');
    expect(res.statusCode).toBe(404);
    await blogger.app.close();
  });

  it('пустое сообщение → 400', async () => {
    const company = await companyClient(100000006);
    const lotId = await createActiveLot(company.companyId);
    await company.app.close();

    const blogger = await bloggerClient(200000006);
    const res = await createResponse(blogger.app, blogger.token, lotId, '');
    expect(res.statusCode).toBe(400);
    await blogger.app.close();
  });
});

describe('GET /lots/:id/responses', () => {
  it('компания-владелец видит отклики с инфой блогера', async () => {
    const company = await companyClient(100001001);
    const lotId = await createActiveLot(company.companyId);

    const blogger = await bloggerClient(200001001);
    await createResponse(blogger.app, blogger.token, lotId, 'Привет от блогера');
    await blogger.app.close();

    const res = await company.app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.responses).toHaveLength(1);
    expect(body.responses[0].message).toBe('Привет от блогера');
    expect(body.responses[0].blogger).toBeDefined();
    expect(body.responses[0].blogger.displayName).toBe('Блогер 200001001');
    expect(body.responses[0].blogger.categories).toContain('Красота');
    expect(body.slotsNeeded).toBe(1);
    expect(body.acceptedCount).toBe(0);
    await company.app.close();
  });

  it('компания НЕ-владелец → 403', async () => {
    const owner = await companyClient(100001002);
    const lotId = await createActiveLot(owner.companyId);
    await owner.app.close();

    const other = await companyClient(100001003);
    const res = await other.app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(other.token),
    });
    expect(res.statusCode).toBe(403);
    await other.app.close();
  });

  it('Блогер → 403', async () => {
    const company = await companyClient(100001004);
    const lotId = await createActiveLot(company.companyId);
    await company.app.close();

    const blogger = await bloggerClient(200001004);
    const res = await blogger.app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(403);
    await blogger.app.close();
  });

  it('несколько блогеров → список всех откликов', async () => {
    const company = await companyClient(100001005);
    const lotId = await createActiveLot(company.companyId);

    const b1 = await bloggerClient(200001005);
    const b2 = await bloggerClient(200001006);
    await createResponse(b1.app, b1.token, lotId, 'Блогер 1');
    await createResponse(b2.app, b2.token, lotId, 'Блогер 2');
    await b1.app.close();
    await b2.app.close();

    const res = await company.app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().responses).toHaveLength(2);
    await company.app.close();
  });

  it('отклонённые отклики идут последними', async () => {
    const company = await companyClient(100001007);
    const lotId = await createActiveLot(company.companyId, { slotsNeeded: 3 });

    const b1 = await bloggerClient(200001007);
    const b2 = await bloggerClient(200001008);
    const b3 = await bloggerClient(200001009);
    const r1 = await createResponse(b1.app, b1.token, lotId, 'Первый');
    await createResponse(b2.app, b2.token, lotId, 'Второй');
    await createResponse(b3.app, b3.token, lotId, 'Третий');
    await b1.app.close();
    await b2.app.close();
    await b3.app.close();

    // Отклоняем первого.
    await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${r1.json().response.id}/reject`,
      headers: bearer(company.token),
    });

    const res = await company.app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    const responses = res.json().responses;
    expect(responses).toHaveLength(3);
    // Отклонённый – последний.
    expect(responses[responses.length - 1].status).toBe('rejected');
    expect(responses[0].status).toBe('pending');
    await company.app.close();
  });
});

describe('GET /me/responses', () => {
  it('блогер видит свои отклики', async () => {
    const company = await companyClient(100002001);
    const lotId = await createActiveLot(company.companyId);
    await company.app.close();

    const blogger = await bloggerClient(200002001);
    await createResponse(blogger.app, blogger.token, lotId);

    const res = await blogger.app.inject({
      method: 'GET',
      url: '/me/responses',
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(200);
    const responses = res.json().responses;
    expect(responses).toHaveLength(1);
    expect(responses[0].lotId).toBe(lotId);
    expect(responses[0].status).toBe('pending');
    await blogger.app.close();
  });

  it('блогер без откликов → пустой список', async () => {
    const blogger = await bloggerClient(200002002);
    const res = await blogger.app.inject({
      method: 'GET',
      url: '/me/responses',
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().responses).toHaveLength(0);
    await blogger.app.close();
  });

  it('компания → 403', async () => {
    const company = await companyClient(100002003);
    const res = await company.app.inject({
      method: 'GET',
      url: '/me/responses',
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(403);
    await company.app.close();
  });

  it('/me/responses содержит инфу лота (title, budget, deadline, status=active)', async () => {
    const company = await companyClient(100002004);
    const lotId = await createActiveLot(company.companyId);
    await company.app.close();

    const blogger = await bloggerClient(200002004);
    await createResponse(blogger.app, blogger.token, lotId);

    const res = await blogger.app.inject({
      method: 'GET',
      url: '/me/responses',
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(200);
    const r = res.json().responses[0];
    expect(r.lot).toBeDefined();
    expect(r.lot.title).toBe('Тестовый лот');
    expect(r.lot.budget).toBe(100_000);
    expect(typeof r.lot.deadline).toBe('string');
    expect(r.lot.status).toBe('active');
    await blogger.app.close();
  });

  it('/me/responses содержит инфу лота когда тот in_progress (после accept)', async () => {
    const company = await companyClient(100002005);
    const lotId = await createActiveLot(company.companyId);

    const blogger = await bloggerClient(200002005);
    const rsp = await createResponse(blogger.app, blogger.token, lotId);
    const responseId = rsp.json().response.id;
    await blogger.app.close();

    // Компания принимает отклик → slotsNeeded=1 → лот → in_progress.
    await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${responseId}/accept`,
      headers: bearer(company.token),
    });
    await company.app.close();

    // Новое приложение для блогера – проверяем /me/responses.
    const blogger2 = await bloggerClient(200002005);
    const res = await blogger2.app.inject({
      method: 'GET',
      url: '/me/responses',
      headers: bearer(blogger2.token),
    });
    expect(res.statusCode).toBe(200);
    const r = res.json().responses[0];
    expect(r.status).toBe('accepted');
    expect(r.lot).toBeDefined();
    expect(r.lot.status).toBe('in_progress');
    await blogger2.app.close();
  });
});

describe('POST /lots/:id/responses/:responseId/accept', () => {
  it('принятие одного при slotsNeeded=1 → лот in_progress, остальные rejected', async () => {
    const company = await companyClient(100003001);
    const lotId = await createActiveLot(company.companyId); // slotsNeeded=1 по умолчанию

    const b1 = await bloggerClient(200003001);
    const b2 = await bloggerClient(200003002);
    const r1 = await createResponse(b1.app, b1.token, lotId, 'Блогер 1');
    await createResponse(b2.app, b2.token, lotId, 'Блогер 2');
    const responseId = r1.json().response.id;
    await b1.app.close();
    await b2.app.close();

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${responseId}/accept`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.lot.status).toBe('in_progress');
    expect(body.lot.slotsNeeded).toBe(1);

    // Проверяем состояние откликов напрямую в БД.
    const responses = await testDb.response.findMany({ where: { lotId } });
    const accepted = responses.find((r) => r.id === responseId);
    const others = responses.filter((r) => r.id !== responseId);
    expect(accepted?.status).toBe('accepted');
    expect(others.every((r) => r.status === 'rejected')).toBe(true);

    // Лот переходит в in_progress.
    const lot = await testDb.lot.findUnique({ where: { id: lotId } });
    expect(lot?.status).toBe('in_progress');
    await company.app.close();
  });

  it('accept при slotsNeeded=2: первый → лот остаётся active, второй → in_progress', async () => {
    const company = await companyClient(100003007);
    const lotId = await createActiveLot(company.companyId, { slotsNeeded: 2 });

    const b1 = await bloggerClient(200003007);
    const b2 = await bloggerClient(200003008);
    const b3 = await bloggerClient(200003009);
    const r1 = await createResponse(b1.app, b1.token, lotId, 'Блогер 1');
    const r2 = await createResponse(b2.app, b2.token, lotId, 'Блогер 2');
    await createResponse(b3.app, b3.token, lotId, 'Блогер 3');
    await b1.app.close();
    await b2.app.close();
    await b3.app.close();

    // Принимаем первого – лот должен остаться active.
    const res1 = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${r1.json().response.id}/accept`,
      headers: bearer(company.token),
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().lot.status).toBe('active');

    const lotAfterFirst = await testDb.lot.findUnique({ where: { id: lotId } });
    expect(lotAfterFirst?.status).toBe('active');

    // Остальные pending не тронуты.
    const pendingAfterFirst = await testDb.response.findMany({
      where: { lotId, status: 'pending' },
    });
    expect(pendingAfterFirst.length).toBe(2); // b2 и b3 всё ещё pending

    // Принимаем второго – теперь слоты заполнены, лот → in_progress.
    const res2 = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${r2.json().response.id}/accept`,
      headers: bearer(company.token),
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().lot.status).toBe('in_progress');

    const lotAfterSecond = await testDb.lot.findUnique({ where: { id: lotId } });
    expect(lotAfterSecond?.status).toBe('in_progress');

    // Третий (b3) должен стать rejected.
    const b3Response = await testDb.response.findMany({ where: { lotId, status: 'rejected' } });
    expect(b3Response.length).toBe(1);
    await company.app.close();
  });

  it('accept при заполненных слотах (лот не active) → 400', async () => {
    const company = await companyClient(100003010);
    const lotId = await createActiveLot(company.companyId, { slotsNeeded: 1 });

    const b1 = await bloggerClient(200003010);
    const b2 = await bloggerClient(200003011);
    const r1 = await createResponse(b1.app, b1.token, lotId, 'Первый');
    await createResponse(b2.app, b2.token, lotId, 'Второй');
    await b1.app.close();

    // Принимаем первого → лот in_progress.
    await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${r1.json().response.id}/accept`,
      headers: bearer(company.token),
    });

    // Пытаемся принять второго – лот уже не active.
    const b2Responses = await testDb.response.findMany({ where: { lotId, bloggerId: b2.bloggerId } });
    const r2Id = b2Responses[0]?.id ?? 'nope';
    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${r2Id}/accept`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(400);
    await b2.app.close();
    await company.app.close();
  });

  it('не-владелец компания → 403', async () => {
    const owner = await companyClient(100003003);
    const lotId = await createActiveLot(owner.companyId);
    const blogger = await bloggerClient(200003003);
    const r = await createResponse(blogger.app, blogger.token, lotId);
    const responseId = r.json().response.id;
    await blogger.app.close();
    await owner.app.close();

    const other = await companyClient(100003004);
    const res = await other.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${responseId}/accept`,
      headers: bearer(other.token),
    });
    expect(res.statusCode).toBe(403);
    await other.app.close();
  });

  it('лот не active → 400', async () => {
    const company = await companyClient(100003005);
    const lotId = await createActiveLot(company.companyId);

    const blogger = await bloggerClient(200003005);
    const r = await createResponse(blogger.app, blogger.token, lotId);
    const responseId = r.json().response.id;
    await blogger.app.close();

    // Переводим лот в cancelled напрямую в БД.
    await testDb.lot.update({
      where: { id: lotId },
      data: { status: 'cancelled' },
    });

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${responseId}/accept`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(400);
    await company.app.close();
  });

  it('блогер → 403', async () => {
    const company = await companyClient(100003006);
    const lotId = await createActiveLot(company.companyId);
    await company.app.close();

    const blogger = await bloggerClient(200003006);
    const r = await createResponse(blogger.app, blogger.token, lotId);
    const responseId = r.json().response.id;

    const res = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${responseId}/accept`,
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(403);
    await blogger.app.close();
  });
});

describe('POST /lots/:id/responses/:responseId/reject', () => {
  it('pending → rejected', async () => {
    const company = await companyClient(100004001);
    const lotId = await createActiveLot(company.companyId);

    const blogger = await bloggerClient(200004001);
    const r = await createResponse(blogger.app, blogger.token, lotId);
    const responseId = r.json().response.id;
    await blogger.app.close();

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${responseId}/reject`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().response.status).toBe('rejected');

    const dbR = await testDb.response.findUnique({ where: { id: responseId } });
    expect(dbR?.status).toBe('rejected');
    await company.app.close();
  });

  it('не-владелец компания → 403', async () => {
    const owner = await companyClient(100004002);
    const lotId = await createActiveLot(owner.companyId);

    const blogger = await bloggerClient(200004002);
    const r = await createResponse(blogger.app, blogger.token, lotId);
    const responseId = r.json().response.id;
    await blogger.app.close();
    await owner.app.close();

    const other = await companyClient(100004003);
    const res = await other.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${responseId}/reject`,
      headers: bearer(other.token),
    });
    expect(res.statusCode).toBe(403);
    await other.app.close();
  });

  it('не-pending отклик (уже rejected) → 400', async () => {
    const company = await companyClient(100004004);
    const lotId = await createActiveLot(company.companyId);

    const blogger = await bloggerClient(200004004);
    const r = await createResponse(blogger.app, blogger.token, lotId);
    const responseId = r.json().response.id;
    await blogger.app.close();

    // Первый reject – успешен.
    await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${responseId}/reject`,
      headers: bearer(company.token),
    });
    // Второй reject того же отклика → 400.
    const res2 = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${responseId}/reject`,
      headers: bearer(company.token),
    });
    expect(res2.statusCode).toBe(400);
    await company.app.close();
  });

  it('лот не active → 400', async () => {
    const company = await companyClient(100004005);
    const lotId = await createActiveLot(company.companyId);

    const blogger = await bloggerClient(200004005);
    const r = await createResponse(blogger.app, blogger.token, lotId);
    const responseId = r.json().response.id;
    await blogger.app.close();

    await testDb.lot.update({ where: { id: lotId }, data: { status: 'cancelled' } });

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${responseId}/reject`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(400);
    await company.app.close();
  });

  it('блогер → 403', async () => {
    const company = await companyClient(100004006);
    const lotId = await createActiveLot(company.companyId);
    await company.app.close();

    const blogger = await bloggerClient(200004006);
    const r = await createResponse(blogger.app, blogger.token, lotId);
    const responseId = r.json().response.id;

    const res = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${responseId}/reject`,
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(403);
    await blogger.app.close();
  });
});

describe('GET /lots/:id/responses — обогащение blogger.contact и telegramUsername', () => {
  it('отклик содержит contact и telegramUsername блогера', async () => {
    const company = await companyClient(300001001);
    const lotId = await createActiveLot(company.companyId);

    // Блогер с контактом и явным tgId (username = 'alice' из signInitData по умолчанию).
    const blogger = await bloggerClient(200005001);
    // Обновляем профиль блогера с contact.
    await blogger.app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(blogger.token),
      payload: {
        displayName: 'Блогер с контактом',
        categories: ['Красота'],
        linkedAccounts: [],
        contact: '@blogger_contact',
      },
    });
    await createResponse(blogger.app, blogger.token, lotId, 'Хочу участвовать');
    await blogger.app.close();

    const res = await company.app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    const r = res.json().responses[0];
    expect(r.blogger).toBeDefined();
    expect(r.blogger.contact).toBe('@blogger_contact');
    expect(r.blogger.telegramUsername).toBeDefined();
    await company.app.close();
  });

  it('contact=null если блогер не заполнил', async () => {
    const company = await companyClient(300002001);
    const lotId = await createActiveLot(company.companyId);

    const blogger = await bloggerClient(200006001);
    await createResponse(blogger.app, blogger.token, lotId, 'Хочу');
    await blogger.app.close();

    const res = await company.app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().responses[0].blogger.contact).toBeNull();
    await company.app.close();
  });
});

describe('GET /lots/:id/responses — полный профиль блогера в brief', () => {
  it('DTO содержит bio и city блогера', async () => {
    const company = await companyClient(300005001);
    const lotId = await createActiveLot(company.companyId);

    const blogger = await bloggerClient(200007001);
    await blogger.app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(blogger.token),
      payload: {
        displayName: 'Блогер с профилем',
        bio: 'Пишу про бьюти и лайфстайл',
        city: 'Алматы',
        categories: ['Красота'],
        linkedAccounts: [{ platform: 'Instagram', url: 'https://instagram.com/test', followers: 12000 }],
      },
    });
    await createResponse(blogger.app, blogger.token, lotId, 'Готов к сотрудничеству');
    await blogger.app.close();

    const res = await company.app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    const b = res.json().responses[0].blogger;
    expect(b).toBeDefined();
    expect(b.displayName).toBe('Блогер с профилем');
    expect(b.bio).toBe('Пишу про бьюти и лайфстайл');
    expect(b.city).toBe('Алматы');
    expect(b.categories).toContain('Красота');
    expect(b.linkedAccounts[0].platform).toBe('Instagram');
    expect(b.linkedAccounts[0].followers).toBe(12000);
    await company.app.close();
  });

  it('bio и city равны null когда не заполнены', async () => {
    const company = await companyClient(300005002);
    const lotId = await createActiveLot(company.companyId);

    const blogger = await bloggerClient(200007002);
    await createResponse(blogger.app, blogger.token, lotId, 'Хочу');
    await blogger.app.close();

    const res = await company.app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    const b = res.json().responses[0].blogger;
    expect(b.bio).toBeNull();
    expect(b.city).toBeNull();
    await company.app.close();
  });
});
