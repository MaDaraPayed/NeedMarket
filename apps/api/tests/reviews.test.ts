import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

// Создаёт компанию (tgId), возвращает { app, token, companyId, userId }.
async function companyClient(tgId: number): Promise<{
  app: FastifyInstance;
  token: string;
  companyId: string;
  userId: string;
}> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: tgId }) },
  });
  const token = auth.json().token as string;
  const userId = auth.json().user.id as string;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
  const prof = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: { name: `ООО ${tgId}` },
  });
  return { app, token, companyId: prof.json().user.profile.id as string, userId };
}

// Создаёт блогера (tgId), возвращает { app, token, bloggerId, userId }.
async function bloggerClient(tgId: number): Promise<{
  app: FastifyInstance;
  token: string;
  bloggerId: string;
  userId: string;
}> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: tgId }) },
  });
  const token = auth.json().token as string;
  const userId = auth.json().user.id as string;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
  const prof = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: {
      displayName: `Блогер ${tgId}`,
      categories: ['Бьюти'],
      linkedAccounts: [],
    },
  });
  return { app, token, bloggerId: prof.json().user.profile.id as string, userId };
}

// Создаёт completed лот: active → 1 accepted response → awaiting_payout → completed.
async function setupCompletedLot(
  ownerApp: FastifyInstance,
  ownerToken: string,
  ownerCompanyId: string,
  bloggerApp: FastifyInstance,
  bloggerToken: string,
): Promise<{ lotId: string }> {
  const lot = await testDb.lot.create({
    data: {
      companyId: ownerCompanyId,
      title: 'Завершённый лот',
      description: 'Тест',
      categories: ['Бьюти'],
      platforms: ['Instagram'],
      budget: 100_000,
      deadline: new Date(Date.now() + 7 * 86_400_000),
      requirements: [],
      status: 'active',
    },
  });

  // Блогер откликается.
  const respRes = await bloggerApp.inject({
    method: 'POST',
    url: `/lots/${lot.id}/responses`,
    headers: bearer(bloggerToken),
    payload: { message: 'Хочу участвовать' },
  });
  const responseId = respRes.json().response.id as string;

  // Компания принимает.
  await ownerApp.inject({
    method: 'POST',
    url: `/lots/${lot.id}/responses/${responseId}/accept`,
    headers: bearer(ownerToken),
  });

  // Переводим в completed напрямую (минуем awaiting_payout для краткости).
  await testDb.lot.update({ where: { id: lot.id }, data: { status: 'completed' } });

  return { lotId: lot.id };
}

// ─────────────────────── POST /lots/:id/reviews ───────────────────────

