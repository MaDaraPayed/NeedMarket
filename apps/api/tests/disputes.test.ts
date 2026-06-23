import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';

// Fake-бот с отслеживанием вызовов sendMessage.
function makeFakeBot() {
  const calls: { to: number; text: string }[] = [];
  const bot = {
    api: {
      sendMessage: async (chatId: number, text: string) => {
        calls.push({ to: chatId, text });
        return { ok: true };
      },
    },
  } as unknown as import('grammy').Bot;
  return { bot, calls };
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

// ─── Хелперы для создания пользователей ───────────────────────────────────────

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
  const token = auth.json().token;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
  const prof = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: { name: `ООО ${tgId}`, contact: `contact_${tgId}@example.com` },
  });
  const userId: string = prof.json().user.id;
  return { app, token, companyId: prof.json().user.profile.id, userId };
}

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
  const token = auth.json().token;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
  const prof = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: {
      displayName: `Блогер ${tgId}`,
      categories: ['Бьюти'],
      linkedAccounts: [{ platform: 'Instagram', url: 'https://instagram.com/test' }],
      contact: `contact_${tgId}`,
    },
  });
  const userId: string = prof.json().user.id;
  return { app, token, bloggerId: prof.json().user.profile.id, userId };
}

// Создаёт лот напрямую в БД со статусом in_progress (минуя gate).
async function createInProgressLot(companyId: string): Promise<string> {
  const lot = await testDb.lot.create({
    data: {
      companyId,
      title: 'Тестовый лот',
      description: 'Описание',
      categories: ['Бьюти'],
      platforms: ['Instagram'],
      budget: 100_000,
      deadline: new Date(Date.now() + 7 * 86_400_000),
      requirements: [],
      status: 'in_progress',
      slotsNeeded: 1,
    },
  });
  return lot.id;
}

// Создаёт accepted response напрямую в БД.
async function createAcceptedResponse(lotId: string, bloggerId: string): Promise<string> {
  const r = await testDb.response.create({
    data: { lotId, bloggerId, message: 'Хочу участвовать', status: 'accepted' },
  });
  return r.id;
}

const VALID_DISPUTE_BODY = (responseId: string) => ({
  responseId,
  reason: 'not_delivered',
  description: 'Блогер не выполнил условия договора',
});

// ─── POST /lots/:id/disputes ──────────────────────────────────────────────────

describe('POST /lots/:id/disputes — открытие спора компанией', () => {
  it('компания-владелец открывает спор → 201, Dispute.open создан, Response→disputed, againstId = userId блогера', async () => {
    const company = await companyClient(801001001);
    const blogger = await bloggerClient(802001001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(company.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });

    expect(res.statusCode).toBe(201);
    const d = res.json().dispute;
    expect(d.status).toBe('open');
    expect(d.lotId).toBe(lotId);
    expect(d.responseId).toBe(responseId);
    expect(d.raisedById).toBe(company.userId);
    expect(d.againstId).toBe(blogger.userId);
    expect(d.reason).toBe('not_delivered');

    // Response переведён в disputed.
    const dbResp = await testDb.response.findUnique({ where: { id: responseId } });
    expect(dbResp?.status).toBe('disputed');

    // Dispute в БД.
    const dbDispute = await testDb.dispute.findFirst({ where: { responseId } });
    expect(dbDispute?.status).toBe('open');
    expect(dbDispute?.againstId).toBe(blogger.userId);

    await company.app.close();
    await blogger.app.close();
  });

  it('блогер открывает спор → 201, againstId = userId компании', async () => {
    const company = await companyClient(801002001);
    const blogger = await bloggerClient(802002001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    const res = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(blogger.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });

    expect(res.statusCode).toBe(201);
    const d = res.json().dispute;
    expect(d.raisedById).toBe(blogger.userId);
    expect(d.againstId).toBe(company.userId);
    expect(d.status).toBe('open');

    // Response → disputed.
    const dbResp = await testDb.response.findUnique({ where: { id: responseId } });
    expect(dbResp?.status).toBe('disputed');

    await company.app.close();
    await blogger.app.close();
  });
});

describe('POST /lots/:id/disputes — гарды статуса лота', () => {
  it('лот active → 409', async () => {
    const company = await companyClient(801003001);
    const blogger = await bloggerClient(802003001);

    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Активный',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 50_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'active',
      },
    });
    const responseId = await createAcceptedResponse(lot.id, blogger.bloggerId);

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/disputes`,
      headers: bearer(company.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });
    expect(res.statusCode).toBe(409);

    await company.app.close();
    await blogger.app.close();
  });

  it('лот awaiting_payout → 201 (разрешён)', async () => {
    const company = await companyClient(801004001);
    const blogger = await bloggerClient(802004001);

    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Ожидает выплаты',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 50_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'awaiting_payout',
      },
    });
    const responseId = await createAcceptedResponse(lot.id, blogger.bloggerId);

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/disputes`,
      headers: bearer(company.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });
    expect(res.statusCode).toBe(201);

    await company.app.close();
    await blogger.app.close();
  });

  it('лот completed → 409', async () => {
    const company = await companyClient(801005001);
    const blogger = await bloggerClient(802005001);

    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Завершён',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 50_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'completed',
      },
    });
    const responseId = await createAcceptedResponse(lot.id, blogger.bloggerId);

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/disputes`,
      headers: bearer(company.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });
    expect(res.statusCode).toBe(409);

    await company.app.close();
    await blogger.app.close();
  });
});

describe('POST /lots/:id/disputes — гарды статуса отклика', () => {
  it('response.status = pending → 409', async () => {
    const company = await companyClient(801006001);
    const blogger = await bloggerClient(802006001);
    const lotId = await createInProgressLot(company.companyId);

    // pending response
    const r = await testDb.response.create({
      data: { lotId, bloggerId: blogger.bloggerId, message: 'ok', status: 'pending' },
    });

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(company.token),
      payload: VALID_DISPUTE_BODY(r.id),
    });
    expect(res.statusCode).toBe(409);

    await company.app.close();
    await blogger.app.close();
  });

  it('response.status = rejected → 409', async () => {
    const company = await companyClient(801007001);
    const blogger = await bloggerClient(802007001);
    const lotId = await createInProgressLot(company.companyId);

    const r = await testDb.response.create({
      data: { lotId, bloggerId: blogger.bloggerId, message: 'ok', status: 'rejected' },
    });

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(company.token),
      payload: VALID_DISPUTE_BODY(r.id),
    });
    expect(res.statusCode).toBe(409);

    await company.app.close();
    await blogger.app.close();
  });

  it('response не принадлежит этому лоту → 404', async () => {
    const company = await companyClient(801008001);
    const blogger = await bloggerClient(802008001);

    const lot1 = await createInProgressLot(company.companyId);
    const lot2 = await createInProgressLot(company.companyId);
    const responseOnLot2 = await createAcceptedResponse(lot2, blogger.bloggerId);

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lot1}/disputes`,
      headers: bearer(company.token),
      payload: VALID_DISPUTE_BODY(responseOnLot2),
    });
    expect(res.statusCode).toBe(404);

    await company.app.close();
    await blogger.app.close();
  });
});

