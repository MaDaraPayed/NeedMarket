import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function futureISO(days = 7): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function lotBody(over: Record<string, unknown> = {}) {
  return {
    title: 'Реклама крема',
    description: 'Нужен обзор нового крема',
    categories: ['Красота'],
    platforms: ['Instagram'],
    budget: 100_000,
    deadline: futureISO(),
    requirements: ['Сторис + пост'],
    ...over,
  };
}

async function freshApp(): Promise<{ app: FastifyInstance; token: string }> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date()) },
  });
  return { app, token: auth.json().token };
}

// Компания с профилем. tgId позволяет завести несколько разных компаний.
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

async function createLot(app: FastifyInstance, token: string, over: Record<string, unknown> = {}) {
  return app.inject({ method: 'POST', url: '/lots', headers: bearer(token), payload: lotBody(over) });
}

// Вспомогательная функция: создаёт лот прямо в БД со статусом active (минуя gate оплаты).
async function insertActiveLot(companyId: string, title: string, extra: Record<string, unknown> = {}) {
  return testDb.lot.create({
    data: {
      companyId,
      title,
      description: 'Описание',
      categories: (extra.categories as string[]) ?? ['Красота'],
      platforms: (extra.platforms as string[]) ?? ['Instagram'],
      budget: (extra.budget as number) ?? 100_000,
      deadline: new Date(Date.now() + 7 * 86_400_000),
      requirements: [],
      status: 'active',
    },
  });
}