describe('POST /lots/:id/reviews', () => {
  it('компания-владелец оценивает принятого блогера → 200', async () => {
    const owner = await companyClient(801001001);
    const blogger = await bloggerClient(801001002);
    const { lotId } = await setupCompletedLot(owner.app, owner.token, owner.companyId, blogger.app, blogger.token);

    const res = await owner.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(owner.token),
      payload: { rating: 5, comment: 'Отличная работа', targetId: blogger.userId },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.review.rating).toBe(5);
    expect(body.review.targetId).toBe(blogger.userId);
    expect(body.review.comment).toBe('Отличная работа');

    await owner.app.close();
    await blogger.app.close();
  });

  it('принятый блогер оценивает компанию → 200, target = userId владельца', async () => {
    const owner = await companyClient(802001001);
    const blogger = await bloggerClient(802001002);
    const { lotId } = await setupCompletedLot(owner.app, owner.token, owner.companyId, blogger.app, blogger.token);

    const res = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(blogger.token),
      payload: { rating: 4 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().review.targetId).toBe(owner.userId);
    expect(res.json().review.rating).toBe(4);

    await owner.app.close();
    await blogger.app.close();
  });

  it('не-сторона лота → 403', async () => {
    const owner = await companyClient(803001001);
    const blogger = await bloggerClient(803001002);
    const outsider = await companyClient(803001003);
    const { lotId } = await setupCompletedLot(owner.app, owner.token, owner.companyId, blogger.app, blogger.token);

    const res = await outsider.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(outsider.token),
      payload: { rating: 3, targetId: blogger.userId },
    });
    expect(res.statusCode).toBe(403);

    await owner.app.close();
    await blogger.app.close();
    await outsider.app.close();
  });

  it('блогер с targetId другого блогера → 400', async () => {
    const owner = await companyClient(804001001);
    const blogger1 = await bloggerClient(804001002);
    const blogger2 = await bloggerClient(804001003);
    const { lotId } = await setupCompletedLot(owner.app, owner.token, owner.companyId, blogger1.app, blogger1.token);

    const res = await blogger1.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(blogger1.token),
      payload: { rating: 3, targetId: blogger2.userId },
    });
    expect(res.statusCode).toBe(400);

    await owner.app.close();
    await blogger1.app.close();
    await blogger2.app.close();
  });

  it('отзыв на лот со статусом НЕ completed → 409', async () => {
    const owner = await companyClient(805001001);
    const blogger = await bloggerClient(805001002);

    const lot = await testDb.lot.create({
      data: {
        companyId: owner.companyId,
        title: 'Активный лот',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 50_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'active',
      },
    });
    // Принимаем отклик чтобы блогер был стороной (иначе сначала 409 статуса).
    const respRes = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses`,
      headers: bearer(blogger.token),
      payload: { message: 'Хочу' },
    });
    await owner.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses/${respRes.json().response.id}/accept`,
      headers: bearer(owner.token),
    });

    const res = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/reviews`,
      headers: bearer(blogger.token),
      payload: { rating: 5 },
    });
    expect(res.statusCode).toBe(409);

    await owner.app.close();
    await blogger.app.close();
  });

  it('дубль отзыва → 409', async () => {
    const owner = await companyClient(806001001);
    const blogger = await bloggerClient(806001002);
    const { lotId } = await setupCompletedLot(owner.app, owner.token, owner.companyId, blogger.app, blogger.token);

    await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(blogger.token),
      payload: { rating: 5 },
    });

    const res = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(blogger.token),
      payload: { rating: 3 },
    });
    expect(res.statusCode).toBe(409);

    await owner.app.close();
    await blogger.app.close();
  });

  it('rating=0 → 400', async () => {
    const owner = await companyClient(807001001);
    const blogger = await bloggerClient(807001002);
    const { lotId } = await setupCompletedLot(owner.app, owner.token, owner.companyId, blogger.app, blogger.token);

    const res = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(blogger.token),
      payload: { rating: 0 },
    });
    expect(res.statusCode).toBe(400);

    await owner.app.close();
    await blogger.app.close();
  });

  it('rating=6 → 400', async () => {
    const owner = await companyClient(808001001);
    const blogger = await bloggerClient(808001002);
    const { lotId } = await setupCompletedLot(owner.app, owner.token, owner.companyId, blogger.app, blogger.token);

    const res = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(blogger.token),
      payload: { rating: 6 },
    });
    expect(res.statusCode).toBe(400);

    await owner.app.close();
    await blogger.app.close();
  });

  it('компания без targetId → 400', async () => {
    const owner = await companyClient(809001001);
    const blogger = await bloggerClient(809001002);
    const { lotId } = await setupCompletedLot(owner.app, owner.token, owner.companyId, blogger.app, blogger.token);

    const res = await owner.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(owner.token),
      payload: { rating: 4 },
    });
    expect(res.statusCode).toBe(400);

    await owner.app.close();
    await blogger.app.close();
  });
});

// ─────────────────────── Агрегаты рейтинга ───────────────────────

describe('ratingAvg/ratingCount в ResponseBloggerBrief и GET /lots/:id company-инфо', () => {
  it('ratingAvg/ratingCount корректно агрегируются для блогера в отклике', async () => {
    const owner = await companyClient(810001001);
    const blogger = await bloggerClient(810001002);
    const { lotId } = await setupCompletedLot(owner.app, owner.token, owner.companyId, blogger.app, blogger.token);

    // Два отзыва на блогера (от двух разных компаний/лотов).
    // Создаём второй completed лот с тем же блогером.
    const owner2 = await companyClient(810001003);
    const lot2 = await testDb.lot.create({
      data: {
        companyId: owner2.companyId,
        title: 'Второй лот',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 50_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'active',
      },
    });
    const resp2 = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lot2.id}/responses`,
      headers: bearer(blogger.token),
      payload: { message: 'Хочу' },
    });
    await owner2.app.inject({
      method: 'POST',
      url: `/lots/${lot2.id}/responses/${resp2.json().response.id}/accept`,
      headers: bearer(owner2.token),
    });
    await testDb.lot.update({ where: { id: lot2.id }, data: { status: 'completed' } });

    // Первый отзыв: 5 звёзд
    await owner.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(owner.token),
      payload: { rating: 5, targetId: blogger.userId },
    });
    // Второй отзыв: 3 звезды
    await owner2.app.inject({
      method: 'POST',
      url: `/lots/${lot2.id}/reviews`,
      headers: bearer(owner2.token),
      payload: { rating: 3, targetId: blogger.userId },
    });

    // Проверяем агрегат через GET /lots/:id/responses.
    const res = await owner.app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(owner.token),
    });
    expect(res.statusCode).toBe(200);
    const bloggerBrief = res.json().responses[0].blogger;
    // avg = (5+3)/2 = 4.0
    expect(bloggerBrief.ratingAvg).toBe(4);
    expect(bloggerBrief.ratingCount).toBe(2);

    await owner.app.close();
    await owner2.app.close();
    await blogger.app.close();
  });

  it('ratingAvg/ratingCount компании в GET /lots/:id', async () => {
    const owner = await companyClient(811001001);
    const blogger = await bloggerClient(811001002);
    const { lotId } = await setupCompletedLot(owner.app, owner.token, owner.companyId, blogger.app, blogger.token);

    // Блогер ставит компании 4 звезды.
    await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(blogger.token),
      payload: { rating: 4 },
    });

    const res = await blogger.app.inject({
      method: 'GET',
      url: `/lots/${lotId}`,
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(200);
    const lot = res.json().lot;
    expect(lot.company.ratingAvg).toBe(4);
    expect(lot.company.ratingCount).toBe(1);

    await owner.app.close();
    await blogger.app.close();
  });
});