describe('POST /lots/:id/disputes — гард не-участника (403)', () => {
  it('чужая компания → 403', async () => {
    const owner = await companyClient(801009001);
    const other = await companyClient(801009002);
    const blogger = await bloggerClient(802009001);

    const lotId = await createInProgressLot(owner.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    const res = await other.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(other.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });
    expect(res.statusCode).toBe(403);

    await owner.app.close();
    await other.app.close();
    await blogger.app.close();
  });

  it('чужой блогер (не тот, кто в response) → 403', async () => {
    const company = await companyClient(801010001);
    const blogger1 = await bloggerClient(802010001);
    const blogger2 = await bloggerClient(802010002);

    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger1.bloggerId);

    // blogger2 пытается открыть спор по чужому отклику
    const res = await blogger2.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(blogger2.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });
    expect(res.statusCode).toBe(403);

    await company.app.close();
    await blogger1.app.close();
    await blogger2.app.close();
  });
});

describe('POST /lots/:id/disputes — дубль спора (409)', () => {
  it('второй вызов по тому же response → 409', async () => {
    const company = await companyClient(801011001);
    const blogger = await bloggerClient(802011001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    // Первый → 201
    const r1 = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(company.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });
    expect(r1.statusCode).toBe(201);

    // Второй → 409
    const r2 = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(company.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });
    expect(r2.statusCode).toBe(409);

    await company.app.close();
    await blogger.app.close();
  });
});

describe('POST /lots/:id/disputes — вложения', () => {
  it('корректные вложения сохраняются (batch)', async () => {
    const company = await companyClient(801012001);
    const blogger = await bloggerClient(802012001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(company.token),
      payload: {
        ...VALID_DISPUTE_BODY(responseId),
        attachments: [
          { fileId: 'file_aaa', fileName: 'screenshot.png', mimeType: 'image/png' },
          { fileId: 'file_bbb', fileName: 'contract.pdf', mimeType: 'application/pdf' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);

    const disputeId = res.json().dispute.id;
    const atts = await testDb.disputeAttachment.findMany({ where: { disputeId } });
    expect(atts).toHaveLength(2);
    expect(atts.map((a) => a.fileId).sort()).toEqual(['file_aaa', 'file_bbb'].sort());

    await company.app.close();
    await blogger.app.close();
  });

  it('неразрешённый mime → 400', async () => {
    const company = await companyClient(801013001);
    const blogger = await bloggerClient(802013001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(company.token),
      payload: {
        ...VALID_DISPUTE_BODY(responseId),
        attachments: [{ fileId: 'file_x', fileName: 'virus.exe', mimeType: 'application/x-msdownload' }],
      },
    });
    expect(res.statusCode).toBe(400);

    await company.app.close();
    await blogger.app.close();
  });

  it('лимит 5 вложений — 6 штук → 400', async () => {
    const company = await companyClient(801014001);
    const blogger = await bloggerClient(802014001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(company.token),
      payload: {
        ...VALID_DISPUTE_BODY(responseId),
        attachments: Array.from({ length: 6 }, (_, i) => ({
          fileId: `file_${i}`,
          fileName: `file${i}.png`,
          mimeType: 'image/png',
        })),
      },
    });
    expect(res.statusCode).toBe(400);

    await company.app.close();
    await blogger.app.close();
  });
});

// ─── Заморозка complete и close при открытом споре ───────────────────────────

describe('Заморозка POST /lots/:id/complete при open dispute', () => {
  it('open dispute → complete возвращает 409', async () => {
    const company = await companyClient(803001001);
    const blogger = await bloggerClient(804001001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    // Открываем спор (через API).
    await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(company.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/complete`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/спор|dispute/i);

    await company.app.close();
    await blogger.app.close();
  });

  it('resolved dispute → complete проходит', async () => {
    const company = await companyClient(803002001);
    const blogger = await bloggerClient(804002001);

    // Лот active (для complete нужен accepted response).
    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Лот resolved',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'active',
        slotsNeeded: 1,
      },
    });
    const r = await testDb.response.create({
      data: { lotId: lot.id, bloggerId: blogger.bloggerId, message: 'ok', status: 'accepted' },
    });
    // Лот → in_progress (complete требует active/in_progress).
    await testDb.lot.update({ where: { id: lot.id }, data: { status: 'in_progress' } });

    // Спор в resolved-состоянии (фикстура напрямую).
    await testDb.dispute.create({
      data: {
        lotId: lot.id,
        responseId: r.id,
        raisedById: company.userId,
        againstId: blogger.userId,
        reason: 'other',
        description: 'test',
        status: 'resolved',
        resolution: 'partial',
      },
    });
    // Response вернём в accepted (фикстура — иначе complete не пройдёт).
    await testDb.response.update({ where: { id: r.id }, data: { status: 'accepted' } });

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/complete`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.status).toBe('awaiting_payout');

    await company.app.close();
    await blogger.app.close();
  });
});

describe('Заморозка POST /admin/lots/:id/close при open dispute', () => {
  it('open dispute → close возвращает 409 (admin = tgId 555000111)', async () => {
    // tgId=555000111 — admin (из vitest.config.ts ADMIN_TELEGRAM_IDS).
    const company = await companyClient(555000111);
    const blogger = await bloggerClient(804003001);

    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Ожидает выплаты',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'awaiting_payout',
      },
    });
    const r = await testDb.response.create({
      data: { lotId: lot.id, bloggerId: blogger.bloggerId, message: 'ok', status: 'accepted' },
    });

    // Спор напрямую в БД (open).
    await testDb.dispute.create({
      data: {
        lotId: lot.id,
        responseId: r.id,
        raisedById: company.userId,
        againstId: blogger.userId,
        reason: 'no_payment',
        description: 'test',
        status: 'open',
      },
    });

    const res = await company.app.inject({
      method: 'POST',
      url: `/admin/lots/${lot.id}/close`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/спор|dispute/i);

    await company.app.close();
    await blogger.app.close();
  });

  it('resolved dispute → close проходит', async () => {
    const company = await companyClient(555000111);
    const blogger = await bloggerClient(804004001);

    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Выплата ок',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'awaiting_payout',
      },
    });
    const r = await testDb.response.create({
      data: { lotId: lot.id, bloggerId: blogger.bloggerId, message: 'ok', status: 'accepted' },
    });
    await testDb.dispute.create({
      data: {
        lotId: lot.id,
        responseId: r.id,
        raisedById: company.userId,
        againstId: blogger.userId,
        reason: 'other',
        description: 'test',
        status: 'resolved',
        resolution: 'favor_company',
      },
    });

    const res = await company.app.inject({
      method: 'POST',
      url: `/admin/lots/${lot.id}/close`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.status).toBe('completed');

    await company.app.close();
    await blogger.app.close();
  });
});

// ─── Видимость disputeStatus в GET /lots/:id ─────────────────────────────────