describe('POST /lots', () => {
  it('компания создаёт лот → 200, статус awaiting_payment (ждёт активации админом)', async () => {
    const { app, token, companyId } = await companyClient();
    const res = await createLot(app, token, { title: 'Обзор тонального', budget: 250_000 });
    expect(res.statusCode).toBe(200);
    const lot = res.json().lot;
    expect(lot.id).toBeTruthy();
    expect(lot.companyId).toBe(companyId);
    expect(lot.title).toBe('Обзор тонального');
    expect(lot.status).toBe('awaiting_payment');
    expect(lot.budget).toBe(250_000);
    expect(lot.platforms).toEqual(['Instagram']);
    expect(lot.categories).toEqual(['Красота']);
    expect(lot.company.name).toBe('ООО Ромашка');
    expect(lot.company.logoUrl).toBeNull();
    expect(typeof lot.deadline).toBe('string');
    await app.close();
  });

  it('несколько категорий → 200, categories[] сохранены', async () => {
    const { app, token } = await companyClient();
    const res = await createLot(app, token, { categories: ['Красота', 'Питание', 'Лайфстайл'] });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.categories).toEqual(['Красота', 'Питание', 'Лайфстайл']);
    await app.close();
  });

  it('невалидное тело (категории пусты) → 400', async () => {
    const { app, token } = await companyClient();
    const res = await createLot(app, token, { categories: [] });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('невалидное тело (неизвестная категория) → 400', async () => {
    const { app, token } = await companyClient();
    const res = await createLot(app, token, { categories: ['Красота', 'Несуществующая'] });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('невалидное тело (budget ≤ 0) → 400', async () => {
    const { app, token } = await companyClient();
    const res = await createLot(app, token, { budget: 0 });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('невалидное тело (площадки пусты) → 400', async () => {
    const { app, token } = await companyClient();
    const res = await createLot(app, token, { platforms: [] });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('невалидное тело (дедлайн в прошлом) → 400', async () => {
    const { app, token } = await companyClient();
    const res = await createLot(app, token, { deadline: new Date(Date.now() - 86_400_000).toISOString() });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('роль blogger → 403', async () => {
    const { app, token } = await freshApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
    const res = await createLot(app, token);
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('без роли → 403', async () => {
    const { app, token } = await freshApp();
    const res = await createLot(app, token);
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('без токена → 401', async () => {
    const { app } = await freshApp();
    const res = await app.inject({ method: 'POST', url: '/lots', payload: lotBody() });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /lots (лента)', () => {
  it('только active, новые сверху; draft и awaiting_payment исключены', async () => {
    const { app, token, companyId } = await companyClient();
    await insertActiveLot(companyId, 'Лот A');
    await insertActiveLot(companyId, 'Лот B');

    // Черновик и новый лот через API (awaiting_payment) — не должны попасть в ленту.
    await testDb.lot.create({
      data: {
        companyId,
        title: 'Черновик',
        description: '—',
        categories: ['Красота'],
        platforms: ['Instagram'],
        budget: 1000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'draft',
      },
    });
    await createLot(app, token, { title: 'Ждёт оплаты' });

    const res = await app.inject({ method: 'GET', url: '/lots', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const lots = res.json().lots;
    expect(lots).toHaveLength(2);
    expect(lots[0].title).toBe('Лот B'); // новый сверху
    expect(lots[1].title).toBe('Лот A');
    await app.close();
  });

  it('фильтр по category матчит лоты, где categories СОДЕРЖИТ выбранную', async () => {
    const { app, token, companyId } = await companyClient();
    await insertActiveLot(companyId, 'Бьюти-лот', { categories: ['Красота'] });
    await insertActiveLot(companyId, 'Еда-лот', { categories: ['Питание'] });
    await insertActiveLot(companyId, 'Микс-лот', { categories: ['Питание', 'Лайфстайл'] });

    const res = await app.inject({ method: 'GET', url: '/lots?category=Питание', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const titles = res.json().lots.map((l: { title: string }) => l.title).sort();
    expect(titles).toEqual(['Еда-лот', 'Микс-лот']);
    await app.close();
  });

  it('фильтр по platform', async () => {
    const { app, token, companyId } = await companyClient();
    await insertActiveLot(companyId, 'IG', { platforms: ['Instagram'] });
    await insertActiveLot(companyId, 'YT', { platforms: ['YouTube'] });
    await insertActiveLot(companyId, 'IG+TT', { platforms: ['Instagram', 'TikTok'] });

    const res = await app.inject({ method: 'GET', url: '/lots?platform=Instagram', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const titles = res.json().lots.map((l: { title: string }) => l.title).sort();
    expect(titles).toEqual(['IG', 'IG+TT']);
    await app.close();
  });

  it('пагинация limit/offset', async () => {
    const { app, token, companyId } = await companyClient();
    await insertActiveLot(companyId, 'L1');
    await insertActiveLot(companyId, 'L2');
    await insertActiveLot(companyId, 'L3'); // порядок по createdAt desc: L3, L2, L1

    const page1 = await app.inject({ method: 'GET', url: '/lots?limit=2&offset=0', headers: bearer(token) });
    expect(page1.json().lots.map((l: { title: string }) => l.title)).toEqual(['L3', 'L2']);

    const page2 = await app.inject({ method: 'GET', url: '/lots?limit=2&offset=2', headers: bearer(token) });
    expect(page2.json().lots.map((l: { title: string }) => l.title)).toEqual(['L1']);
    await app.close();
  });

  it('фильтр по нескольким категориям (hasSome): лоты с любой из выбранных', async () => {
    const { app, token, companyId } = await companyClient();
    await insertActiveLot(companyId, 'Только Бьюти', { categories: ['Красота'] });
    await insertActiveLot(companyId, 'Только Спорт', { categories: ['Спорт'] });
    await insertActiveLot(companyId, 'Бьюти+Еда', { categories: ['Красота', 'Питание'] });
    await insertActiveLot(companyId, 'Только Тех', { categories: ['IT'] });

    const res = await app.inject({
      method: 'GET',
      url: '/lots?category=%D0%9A%D1%80%D0%B0%D1%81%D0%BE%D1%82%D0%B0&category=%D0%A1%D0%BF%D0%BE%D1%80%D1%82',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const titles = res.json().lots.map((l: { title: string }) => l.title).sort();
    expect(titles).toEqual(['Бьюти+Еда', 'Только Бьюти', 'Только Спорт']);
    await app.close();
  });

  it('блогер тоже видит ленту (JWT любой роли)', async () => {
    const { app: company, token: cToken, companyId } = await companyClient();
    await insertActiveLot(companyId, 'Виден блогеру');
    await company.close();

    const { app, token } = await freshApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
    const res = await app.inject({ method: 'GET', url: '/lots', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().lots).toHaveLength(1);
    await app.close();
  });

  it('без токена → 401', async () => {
    const { app } = await freshApp();
    const res = await app.inject({ method: 'GET', url: '/lots' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /lots/:id', () => {
  it('существующий → 200, детально', async () => {
    const { app, token } = await companyClient();
    const created = await createLot(app, token, { title: 'Детальный', description: 'Полное описание' });
    const id = created.json().lot.id;

    const res = await app.inject({ method: 'GET', url: `/lots/${id}`, headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.id).toBe(id);
    expect(res.json().lot.description).toBe('Полное описание');
    expect(res.json().lot.company.name).toBe('ООО Ромашка');
    await app.close();
  });

  it('несуществующий → 404', async () => {
    const { app, token } = await companyClient();
    const res = await app.inject({ method: 'GET', url: '/lots/nope_does_not_exist', headers: bearer(token) });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /lots — hasResponded и hideResponded', () => {
  // Вспомогательный клиент блогера с профилем.
  async function bloggerClient(tgId: number): Promise<{ app: FastifyInstance; token: string }> {
    const app = buildApp({ db: testDb });
    await app.ready();
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: tgId }) },
    });
    const token = auth.json().token;
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
    await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(token),
      payload: { displayName: `Блогер ${tgId}`, categories: ['Красота'], linkedAccounts: [] },
    });
    return { app, token };
  }

  it('hasResponded=true на лотах, на которые откликнулся; false на остальных', async () => {
    const company = await companyClient(500001001);
    const lotWithResponse = (await insertActiveLot(company.companyId, 'Лот с откликом')).id;
    await insertActiveLot(company.companyId, 'Лот без отклика');
    await company.app.close();

    const blogger = await bloggerClient(600001001);
    await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotWithResponse}/responses`,
      headers: bearer(blogger.token),
      payload: { message: 'Хочу' },
    });

    const res = await blogger.app.inject({
      method: 'GET',
      url: '/lots',
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(200);
    const lots = res.json().lots;
    const withResp = lots.find((l: { id: string }) => l.id === lotWithResponse);
    const withoutResp = lots.find((l: { id: string }) => l.id !== lotWithResponse);
    expect(withResp?.hasResponded).toBe(true);
    expect(withoutResp?.hasResponded).toBe(false);
    await blogger.app.close();
  });

  it('hideResponded=true исключает лоты с откликом блогера', async () => {
    const company = await companyClient(500001002);
    const respondedLotId = (await insertActiveLot(company.companyId, 'Уже откликнулся')).id;
    await insertActiveLot(company.companyId, 'Ещё не откликнулся');
    await company.app.close();

    const blogger = await bloggerClient(600001002);
    await blogger.app.inject({
      method: 'POST',
      url: `/lots/${respondedLotId}/responses`,
      headers: bearer(blogger.token),
      payload: { message: 'Хочу' },
    });

    const res = await blogger.app.inject({
      method: 'GET',
      url: '/lots?hideResponded=true',
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(200);
    const lots = res.json().lots;
    expect(lots.every((l: { id: string }) => l.id !== respondedLotId)).toBe(true);
    expect(lots.some((l: { title: string }) => l.title === 'Ещё не откликнулся')).toBe(true);
    await blogger.app.close();
  });
});

describe('POST /lots — slotsNeeded', () => {
  it('создание лота с slotsNeeded=3 → значение сохранено', async () => {
    const { app, token } = await companyClient();
    const res = await createLot(app, token, { slotsNeeded: 3 });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.slotsNeeded).toBe(3);
    await app.close();
  });

  it('дефолт slotsNeeded=1 если не передан', async () => {
    const { app, token } = await companyClient();
    const res = await createLot(app, token);
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.slotsNeeded).toBe(1);
    await app.close();
  });

  it('slotsNeeded=0 → 400', async () => {
    const { app, token } = await companyClient();
    const res = await createLot(app, token, { slotsNeeded: 0 });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('slotsNeeded=21 → 400', async () => {
    const { app, token } = await companyClient();
    const res = await createLot(app, token, { slotsNeeded: 21 });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /me/lots', () => {
  it('компания видит свои лоты (все статусы, включая awaiting_payment); чужие — нет', async () => {
    const a = await companyClient(111000111);
    await createLot(a.app, a.token, { title: 'A-1' }); // awaiting_payment
    await insertActiveLot(a.companyId, 'A-2');          // active
    await a.app.close();

    const b = await companyClient(222000222);
    await createLot(b.app, b.token, { title: 'B-1' });

    const res = await b.app.inject({ method: 'GET', url: '/me/lots', headers: bearer(b.token) });
    expect(res.statusCode).toBe(200);
    const titles = res.json().lots.map((l: { title: string }) => l.title);
    expect(titles).toEqual(['B-1']);
    await b.app.close();
  });

  it('/me/lots включает awaiting_payment лоты компании', async () => {
    const { app, token } = await companyClient();
    await createLot(app, token, { title: 'Ждёт оплаты' });
    const res = await app.inject({ method: 'GET', url: '/me/lots', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const lots = res.json().lots;
    expect(lots).toHaveLength(1);
    expect(lots[0].status).toBe('awaiting_payment');
    await app.close();
  });

  it('роль blogger → 403', async () => {
    const { app, token } = await freshApp();
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
    const res = await app.inject({ method: 'GET', url: '/me/lots', headers: bearer(token) });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── DELETE /lots/:id ─────────────────────────────────────────────────────────

describe('DELETE /lots/:id — удаление лота компанией', () => {
  it('awaiting_payment → 200, лот исчезает', async () => {
    const company = await companyClient(701001001);
    const createRes = await createLot(company.app, company.token);
    expect(createRes.statusCode).toBe(200);
    const lotId = createRes.json().lot.id;

    const del = await company.app.inject({
      method: 'DELETE',
      url: `/lots/${lotId}`,
      headers: bearer(company.token),
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().lot.id).toBe(lotId);

    // Лот недоступен.
    const get = await company.app.inject({ method: 'GET', url: `/lots/${lotId}`, headers: bearer(company.token) });
    expect(get.statusCode).toBe(404);

    await company.app.close();
  });

  it('active → 200, responses и attachments каскадно удалены', async () => {
    const company = await companyClient(701002001);
    const lot = await insertActiveLot(company.companyId, 'Удаляемый active');

    // Создаём отклик и вложение напрямую в БД.
    const blogger = await testDb.bloggerProfile.create({
      data: {
        user: {
          create: {
            telegramId: BigInt(701002002),
            firstName: 'Блогер',
            role: 'blogger',
          },
        },
        displayName: 'Блогер',
        categories: ['Красота'],
        linkedAccounts: [],
      },
    });
    const response = await testDb.response.create({
      data: { lotId: lot.id, bloggerId: blogger.id, message: 'хочу', status: 'pending' },
    });
    const attachment = await testDb.lotAttachment.create({
      data: { lotId: lot.id, fileId: 'f_test', contentType: 'image/png', position: 0 },
    });

    const del = await company.app.inject({
      method: 'DELETE',
      url: `/lots/${lot.id}`,
      headers: bearer(company.token),
    });
    expect(del.statusCode).toBe(200);

    // Каскад: response и attachment должны исчезнуть.
    expect(await testDb.response.findUnique({ where: { id: response.id } })).toBeNull();
    expect(await testDb.lotAttachment.findUnique({ where: { id: attachment.id } })).toBeNull();
    expect(await testDb.lot.findUnique({ where: { id: lot.id } })).toBeNull();

    await company.app.close();
  });

  it('не-владелец → 403', async () => {
    const owner = await companyClient(701003001);
    const other = await companyClient(701003002);
    const lot = await insertActiveLot(owner.companyId, 'Чужой лот');

    const del = await other.app.inject({
      method: 'DELETE',
      url: `/lots/${lot.id}`,
      headers: bearer(other.token),
    });
    expect(del.statusCode).toBe(403);
    // Лот остался.
    expect(await testDb.lot.findUnique({ where: { id: lot.id } })).not.toBeNull();

    await owner.app.close();
    await other.app.close();
  });

  it('in_progress → 409', async () => {
    const company = await companyClient(701004001);
    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'In-progress лот',
        description: 'D',
        categories: ['Красота'],
        platforms: ['Instagram'],
        budget: 50_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'in_progress',
      },
    });

    const del = await company.app.inject({
      method: 'DELETE',
      url: `/lots/${lot.id}`,
      headers: bearer(company.token),
    });
    expect(del.statusCode).toBe(409);

    await company.app.close();
  });

  it('awaiting_payout → 409', async () => {
    const company = await companyClient(701005001);
    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Awaiting-payout лот',
        description: 'D',
        categories: ['Красота'],
        platforms: ['Instagram'],
        budget: 50_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'awaiting_payout',
      },
    });

    const del = await company.app.inject({
      method: 'DELETE',
      url: `/lots/${lot.id}`,
      headers: bearer(company.token),
    });
    expect(del.statusCode).toBe(409);

    await company.app.close();
  });

  it('completed → 409', async () => {
    const company = await companyClient(701006001);
    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Completed лот',
        description: 'D',
        categories: ['Красота'],
        platforms: ['Instagram'],
        budget: 50_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'completed',
      },
    });

    const del = await company.app.inject({
      method: 'DELETE',
      url: `/lots/${lot.id}`,
      headers: bearer(company.token),
    });
    expect(del.statusCode).toBe(409);

    await company.app.close();
  });

  it('несуществующий лот → 404', async () => {
    const company = await companyClient(701007001);
    const del = await company.app.inject({
      method: 'DELETE',
      url: '/lots/nonexistent-lot-id',
      headers: bearer(company.token),
    });
    expect(del.statusCode).toBe(404);
    await company.app.close();
  });
});

describe('Асимметрия: публичный DTO лота НЕ содержит contact компании и telegramUsername', () => {
  it('GET /lots — company.contact и telegramUsername отсутствуют в ленте', async () => {
    const { app, token, companyId } = await companyClient();
    await insertActiveLot(companyId, 'Лот без лишних данных');

    const res = await app.inject({ method: 'GET', url: '/lots', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const lot = res.json().lots[0];
    expect(lot.company.contact).toBeUndefined();
    expect((lot.company as Record<string, unknown>).telegramUsername).toBeUndefined();
    expect((lot as Record<string, unknown>).telegramUsername).toBeUndefined();
    await app.close();
  });

  it('GET /lots/:id — company.contact и telegramUsername отсутствуют в детальном DTO', async () => {
    const { app, token, companyId } = await companyClient();
    const lot = await insertActiveLot(companyId, 'Детальный без лишних данных');

    const res = await app.inject({ method: 'GET', url: `/lots/${lot.id}`, headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const data = res.json().lot;
    expect(data.company.contact).toBeUndefined();
    expect((data.company as Record<string, unknown>).telegramUsername).toBeUndefined();
    await app.close();
  });
});