// ─────────────────────── GET /profiles/:userId/reviews ───────────────────────

describe('GET /profiles/:userId/reviews', () => {
  it('возвращает отзывы о пользователе с authorName', async () => {
    const owner = await companyClient(812001001);
    const blogger = await bloggerClient(812001002);
    const { lotId } = await setupCompletedLot(owner.app, owner.token, owner.companyId, blogger.app, blogger.token);

    await owner.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(owner.token),
      payload: { rating: 5, comment: 'Супер', targetId: blogger.userId },
    });

    const res = await blogger.app.inject({
      method: 'GET',
      url: `/profiles/${blogger.userId}/reviews`,
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(200);
    const reviews = res.json().reviews;
    expect(reviews).toHaveLength(1);
    expect(reviews[0].rating).toBe(5);
    expect(reviews[0].comment).toBe('Супер');
    expect(reviews[0].authorName).toBe(`ООО ${812001001}`); // название компании
    expect(reviews[0].createdAt).toBeDefined();

    await owner.app.close();
    await blogger.app.close();
  });

  it('пустой список если нет отзывов', async () => {
    const owner = await companyClient(813001001);
    const res = await owner.app.inject({
      method: 'GET',
      url: `/profiles/${owner.userId}/reviews`,
      headers: bearer(owner.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().reviews).toHaveLength(0);

    await owner.app.close();
  });
});

// ─────────────────────── reviewsGiven/reviewsReceived в GET /lots/:id ───────────────────────

describe('reviewsGiven/reviewsReceived в GET /lots/:id', () => {
  it('компания видит свой данный отзыв и полученный от блогера', async () => {
    const owner = await companyClient(814001001);
    const blogger = await bloggerClient(814001002);
    const { lotId } = await setupCompletedLot(owner.app, owner.token, owner.companyId, blogger.app, blogger.token);

    // Компания оценивает блогера.
    await owner.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(owner.token),
      payload: { rating: 4, targetId: blogger.userId },
    });
    // Блогер оценивает компанию.
    await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(blogger.token),
      payload: { rating: 3 },
    });

    const res = await owner.app.inject({
      method: 'GET',
      url: `/lots/${lotId}`,
      headers: bearer(owner.token),
    });
    expect(res.statusCode).toBe(200);
    const lot = res.json().lot;

    // reviewsGiven: компания дала отзыв блогеру.
    expect(lot.reviewsGiven).toHaveLength(1);
    expect(lot.reviewsGiven[0].rating).toBe(4);
    expect(lot.reviewsGiven[0].targetId).toBe(blogger.userId);

    // reviewsReceived: компания получила отзыв от блогера.
    expect(lot.reviewsReceived).toHaveLength(1);
    expect(lot.reviewsReceived[0].rating).toBe(3);
    expect(lot.reviewsReceived[0].authorName).toBe(`Блогер ${814001002}`);

    await owner.app.close();
    await blogger.app.close();
  });

  it('блогер видит свой данный отзыв и полученный от компании', async () => {
    const owner = await companyClient(815001001);
    const blogger = await bloggerClient(815001002);
    const { lotId } = await setupCompletedLot(owner.app, owner.token, owner.companyId, blogger.app, blogger.token);

    // Компания оценивает блогера.
    await owner.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(owner.token),
      payload: { rating: 5, comment: 'Отлично', targetId: blogger.userId },
    });
    // Блогер оценивает компанию.
    await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/reviews`,
      headers: bearer(blogger.token),
      payload: { rating: 4 },
    });

    const res = await blogger.app.inject({
      method: 'GET',
      url: `/lots/${lotId}`,
      headers: bearer(blogger.token),
    });
    const lot = res.json().lot;

    // Блогер дал отзыв (на компанию).
    expect(lot.reviewsGiven).toHaveLength(1);
    expect(lot.reviewsGiven[0].rating).toBe(4);

    // Блогер получил отзыв (от компании).
    expect(lot.reviewsReceived).toHaveLength(1);
    expect(lot.reviewsReceived[0].rating).toBe(5);
    expect(lot.reviewsReceived[0].authorName).toBe(`ООО ${815001001}`);

    await owner.app.close();
    await blogger.app.close();
  });
});