describe('GET /lots/:id — myDisputeStatus', () => {
  it('блогер с открытым спором видит myDisputeStatus=open', async () => {
    const company = await companyClient(805001001);
    const blogger = await bloggerClient(806001001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    // Открываем спор.
    await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(blogger.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });

    const res = await blogger.app.inject({
      method: 'GET',
      url: `/lots/${lotId}`,
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.myDisputeStatus).toBe('open');

    await company.app.close();
    await blogger.app.close();
  });

  it('компания-владелец с открытым спором видит myDisputeStatus=open', async () => {
    const company = await companyClient(805002001);
    const blogger = await bloggerClient(806002001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(company.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });

    const res = await company.app.inject({
      method: 'GET',
      url: `/lots/${lotId}`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.myDisputeStatus).toBe('open');

    await company.app.close();
    await blogger.app.close();
  });

  it('третий пользователь (не участник) видит myDisputeStatus=null', async () => {
    const company = await companyClient(805003001);
    const blogger = await bloggerClient(806003001);
    const outsider = await bloggerClient(806003002);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(company.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });

    const res = await outsider.app.inject({
      method: 'GET',
      url: `/lots/${lotId}`,
      headers: bearer(outsider.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.myDisputeStatus).toBeNull();

    await company.app.close();
    await blogger.app.close();
    await outsider.app.close();
  });

  it('нет спора → myDisputeStatus=null', async () => {
    const company = await companyClient(805004001);
    const blogger = await bloggerClient(806004001);
    const lotId = await createInProgressLot(company.companyId);
    await createAcceptedResponse(lotId, blogger.bloggerId);

    const res = await blogger.app.inject({
      method: 'GET',
      url: `/lots/${lotId}`,
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.myDisputeStatus).toBeNull();

    await company.app.close();
    await blogger.app.close();
  });
});

// ─── Асимметрия: контакт компании НЕ утекает блогеру при споре ───────────────

describe('Асимметрия видимости при споре', () => {
  it('блогерский GET /lots/:id НЕ содержит contact компании даже при открытом споре', async () => {
    const company = await companyClient(807001001);
    const blogger = await bloggerClient(808001001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    await company.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(company.token),
      payload: VALID_DISPUTE_BODY(responseId),
    });

    const res = await blogger.app.inject({
      method: 'GET',
      url: `/lots/${lotId}`,
      headers: bearer(blogger.token),
    });
    expect(res.statusCode).toBe(200);
    const lot = res.json().lot;
    // company-бриф НЕ должен содержать contact
    expect(lot.company).not.toHaveProperty('contact');

    await company.app.close();
    await blogger.app.close();
  });
});

// ─── GET /admin/disputes ──────────────────────────────────────────────────────

describe('GET /admin/disputes — авторизация', () => {
  it('не-админ → 403', async () => {
    const company = await companyClient(820001001);

    const res = await company.app.inject({
      method: 'GET',
      url: '/admin/disputes',
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(403);

    await company.app.close();
  });
});

describe('GET /admin/disputes — список споров', () => {
  it('пустой список если нет споров', async () => {
    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });
    const adminToken = auth.json().token;

    const res = await adminApp.inject({
      method: 'GET',
      url: '/admin/disputes',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().disputes).toHaveLength(0);

    await adminApp.close();
  });

  it('open-список содержит обе стороны, attachments и commission=10%', async () => {
    const company = await companyClient(820002001);
    const blogger = await bloggerClient(821002001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    const dispute = await testDb.dispute.create({
      data: {
        lotId,
        responseId,
        raisedById: company.userId,
        againstId: blogger.userId,
        reason: 'not_delivered',
        description: 'Не выполнил',
        status: 'open',
      },
    });
    await testDb.disputeAttachment.createMany({
      data: [{ disputeId: dispute.id, fileId: 'file_abc', fileName: 'proof.png', mimeType: 'image/png' }],
    });

    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });
    const adminToken = auth.json().token;

    const res = await adminApp.inject({
      method: 'GET',
      url: '/admin/disputes?status=open',
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const disputes = res.json().disputes;
    expect(disputes).toHaveLength(1);

    const d = disputes[0];
    expect(d.id).toBe(dispute.id);
    expect(d.status).toBe('open');
    expect(d.reason).toBe('not_delivered');
    expect(d.lot.commission).toBe(Math.round(100_000 * 0.1));
    expect(d.lot.payout).toBe(100_000 - d.lot.commission);
    expect(d.company).toHaveProperty('name');
    expect(d.company).toHaveProperty('contact');
    expect(d.blogger).toHaveProperty('displayName');
    expect(d.blogger).toHaveProperty('contact');
    expect(d.attachments).toHaveLength(1);
    expect(d.attachments[0].fileId).toBe('file_abc');
    expect(d.resolution).toBeNull();
    expect(d.resolvedAt).toBeNull();

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('фильтр status=resolved показывает только resolved-споры', async () => {
    const company = await companyClient(820003001);
    const blogger = await bloggerClient(821003001);
    const lotId = await createInProgressLot(company.companyId);
    const r1 = await createAcceptedResponse(lotId, blogger.bloggerId);

    await testDb.dispute.create({
      data: {
        lotId,
        responseId: r1,
        raisedById: company.userId,
        againstId: blogger.userId,
        reason: 'other',
        description: 'test',
        status: 'resolved',
        resolution: 'partial',
      },
    });

    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });
    const adminToken = auth.json().token;

    const resOpen = await adminApp.inject({
      method: 'GET',
      url: '/admin/disputes?status=open',
      headers: bearer(adminToken),
    });
    expect(resOpen.json().disputes).toHaveLength(0);

    const resResolved = await adminApp.inject({
      method: 'GET',
      url: '/admin/disputes?status=resolved',
      headers: bearer(adminToken),
    });
    expect(resResolved.json().disputes).toHaveLength(1);
    expect(resResolved.json().disputes[0].resolution).toBe('partial');

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });
});

// ─── POST /admin/disputes/:id/resolve ────────────────────────────────────────

describe('POST /admin/disputes/:id/resolve — авторизация', () => {
  it('не-админ → 403', async () => {
    const company = await companyClient(820004001);
    const blogger = await bloggerClient(821004001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);
    const dispute = await testDb.dispute.create({
      data: {
        lotId,
        responseId,
        raisedById: company.userId,
        againstId: blogger.userId,
        reason: 'other',
        description: 'test',
        status: 'open',
      },
    });

    const res = await company.app.inject({
      method: 'POST',
      url: `/admin/disputes/${dispute.id}/resolve`,
      headers: bearer(company.token),
      payload: { resolution: 'favor_blogger' },
    });
    expect(res.statusCode).toBe(403);

    await company.app.close();
    await blogger.app.close();
  });
});

describe('POST /admin/disputes/:id/resolve — исходы', () => {
  it('favor_company → Response.status=accepted, Dispute.resolved с resolvedById', async () => {
    const company = await companyClient(820005001);
    const blogger = await bloggerClient(821005001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);
    const dispute = await testDb.dispute.create({
      data: {
        lotId,
        responseId,
        raisedById: company.userId,
        againstId: blogger.userId,
        reason: 'not_delivered',
        description: 'test',
        status: 'open',
      },
    });

    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });
    const adminToken = auth.json().token;
    const adminUserId = auth.json().user.id;

    const res = await adminApp.inject({
      method: 'POST',
      url: `/admin/disputes/${dispute.id}/resolve`,
      headers: bearer(adminToken),
      payload: { resolution: 'favor_company', note: 'Блогер не выполнил' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().dispute.resolution).toBe('favor_company');
    expect(res.json().dispute.status).toBe('resolved');

    const dbResponse = await testDb.response.findUnique({ where: { id: responseId } });
    expect(dbResponse?.status).toBe('accepted');

    const dbDispute = await testDb.dispute.findFirst({ where: { id: dispute.id } });
    expect(dbDispute?.status).toBe('resolved');
    expect(dbDispute?.resolution).toBe('favor_company');
    expect(dbDispute?.resolutionNote).toBe('Блогер не выполнил');
    expect(dbDispute?.resolvedById).toBe(adminUserId);
    expect(dbDispute?.resolvedAt).not.toBeNull();

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('favor_blogger → Response.status=accepted, Dispute.resolved', async () => {
    const company = await companyClient(820006001);
    const blogger = await bloggerClient(821006001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);
    const dispute = await testDb.dispute.create({
      data: {
        lotId,
        responseId,
        raisedById: company.userId,
        againstId: blogger.userId,
        reason: 'not_delivered',
        description: 'test',
        status: 'open',
      },
    });

    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });

    const res = await adminApp.inject({
      method: 'POST',
      url: `/admin/disputes/${dispute.id}/resolve`,
      headers: bearer(auth.json().token),
      payload: { resolution: 'favor_blogger' },
    });
    expect(res.statusCode).toBe(200);

    const dbResponse = await testDb.response.findUnique({ where: { id: responseId } });
    expect(dbResponse?.status).toBe('accepted');

    const dbDispute = await testDb.dispute.findFirst({ where: { id: dispute.id } });
    expect(dbDispute?.resolution).toBe('favor_blogger');
    expect(dbDispute?.resolutionNote).toBeNull();

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('partial → Response.status=accepted, Dispute.resolved', async () => {
    const company = await companyClient(820007001);
    const blogger = await bloggerClient(821007001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);
    const dispute = await testDb.dispute.create({
      data: {
        lotId,
        responseId,
        raisedById: company.userId,
        againstId: blogger.userId,
        reason: 'other',
        description: 'test',
        status: 'open',
      },
    });

    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });

    const res = await adminApp.inject({
      method: 'POST',
      url: `/admin/disputes/${dispute.id}/resolve`,
      headers: bearer(auth.json().token),
      payload: { resolution: 'partial', note: 'Разделили' },
    });
    expect(res.statusCode).toBe(200);

    const dbResponse = await testDb.response.findUnique({ where: { id: responseId } });
    expect(dbResponse?.status).toBe('accepted');

    const dbDispute = await testDb.dispute.findFirst({ where: { id: dispute.id } });
    expect(dbDispute?.resolution).toBe('partial');

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('повторный resolve → 409', async () => {
    const company = await companyClient(820008001);
    const blogger = await bloggerClient(821008001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);
    const dispute = await testDb.dispute.create({
      data: {
        lotId,
        responseId,
        raisedById: company.userId,
        againstId: blogger.userId,
        reason: 'other',
        description: 'test',
        status: 'resolved',
        resolution: 'partial',
      },
    });

    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });

    const res = await adminApp.inject({
      method: 'POST',
      url: `/admin/disputes/${dispute.id}/resolve`,
      headers: bearer(auth.json().token),
      payload: { resolution: 'favor_blogger' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already resolved/i);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('после resolve → POST /admin/lots/:id/close больше не 409 (разморозка)', async () => {
    const company = await companyClient(820009001);
    const blogger = await bloggerClient(821009001);

    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Ожидает выплаты',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 86_400_000),
        requirements: [],
        status: 'awaiting_payout',
      },
    });
    const responseId = await createAcceptedResponse(lot.id, blogger.bloggerId);
    await testDb.response.update({ where: { id: responseId }, data: { status: 'disputed' } });

    const dispute = await testDb.dispute.create({
      data: {
        lotId: lot.id,
        responseId,
        raisedById: company.userId,
        againstId: blogger.userId,
        reason: 'other',
        description: 'test',
        status: 'open',
      },
    });

    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const auth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });
    const adminToken = auth.json().token;

    // До resolve — close блокируется.
    const before = await adminApp.inject({
      method: 'POST',
      url: `/admin/lots/${lot.id}/close`,
      headers: bearer(adminToken),
    });
    expect(before.statusCode).toBe(409);

    // Resolve.
    await adminApp.inject({
      method: 'POST',
      url: `/admin/disputes/${dispute.id}/resolve`,
      headers: bearer(adminToken),
      payload: { resolution: 'favor_blogger' },
    });

    // После resolve — close проходит.
    const after = await adminApp.inject({
      method: 'POST',
      url: `/admin/lots/${lot.id}/close`,
      headers: bearer(adminToken),
    });
    expect(after.statusCode).toBe(200);
    expect(after.json().lot.status).toBe('completed');

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });
});

// ─── Уведомления при открытии спора ──────────────────────────────────────────

describe('Уведомления при открытии спора', () => {
  it('dispute_opened → вторая сторона (againstId) получает уведомление', async () => {
    const { bot, calls } = makeFakeBot();
    const company = await companyClient(822001001);
    const blogger = await bloggerClient(823001001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();
    const authRes = await appWithBot.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 822001001 }) },
    });

    await appWithBot.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(authRes.json().token),
      payload: VALID_DISPUTE_BODY(responseId),
    });
    await new Promise((r) => setTimeout(r, 30));

    expect(calls.some((c) => c.to === 823001001)).toBe(true);

    await appWithBot.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('admin_dispute → все админы получают уведомление', async () => {
    const { bot, calls } = makeFakeBot();
    const company = await companyClient(822002001);
    const blogger = await bloggerClient(823002001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();
    const authRes = await appWithBot.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 822002001 }) },
    });

    await appWithBot.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(authRes.json().token),
      payload: VALID_DISPUTE_BODY(responseId),
    });
    await new Promise((r) => setTimeout(r, 30));

    expect(calls.some((c) => c.to === 555000111)).toBe(true);

    await appWithBot.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('ДЕДУП: два спора по РАЗНЫМ парам одного лота → оба уведомляют админов', async () => {
    const { bot, calls } = makeFakeBot();
    const company = await companyClient(822003001);
    const blogger1 = await bloggerClient(823003001);
    const blogger2 = await bloggerClient(823003002);
    const lotId = await createInProgressLot(company.companyId);
    const responseId1 = await createAcceptedResponse(lotId, blogger1.bloggerId);
    const responseId2 = await createAcceptedResponse(lotId, blogger2.bloggerId);

    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();
    const authRes = await appWithBot.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 822003001 }) },
    });
    const companyToken = authRes.json().token;

    await appWithBot.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(companyToken),
      payload: VALID_DISPUTE_BODY(responseId1),
    });
    await appWithBot.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(companyToken),
      payload: VALID_DISPUTE_BODY(responseId2),
    });
    await new Promise((r) => setTimeout(r, 30));

    // Оба admin_dispute проходят (разные responseId → разные dedupeKey).
    const adminCalls = calls.filter((c) => c.to === 555000111);
    expect(adminCalls.length).toBeGreaterThanOrEqual(2);

    await appWithBot.close();
    await company.app.close();
    await blogger1.app.close();
    await blogger2.app.close();
  });

  it('notificationsEnabled=false подавляет dispute_opened для получателя', async () => {
    const { bot, calls } = makeFakeBot();
    const company = await companyClient(822004001);
    const blogger = await bloggerClient(823004001);

    // Выключаем уведомления блогеру.
    const settingsApp = buildApp({ db: testDb });
    await settingsApp.ready();
    const authBlogger = await settingsApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 823004001 }) },
    });
    await settingsApp.inject({
      method: 'PATCH',
      url: '/me/settings',
      headers: bearer(authBlogger.json().token),
      payload: { notificationsEnabled: false },
    });
    await settingsApp.close();

    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();
    const authComp = await appWithBot.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 822004001 }) },
    });

    await appWithBot.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(authComp.json().token),
      payload: VALID_DISPUTE_BODY(responseId),
    });
    await new Promise((r) => setTimeout(r, 30));

    expect(calls.filter((c) => c.to === 823004001)).toHaveLength(0);

    await appWithBot.close();
    await company.app.close();
    await blogger.app.close();
  });
});

// ─── Уведомления при разрешении спора ────────────────────────────────────────

describe('Уведомления при разрешении спора', () => {
  it('dispute_resolved → обе стороны (raisedById + againstId) получают уведомление', async () => {
    const { bot, calls } = makeFakeBot();
    const company = await companyClient(822005001);
    const blogger = await bloggerClient(823005001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    const dispute = await testDb.dispute.create({
      data: {
        lotId,
        responseId,
        raisedById: company.userId,
        againstId: blogger.userId,
        reason: 'other',
        description: 'test',
        status: 'open',
      },
    });

    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();
    const adminAuth = await appWithBot.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });

    await appWithBot.inject({
      method: 'POST',
      url: `/admin/disputes/${dispute.id}/resolve`,
      headers: bearer(adminAuth.json().token),
      payload: { resolution: 'favor_blogger' },
    });
    await new Promise((r) => setTimeout(r, 30));

    // Компания (raisedById) и блогер (againstId) оба получают dispute_resolved.
    expect(calls.some((c) => c.to === 822005001)).toBe(true);
    expect(calls.some((c) => c.to === 823005001)).toBe(true);

    await appWithBot.close();
    await company.app.close();
    await blogger.app.close();
  });
});

// ─── per-response disputeStatus ──────────────────────────────────────────────

describe('GET /lots/:id/responses — disputeStatus per-response', () => {
  it('компания видит disputeStatus=open на отклике со спором, null на остальных', async () => {
    const company = await companyClient(830001001);
    const blogger1 = await bloggerClient(831001001);
    const blogger2 = await bloggerClient(831001002);
    const lotId = await createInProgressLot(company.companyId);
    const responseId1 = await createAcceptedResponse(lotId, blogger1.bloggerId);
    const responseId2 = await createAcceptedResponse(lotId, blogger2.bloggerId);

    // Спор только по первому отклику.
    await testDb.dispute.create({
      data: {
        lotId,
        responseId: responseId1,
        raisedById: company.userId,
        againstId: blogger1.userId,
        reason: 'other',
        description: 'тест',
        status: 'open',
      },
    });

    const res = await company.app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    const responses = res.json().responses as Array<{ id: string; disputeStatus: string | null }>;

    const r1 = responses.find((r) => r.id === responseId1);
    const r2 = responses.find((r) => r.id === responseId2);
    expect(r1?.disputeStatus).toBe('open');
    expect(r2?.disputeStatus).toBe(null);

    await company.app.close();
    await blogger1.app.close();
    await blogger2.app.close();
  });

  it('блогер видит disputeStatus в /me/responses (open → resolved после закрытия)', async () => {
    const company = await companyClient(830002001);
    const blogger = await bloggerClient(831002001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    const dispute = await testDb.dispute.create({
      data: {
        lotId,
        responseId,
        raisedById: blogger.userId,
        againstId: company.userId,
        reason: 'no_payment',
        description: 'тест',
        status: 'open',
      },
    });

    const res1 = await blogger.app.inject({
      method: 'GET',
      url: '/me/responses',
      headers: bearer(blogger.token),
    });
    expect(res1.statusCode).toBe(200);
    const rs1 = res1.json().responses as Array<{ id: string; disputeStatus: string | null }>;
    expect(rs1.find((r) => r.id === responseId)?.disputeStatus).toBe('open');

    // После разрешения — resolved.
    await testDb.dispute.update({ where: { id: dispute.id }, data: { status: 'resolved' } });

    const res2 = await blogger.app.inject({
      method: 'GET',
      url: '/me/responses',
      headers: bearer(blogger.token),
    });
    const rs2 = res2.json().responses as Array<{ id: string; disputeStatus: string | null }>;
    expect(rs2.find((r) => r.id === responseId)?.disputeStatus).toBe('resolved');

    await company.app.close();
    await blogger.app.close();
  });
});

// ─── Гард: спор только по accepted-отклику ────────────────────────────────────

describe('POST /lots/:id/disputes — гард response.status=accepted', () => {
  it('rejected-блогер открывает спор → 409', async () => {
    const company = await companyClient(840001001);
    const blogger = await bloggerClient(841001001);
    const lotId = await createInProgressLot(company.companyId);

    const response = await testDb.response.create({
      data: { lotId, bloggerId: blogger.bloggerId, message: 'хочу', status: 'rejected' },
    });

    const res = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(blogger.token),
      payload: { responseId: response.id, reason: 'no_payment', description: 'Не заплатили' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/rejected/);

    await company.app.close();
    await blogger.app.close();
  });

  it('pending-блогер открывает спор → 409', async () => {
    const company = await companyClient(840002001);
    const blogger = await bloggerClient(841002001);
    const lotId = await createInProgressLot(company.companyId);

    const response = await testDb.response.create({
      data: { lotId, bloggerId: blogger.bloggerId, message: 'хочу', status: 'pending' },
    });

    const res = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(blogger.token),
      payload: { responseId: response.id, reason: 'no_payment', description: 'Ждал ответа' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/pending/);

    await company.app.close();
    await blogger.app.close();
  });

  it('accepted-блогер открывает спор → 201', async () => {
    const company = await companyClient(840003001);
    const blogger = await bloggerClient(841003001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    const res = await blogger.app.inject({
      method: 'POST',
      url: `/lots/${lotId}/disputes`,
      headers: bearer(blogger.token),
      payload: { responseId, reason: 'no_payment', description: 'Деньги не перевели' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().dispute.status).toBe('open');

    await company.app.close();
    await blogger.app.close();
  });
});

// ─── Счётчик занятых слотов: disputed = занят ─────────────────────────────────

describe('acceptedCount учитывает disputed-отклик как занятый слот', () => {
  it('GET /lots/:id → acceptedCount=1 при disputed-отклике (не 0)', async () => {
    const company = await companyClient(850001001);
    const blogger = await bloggerClient(851001001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);

    // Переводим отклик в disputed (минуя API открытия спора — напрямую).
    await testDb.response.update({ where: { id: responseId }, data: { status: 'disputed' } });

    const res = await company.app.inject({
      method: 'GET',
      url: `/lots/${lotId}`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    // Спорный отклик — слот занят.
    expect(res.json().lot.acceptedCount).toBe(1);

    await company.app.close();
    await blogger.app.close();
  });

  it('GET /lots/:id/responses → acceptedCount=1 при disputed-отклике', async () => {
    const company = await companyClient(850002001);
    const blogger = await bloggerClient(851002001);
    const lotId = await createInProgressLot(company.companyId);
    const responseId = await createAcceptedResponse(lotId, blogger.bloggerId);
    await testDb.response.update({ where: { id: responseId }, data: { status: 'disputed' } });

    const res = await company.app.inject({
      method: 'GET',
      url: `/lots/${lotId}/responses`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().acceptedCount).toBe(1);

    await company.app.close();
    await blogger.app.close();
  });
});

// ─── Переход лота при разрешении спора ───────────────────────────────────────

describe('POST /admin/disputes/:id/resolve — переход лота', () => {
  // Хелпер: создаём disputed-отклик + dispute напрямую в БД.
  async function createDisputedSetup(companyId: string, bloggerId: string, companyUserId: string, bloggerUserId: string) {
    const lot = await testDb.lot.create({
      data: {
        companyId,
        title: 'Спорный лот',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'in_progress',
        slotsNeeded: 1,
      },
    });
    const response = await testDb.response.create({
      data: { lotId: lot.id, bloggerId, message: 'ok', status: 'disputed' },
    });
    const dispute = await testDb.dispute.create({
      data: {
        lotId: lot.id,
        responseId: response.id,
        raisedById: companyUserId,
        againstId: bloggerUserId,
        reason: 'not_delivered',
        description: 'test',
        status: 'open',
      },
    });
    return { lot, response, dispute };
  }

  it('favor_company → Response.status=accepted, Lot.status=awaiting_decision, флаг=true', async () => {
    const company = await companyClient(852001001);
    const blogger = await bloggerClient(853001001);
    const { lot, response, dispute } = await createDisputedSetup(
      company.companyId, blogger.bloggerId, company.userId, blogger.userId,
    );

    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const adminAuth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });

    const res = await adminApp.inject({
      method: 'POST',
      url: `/admin/disputes/${dispute.id}/resolve`,
      headers: bearer(adminAuth.json().token),
      payload: { resolution: 'favor_company' },
    });
    expect(res.statusCode).toBe(200);

    const dbLot = await testDb.lot.findUnique({ where: { id: lot.id } });
    const dbResponse = await testDb.response.findUnique({ where: { id: response.id } });
    const dbDispute = await testDb.dispute.findFirst({ where: { id: dispute.id } });
    // favor_company: Response остаётся accepted, лот → awaiting_decision, флаг=true.
    expect(dbResponse?.status).toBe('accepted');
    expect(dbLot?.status).toBe('awaiting_decision');
    expect(dbDispute?.awaitingCompanyDecision).toBe(true);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('favor_company, но остался 1 accepted слот → лот остаётся in_progress', async () => {
    const company = await companyClient(852002001);
    const blogger1 = await bloggerClient(853002001);
    const blogger2 = await bloggerClient(853002002);

    // Лот с 2 слотами: один disputed, другой accepted.
    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Двухслотовый',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 200_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'in_progress',
        slotsNeeded: 2,
      },
    });
    const r1 = await testDb.response.create({
      data: { lotId: lot.id, bloggerId: blogger1.bloggerId, message: 'ok', status: 'disputed' },
    });
    await testDb.response.create({
      data: { lotId: lot.id, bloggerId: blogger2.bloggerId, message: 'ok', status: 'accepted' },
    });
    const dispute = await testDb.dispute.create({
      data: {
        lotId: lot.id,
        responseId: r1.id,
        raisedById: company.userId,
        againstId: blogger1.userId,
        reason: 'not_delivered',
        description: 'test',
        status: 'open',
      },
    });

    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const adminAuth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });

    await adminApp.inject({
      method: 'POST',
      url: `/admin/disputes/${dispute.id}/resolve`,
      headers: bearer(adminAuth.json().token),
      payload: { resolution: 'favor_company' },
    });

    const dbLot = await testDb.lot.findUnique({ where: { id: lot.id } });
    const dbR1 = await testDb.response.findUnique({ where: { id: r1.id } });
    // disputed → accepted после favor_company; лот → awaiting_decision (ждёт решения компании).
    expect(dbR1?.status).toBe('accepted');
    expect(dbLot?.status).toBe('awaiting_decision');

    await adminApp.close();
    await company.app.close();
    await blogger1.app.close();
    await blogger2.app.close();
  });

  it('favor_blogger → лот остаётся in_progress, слот занят (acceptedCount=1)', async () => {
    const company = await companyClient(852003001);
    const blogger = await bloggerClient(853003001);
    const { lot, dispute } = await createDisputedSetup(
      company.companyId, blogger.bloggerId, company.userId, blogger.userId,
    );

    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const adminAuth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });

    await adminApp.inject({
      method: 'POST',
      url: `/admin/disputes/${dispute.id}/resolve`,
      headers: bearer(adminAuth.json().token),
      payload: { resolution: 'favor_blogger' },
    });

    const dbLot = await testDb.lot.findUnique({ where: { id: lot.id } });
    expect(dbLot?.status).toBe('in_progress');

    // GET /lots/:id → слот занят (accepted).
    const getRes = await company.app.inject({
      method: 'GET',
      url: `/lots/${lot.id}`,
      headers: bearer(company.token),
    });
    expect(getRes.json().lot.acceptedCount).toBe(1);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('partial → лот остаётся in_progress, слот занят (acceptedCount=1)', async () => {
    const company = await companyClient(852004001);
    const blogger = await bloggerClient(853004001);
    const { lot, dispute } = await createDisputedSetup(
      company.companyId, blogger.bloggerId, company.userId, blogger.userId,
    );

    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const adminAuth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });

    await adminApp.inject({
      method: 'POST',
      url: `/admin/disputes/${dispute.id}/resolve`,
      headers: bearer(adminAuth.json().token),
      payload: { resolution: 'partial', note: 'Компромисс' },
    });

    const dbLot = await testDb.lot.findUnique({ where: { id: lot.id } });
    expect(dbLot?.status).toBe('in_progress');

    const getRes = await company.app.inject({
      method: 'GET',
      url: `/lots/${lot.id}`,
      headers: bearer(company.token),
    });
    expect(getRes.json().lot.acceptedCount).toBe(1);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });
});

// ─── reject-after-dispute ────────────────────────────────────────────────────

describe('POST /lots/:id/responses/:responseId/reject-after-dispute', () => {
  // Хелпер: лот awaiting_decision + accepted-отклик с resolved favor_company спором + флаг=true.
  async function createFavorCompanySetup(companyId: string, bloggerId: string, companyUserId: string, bloggerUserId: string) {
    const lot = await testDb.lot.create({
      data: {
        companyId,
        title: 'Лот после спора',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'awaiting_decision',
        slotsNeeded: 1,
      },
    });
    const response = await testDb.response.create({
      data: { lotId: lot.id, bloggerId, message: 'ok', status: 'accepted' },
    });
    await testDb.dispute.create({
      data: {
        lotId: lot.id,
        responseId: response.id,
        raisedById: companyUserId,
        againstId: bloggerUserId,
        reason: 'not_delivered',
        description: 'test',
        status: 'resolved',
        resolution: 'favor_company',
        resolvedAt: new Date(),
        awaitingCompanyDecision: true,
      },
    });
    return { lot, response };
  }

  it('единственный слот: компания отклоняет → response rejected, лот active', async () => {
    const company = await companyClient(854001001);
    const blogger = await bloggerClient(855001001);
    const { lot, response } = await createFavorCompanySetup(
      company.companyId, blogger.bloggerId, company.userId, blogger.userId,
    );

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses/${response.id}/reject-after-dispute`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().response.status).toBe('rejected');

    const dbResponse = await testDb.response.findUnique({ where: { id: response.id } });
    const dbLot = await testDb.lot.findUnique({ where: { id: lot.id } });
    expect(dbResponse?.status).toBe('rejected');
    expect(dbLot?.status).toBe('active');

    await company.app.close();
    await blogger.app.close();
  });

  it('гард: accepted без resolved favor_company-спора → 409', async () => {
    const company = await companyClient(854002001);
    const blogger = await bloggerClient(855002001);
    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Лот без спора',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'in_progress',
        slotsNeeded: 1,
      },
    });
    const response = await testDb.response.create({
      data: { lotId: lot.id, bloggerId: blogger.bloggerId, message: 'ok', status: 'accepted' },
    });

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses/${response.id}/reject-after-dispute`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/favor_company/);

    await company.app.close();
    await blogger.app.close();
  });

  it('не-владелец → 403', async () => {
    const owner = await companyClient(854003001);
    const other = await companyClient(854003002);
    const blogger = await bloggerClient(855003001);
    const { lot, response } = await createFavorCompanySetup(
      owner.companyId, blogger.bloggerId, owner.userId, blogger.userId,
    );

    const res = await other.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses/${response.id}/reject-after-dispute`,
      headers: bearer(other.token),
    });
    expect(res.statusCode).toBe(403);

    await owner.app.close();
    await other.app.close();
    await blogger.app.close();
  });

  it('2 слота: отклоняем один → лот остаётся in_progress (1 занятый слот)', async () => {
    const company = await companyClient(854004001);
    const blogger1 = await bloggerClient(855004001);
    const blogger2 = await bloggerClient(855004002);

    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Двухслотовый после спора',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 200_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'awaiting_decision',
        slotsNeeded: 2,
      },
    });
    const r1 = await testDb.response.create({
      data: { lotId: lot.id, bloggerId: blogger1.bloggerId, message: 'ok', status: 'accepted' },
    });
    await testDb.response.create({
      data: { lotId: lot.id, bloggerId: blogger2.bloggerId, message: 'ok', status: 'accepted' },
    });
    await testDb.dispute.create({
      data: {
        lotId: lot.id,
        responseId: r1.id,
        raisedById: company.userId,
        againstId: blogger1.userId,
        reason: 'not_delivered',
        description: 'test',
        status: 'resolved',
        resolution: 'favor_company',
        resolvedAt: new Date(),
        awaitingCompanyDecision: true,
      },
    });

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses/${r1.id}/reject-after-dispute`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);

    const dbLot = await testDb.lot.findUnique({ where: { id: lot.id } });
    // 1 занятый слот остался → in_progress.
    expect(dbLot?.status).toBe('in_progress');

    await company.app.close();
    await blogger1.app.close();
    await blogger2.app.close();
  });
});

// ─── awaiting_decision: гейты и решения компании ─────────────────────────────

describe('Гейты awaiting_decision: accept и complete блокируются', () => {
  async function createAwaitingDecisionSetup(companyId: string, bloggerId: string, companyUserId: string, bloggerUserId: string) {
    const lot = await testDb.lot.create({
      data: {
        companyId,
        title: 'Ожидание решения',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'awaiting_decision',
        slotsNeeded: 2,
      },
    });
    const response = await testDb.response.create({
      data: { lotId: lot.id, bloggerId, message: 'ok', status: 'accepted' },
    });
    await testDb.dispute.create({
      data: {
        lotId: lot.id,
        responseId: response.id,
        raisedById: companyUserId,
        againstId: bloggerUserId,
        reason: 'not_delivered',
        description: 'test',
        status: 'resolved',
        resolution: 'favor_company',
        resolvedAt: new Date(),
        awaitingCompanyDecision: true,
      },
    });
    return { lot, response };
  }

  it('accept другого отклика пока awaiting_decision → 409', async () => {
    const company = await companyClient(860001001);
    const blogger1 = await bloggerClient(861001001);
    const blogger2 = await bloggerClient(861001002);
    const { lot } = await createAwaitingDecisionSetup(company.companyId, blogger1.bloggerId, company.userId, blogger1.userId);

    const r2 = await testDb.response.create({
      data: { lotId: lot.id, bloggerId: blogger2.bloggerId, message: 'хочу', status: 'pending' },
    });

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses/${r2.id}/accept`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/спорн|decision/i);

    await company.app.close();
    await blogger1.app.close();
    await blogger2.app.close();
  });

  it('complete пока awaiting_decision → 409', async () => {
    const company = await companyClient(860002001);
    const blogger = await bloggerClient(861002001);
    const { lot } = await createAwaitingDecisionSetup(company.companyId, blogger.bloggerId, company.userId, blogger.userId);

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/complete`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/спорн|decision/i);

    await company.app.close();
    await blogger.app.close();
  });
});

describe('continue-after-dispute', () => {
  async function createAwaitingDecisionSetup2(companyId: string, bloggerId: string, companyUserId: string, bloggerUserId: string) {
    const lot = await testDb.lot.create({
      data: {
        companyId,
        title: 'Лот ожидание',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'awaiting_decision',
        slotsNeeded: 1,
      },
    });
    const response = await testDb.response.create({
      data: { lotId: lot.id, bloggerId, message: 'ok', status: 'accepted' },
    });
    const dispute = await testDb.dispute.create({
      data: {
        lotId: lot.id,
        responseId: response.id,
        raisedById: companyUserId,
        againstId: bloggerUserId,
        reason: 'not_delivered',
        description: 'test',
        status: 'resolved',
        resolution: 'favor_company',
        resolvedAt: new Date(),
        awaitingCompanyDecision: true,
      },
    });
    return { lot, response, dispute };
  }

  it('continue → лот in_progress, флаг=false, response остаётся accepted', async () => {
    const company = await companyClient(862001001);
    const blogger = await bloggerClient(863001001);
    const { lot, response, dispute } = await createAwaitingDecisionSetup2(
      company.companyId, blogger.bloggerId, company.userId, blogger.userId,
    );

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses/${response.id}/continue-after-dispute`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.status).toBe('in_progress');

    const dbLot = await testDb.lot.findUnique({ where: { id: lot.id } });
    const dbResponse = await testDb.response.findUnique({ where: { id: response.id } });
    const dbDispute = await testDb.dispute.findFirst({ where: { id: dispute.id } });
    expect(dbLot?.status).toBe('in_progress');
    expect(dbResponse?.status).toBe('accepted');
    expect(dbDispute?.awaitingCompanyDecision).toBe(false);

    await company.app.close();
    await blogger.app.close();
  });

  it('reject-after-dispute после continue → 409 (окно закрыто)', async () => {
    const company = await companyClient(862002001);
    const blogger = await bloggerClient(863002001);
    const { lot, response } = await createAwaitingDecisionSetup2(
      company.companyId, blogger.bloggerId, company.userId, blogger.userId,
    );

    await company.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses/${response.id}/continue-after-dispute`,
      headers: bearer(company.token),
    });

    const res = await company.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses/${response.id}/reject-after-dispute`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/closed/i);

    await company.app.close();
    await blogger.app.close();
  });

  it('не-владелец → 403', async () => {
    const owner = await companyClient(862003001);
    const other = await companyClient(862003002);
    const blogger = await bloggerClient(863003001);
    const { lot, response } = await createAwaitingDecisionSetup2(
      owner.companyId, blogger.bloggerId, owner.userId, blogger.userId,
    );

    const res = await other.app.inject({
      method: 'POST',
      url: `/lots/${lot.id}/responses/${response.id}/continue-after-dispute`,
      headers: bearer(other.token),
    });
    expect(res.statusCode).toBe(403);

    await owner.app.close();
    await other.app.close();
    await blogger.app.close();
  });
});

describe('favor_blogger/partial — регресс: лот остаётся in_progress, флаг не ставится', () => {
  async function createDisputedSetupForRegress(companyId: string, bloggerId: string, companyUserId: string, bloggerUserId: string) {
    const lot = await testDb.lot.create({
      data: {
        companyId,
        title: 'Регресс',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'in_progress',
        slotsNeeded: 1,
      },
    });
    const response = await testDb.response.create({
      data: { lotId: lot.id, bloggerId, message: 'ok', status: 'disputed' },
    });
    const dispute = await testDb.dispute.create({
      data: {
        lotId: lot.id,
        responseId: response.id,
        raisedById: companyUserId,
        againstId: bloggerUserId,
        reason: 'not_delivered',
        description: 'test',
        status: 'open',
      },
    });
    return { lot, dispute };
  }

  it('favor_blogger → лот in_progress, awaitingCompanyDecision=false', async () => {
    const company = await companyClient(864001001);
    const blogger = await bloggerClient(865001001);
    const { lot, dispute } = await createDisputedSetupForRegress(
      company.companyId, blogger.bloggerId, company.userId, blogger.userId,
    );

    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const adminAuth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });

    await adminApp.inject({
      method: 'POST',
      url: `/admin/disputes/${dispute.id}/resolve`,
      headers: bearer(adminAuth.json().token),
      payload: { resolution: 'favor_blogger' },
    });

    const dbLot = await testDb.lot.findUnique({ where: { id: lot.id } });
    const dbDispute = await testDb.dispute.findFirst({ where: { id: dispute.id } });
    expect(dbLot?.status).toBe('in_progress');
    expect(dbDispute?.awaitingCompanyDecision).toBe(false);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });

  it('partial → лот in_progress, awaitingCompanyDecision=false', async () => {
    const company = await companyClient(864002001);
    const blogger = await bloggerClient(865002001);
    const { lot, dispute } = await createDisputedSetupForRegress(
      company.companyId, blogger.bloggerId, company.userId, blogger.userId,
    );

    const adminApp = buildApp({ db: testDb });
    await adminApp.ready();
    const adminAuth = await adminApp.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });

    await adminApp.inject({
      method: 'POST',
      url: `/admin/disputes/${dispute.id}/resolve`,
      headers: bearer(adminAuth.json().token),
      payload: { resolution: 'partial', note: 'Компромисс' },
    });

    const dbLot = await testDb.lot.findUnique({ where: { id: lot.id } });
    const dbDispute = await testDb.dispute.findFirst({ where: { id: dispute.id } });
    expect(dbLot?.status).toBe('in_progress');
    expect(dbDispute?.awaitingCompanyDecision).toBe(false);

    await adminApp.close();
    await company.app.close();
    await blogger.app.close();
  });
});

describe('awaitingCompanyDecision в GET /lots/:id/responses', () => {
  it('отклик с awaitingCompanyDecision=true отдаётся в DTO владельца', async () => {
    const company = await companyClient(866001001);
    const blogger = await bloggerClient(867001001);
    const lot = await testDb.lot.create({
      data: {
        companyId: company.companyId,
        title: 'Лот флаг',
        description: '—',
        categories: ['Бьюти'],
        platforms: ['Instagram'],
        budget: 100_000,
        deadline: new Date(Date.now() + 7 * 86_400_000),
        requirements: [],
        status: 'awaiting_decision',
        slotsNeeded: 1,
      },
    });
    const response = await testDb.response.create({
      data: { lotId: lot.id, bloggerId: blogger.bloggerId, message: 'ok', status: 'accepted' },
    });
    await testDb.dispute.create({
      data: {
        lotId: lot.id,
        responseId: response.id,
        raisedById: company.userId,
        againstId: blogger.userId,
        reason: 'not_delivered',
        description: 'test',
        status: 'resolved',
        resolution: 'favor_company',
        resolvedAt: new Date(),
        awaitingCompanyDecision: true,
      },
    });

    const res = await company.app.inject({
      method: 'GET',
      url: `/lots/${lot.id}/responses`,
      headers: bearer(company.token),
    });
    expect(res.statusCode).toBe(200);
    const r = res.json().responses.find((x: { id: string }) => x.id === response.id);
    expect(r?.awaitingCompanyDecision).toBe(true);

    await company.app.close();
    await blogger.app.close();
  });
});
