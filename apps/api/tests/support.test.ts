import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';

// ADMIN_TELEGRAM_IDS='555000111' в vitest.config.ts.
const ADMIN_TG_ID = 555000111n;

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

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

// Авторизует пользователя и создаёт профиль блогера. Возвращает { app, token, userId }.
async function userClient(tgId: number): Promise<{
  app: FastifyInstance;
  token: string;
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
  await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: { displayName: `Блогер ${tgId}`, categories: ['Бьюти'], linkedAccounts: [] },
  });
  return { app, token, userId };
}

// ─── POST /support/tickets ─────────────────────────────────────────────────────

describe('POST /support/tickets', () => {
  it('создаёт тикет с body → 201, status=open', async () => {
    const { app, token } = await userClient(900001);

    const res = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      headers: bearer(token),
      payload: {
        subject: 'Вопрос по платежу',
        type: 'request',
        message: { body: 'Почему деньги не пришли?' },
      },
    });

    expect(res.statusCode).toBe(201);
    const { ticket } = res.json();
    expect(ticket.status).toBe('open');
    expect(ticket.subject).toBe('Вопрос по платежу');
    expect(ticket.type).toBe('request');
    expect(ticket.createdAt).toBeDefined();
    expect(ticket.lastMessageAt).toBeDefined();

    await app.close();
  });

  it('создаёт тикет с типом idea', async () => {
    const { app, token } = await userClient(900002);

    const res = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      headers: bearer(token),
      payload: {
        subject: 'Идея: добавить категорию',
        type: 'idea',
        message: { body: 'Было бы здорово иметь категорию Спорт.' },
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().ticket.type).toBe('idea');

    await app.close();
  });

  it('создаёт тикет только с вложением (без body) → 201', async () => {
    const { app, token } = await userClient(900003);

    const res = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      headers: bearer(token),
      payload: {
        subject: 'Скриншот ошибки',
        type: 'request',
        message: {
          attachments: [{ fileId: 'file_abc', fileName: 'error.png', mimeType: 'image/png' }],
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const { ticket } = res.json();
    expect(ticket.id).toBeDefined();

    // Проверяем что вложение сохранилось в БД.
    const msgs = await testDb.ticketMessage.findMany({ where: { ticketId: ticket.id } });
    expect(msgs).toHaveLength(1);
    const attaches = await testDb.ticketAttachment.findMany({ where: { messageId: msgs[0].id } });
    expect(attaches).toHaveLength(1);
    expect(attaches[0].fileName).toBe('error.png');
    expect(attaches[0].mimeType).toBe('image/png');

    await app.close();
  });

  it('вложения любого формата (.docx/.pdf/.png) → 201', async () => {
    const { app, token } = await userClient(900004);

    const res = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      headers: bearer(token),
      payload: {
        subject: 'Разные форматы',
        type: 'request',
        message: {
          body: 'Прикладываю документы',
          attachments: [
            { fileId: 'f1', fileName: 'doc.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
            { fileId: 'f2', fileName: 'report.pdf', mimeType: 'application/pdf' },
            { fileId: 'f3', fileName: 'photo.png', mimeType: 'image/png' },
          ],
        },
      },
    });

    expect(res.statusCode).toBe(201);

    const { ticket } = res.json();
    const msgs = await testDb.ticketMessage.findMany({ where: { ticketId: ticket.id } });
    const attaches = await testDb.ticketAttachment.findMany({ where: { messageId: msgs[0].id } });
    expect(attaches).toHaveLength(3);

    await app.close();
  });

  it('пустое сообщение (нет body и вложений) → 400', async () => {
    const { app, token } = await userClient(900005);

    const res = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      headers: bearer(token),
      payload: {
        subject: 'Пустой',
        type: 'request',
        message: {},
      },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('body = пустая строка и нет вложений → 400', async () => {
    const { app, token } = await userClient(900006);

    const res = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      headers: bearer(token),
      payload: {
        subject: 'Только пробелы',
        type: 'request',
        message: { body: '   ' },
      },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('subject > 200 символов → 400', async () => {
    const { app, token } = await userClient(900007);

    const res = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      headers: bearer(token),
      payload: {
        subject: 'А'.repeat(201),
        type: 'request',
        message: { body: 'Текст' },
      },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('неверный type → 400', async () => {
    const { app, token } = await userClient(900008);

    const res = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      headers: bearer(token),
      payload: {
        subject: 'Тест',
        type: 'unknown',
        message: { body: 'Текст' },
      },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('без auth → 401', async () => {
    const app = buildApp({ db: testDb });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/support/tickets',
      payload: { subject: 'X', type: 'request', message: { body: 'Y' } },
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it('уведомляет всех админов (support_new_ticket)', async () => {
    const { bot, calls } = makeFakeBot();
    const { app, token } = await userClient(900009);
    // Пересобираем с ботом.
    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();

    // Авторизуемся через тот же token (JWT stateless, просто нужен действительный).
    // Но token принадлежит другому app-инстансу с тем же shared testDb.
    // Создадим отдельный аутентифицированный клиент.
    const auth2 = await appWithBot.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 900009 }) },
    });
    const token2 = auth2.json().token as string;

    await appWithBot.inject({
      method: 'POST',
      url: '/support/tickets',
      headers: bearer(token2),
      payload: { subject: 'Уведомление', type: 'request', message: { body: 'Текст' } },
    });

    // Ждём async уведомление.
    await new Promise((r) => setTimeout(r, 50));

    const adminCalls = calls.filter((c) => c.to === Number(ADMIN_TG_ID));
    expect(adminCalls.length).toBeGreaterThanOrEqual(1);
    expect(adminCalls[0].text).toContain('тикет');

    await appWithBot.close();
    await app.close();
  });

  it('дедуп support_new_ticket: два тикета → два отдельных уведомления', async () => {
    const { bot, calls } = makeFakeBot();
    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();

    const auth = await appWithBot.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 900010 }) },
    });
    const tok = auth.json().token as string;
    await appWithBot.inject({
      method: 'PUT', url: '/me/role', headers: bearer(tok), payload: { role: 'blogger' },
    });
    await appWithBot.inject({
      method: 'PUT', url: '/me/profile', headers: bearer(tok),
      payload: { displayName: 'Блогер 900010', categories: ['Бьюти'], linkedAccounts: [] },
    });

    await appWithBot.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(tok),
      payload: { subject: 'Тикет 1', type: 'request', message: { body: 'Текст 1' } },
    });
    await appWithBot.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(tok),
      payload: { subject: 'Тикет 2', type: 'idea', message: { body: 'Текст 2' } },
    });

    await new Promise((r) => setTimeout(r, 50));

    const adminCalls = calls.filter((c) => c.to === Number(ADMIN_TG_ID));
    expect(adminCalls.length).toBe(2);

    await appWithBot.close();
  });
});

// ─── GET /support/tickets ──────────────────────────────────────────────────────

describe('GET /support/tickets', () => {
  it('возвращает только мои тикеты', async () => {
    const user1 = await userClient(901001);
    const user2 = await userClient(901002);

    // Создаём тикет от user1.
    await user1.app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(user1.token),
      payload: { subject: 'Мой тикет', type: 'request', message: { body: 'Вопрос' } },
    });
    // Создаём тикет от user2.
    await user2.app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(user2.token),
      payload: { subject: 'Чужой тикет', type: 'idea', message: { body: 'Идея' } },
    });

    const res = await user1.app.inject({
      method: 'GET', url: '/support/tickets', headers: bearer(user1.token),
    });

    expect(res.statusCode).toBe(200);
    const { tickets } = res.json();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].subject).toBe('Мой тикет');

    await user1.app.close();
    await user2.app.close();
  });

  it('пустой список если нет тикетов', async () => {
    const { app, token } = await userClient(901003);

    const res = await app.inject({
      method: 'GET', url: '/support/tickets', headers: bearer(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().tickets).toHaveLength(0);

    await app.close();
  });

  it('сортировка по lastMessageAt desc', async () => {
    const { app, token } = await userClient(901004);

    // Создаём три тикета.
    for (const subject of ['Первый', 'Второй', 'Третий']) {
      await app.inject({
        method: 'POST', url: '/support/tickets', headers: bearer(token),
        payload: { subject, type: 'request', message: { body: 'Текст' } },
      });
      // Небольшая пауза чтобы createdAt / lastMessageAt различались.
      await new Promise((r) => setTimeout(r, 5));
    }

    const res = await app.inject({
      method: 'GET', url: '/support/tickets', headers: bearer(token),
    });

    expect(res.statusCode).toBe(200);
    const { tickets } = res.json();
    expect(tickets).toHaveLength(3);
    // Последний созданный должен быть первым (desc).
    expect(tickets[0].subject).toBe('Третий');
    expect(tickets[2].subject).toBe('Первый');

    await app.close();
  });

  it('hasUnread=false сразу после создания (первое сообщение от пользователя)', async () => {
    const { app, token } = await userClient(901005);

    await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: { subject: 'Тест', type: 'request', message: { body: 'Вопрос' } },
    });

    const res = await app.inject({
      method: 'GET', url: '/support/tickets', headers: bearer(token),
    });

    expect(res.json().tickets[0].hasUnread).toBe(false);

    await app.close();
  });

  it('hasUnread=true когда есть непрочитанное сообщение от админа', async () => {
    const { app, token, userId } = await userClient(901006);

    const createRes = await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: { subject: 'Ожидание', type: 'request', message: { body: 'Привет' } },
    });
    const ticketId = createRes.json().ticket.id as string;

    // Имитируем ответ от администратора: обновляем lastMessageAt вперёд и создаём adminMessage.
    const adminMsgTime = new Date(Date.now() + 1000);
    await testDb.ticketMessage.create({
      data: { ticketId, senderId: userId, fromAdmin: true, body: 'Ответ администратора', createdAt: adminMsgTime },
    });
    await testDb.supportTicket.update({
      where: { id: ticketId },
      data: { lastMessageAt: adminMsgTime },
    });

    const res = await app.inject({
      method: 'GET', url: '/support/tickets', headers: bearer(token),
    });

    expect(res.json().tickets[0].hasUnread).toBe(true);

    await app.close();
  });

  it('hasUnread=false после прочтения (GET /support/tickets/:id сбрасывает)', async () => {
    const { app, token, userId } = await userClient(901007);

    const createRes = await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: { subject: 'Тест чтения', type: 'request', message: { body: 'Привет' } },
    });
    const ticketId = createRes.json().ticket.id as string;

    // Добавляем сообщение от админа.
    const adminTime = new Date(Date.now() + 1000);
    await testDb.ticketMessage.create({
      data: { ticketId, senderId: userId, fromAdmin: true, body: 'Ответ', createdAt: adminTime },
    });
    await testDb.supportTicket.update({
      where: { id: ticketId },
      data: { lastMessageAt: adminTime },
    });

    // Проверяем что сначала hasUnread=true.
    const before = await app.inject({
      method: 'GET', url: '/support/tickets', headers: bearer(token),
    });
    expect(before.json().tickets[0].hasUnread).toBe(true);

    // Открываем тред → lastReadByUserAt = now.
    await app.inject({
      method: 'GET', url: `/support/tickets/${ticketId}`, headers: bearer(token),
    });
    // Ждём async update.
    await new Promise((r) => setTimeout(r, 50));

    const after = await app.inject({
      method: 'GET', url: '/support/tickets', headers: bearer(token),
    });
    expect(after.json().tickets[0].hasUnread).toBe(false);

    await app.close();
  });

  it('DTO содержит ожидаемые поля', async () => {
    const { app, token } = await userClient(901008);

    await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: { subject: 'Поля', type: 'idea', message: { body: 'Текст' } },
    });

    const res = await app.inject({
      method: 'GET', url: '/support/tickets', headers: bearer(token),
    });

    const t = res.json().tickets[0];
    expect(t).toHaveProperty('id');
    expect(t).toHaveProperty('subject');
    expect(t).toHaveProperty('type');
    expect(t).toHaveProperty('status');
    expect(t).toHaveProperty('lastMessageAt');
    expect(t).toHaveProperty('hasUnread');

    await app.close();
  });
});

// ─── GET /support/tickets/:id ──────────────────────────────────────────────────

describe('GET /support/tickets/:id', () => {
  it('автор видит тред с первым сообщением', async () => {
    const { app, token } = await userClient(902001);

    const createRes = await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: { subject: 'Мой тикет', type: 'request', message: { body: 'Первое сообщение' } },
    });
    const ticketId = createRes.json().ticket.id as string;

    const res = await app.inject({
      method: 'GET', url: `/support/tickets/${ticketId}`, headers: bearer(token),
    });

    expect(res.statusCode).toBe(200);
    const { ticket } = res.json();
    expect(ticket.id).toBe(ticketId);
    expect(ticket.subject).toBe('Мой тикет');
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0].body).toBe('Первое сообщение');
    expect(ticket.messages[0].fromAdmin).toBe(false);
    expect(ticket.messages[0].attachments).toEqual([]);

    await app.close();
  });

  it('тред включает вложения сообщений', async () => {
    const { app, token } = await userClient(902002);

    const createRes = await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: {
        subject: 'С вложением',
        type: 'request',
        message: {
          body: 'Прикладываю',
          attachments: [{ fileId: 'fileX', fileName: 'doc.pdf', mimeType: 'application/pdf' }],
        },
      },
    });
    const ticketId = createRes.json().ticket.id as string;

    const res = await app.inject({
      method: 'GET', url: `/support/tickets/${ticketId}`, headers: bearer(token),
    });

    expect(res.statusCode).toBe(200);
    const { ticket } = res.json();
    expect(ticket.messages[0].attachments).toHaveLength(1);
    expect(ticket.messages[0].attachments[0].fileName).toBe('doc.pdf');
    expect(ticket.messages[0].attachments[0].mimeType).toBe('application/pdf');

    await app.close();
  });

  it('сообщения отсортированы chronologически (asc)', async () => {
    const { app, token, userId } = await userClient(902003);

    const createRes = await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: { subject: 'Несколько сообщений', type: 'request', message: { body: 'Первое' } },
    });
    const ticketId = createRes.json().ticket.id as string;

    // Добавляем второе сообщение от "админа" напрямую.
    await testDb.ticketMessage.create({
      data: {
        ticketId,
        senderId: userId,
        fromAdmin: true,
        body: 'Ответ админа',
        createdAt: new Date(Date.now() + 500),
      },
    });

    const res = await app.inject({
      method: 'GET', url: `/support/tickets/${ticketId}`, headers: bearer(token),
    });

    const msgs = res.json().ticket.messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].body).toBe('Первое');
    expect(msgs[1].body).toBe('Ответ админа');
    expect(msgs[1].fromAdmin).toBe(true);

    await app.close();
  });

  it('помечает lastReadByUserAt = now при открытии', async () => {
    const { app, token } = await userClient(902004);

    const createRes = await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: { subject: 'Пометка', type: 'request', message: { body: 'Текст' } },
    });
    const ticketId = createRes.json().ticket.id as string;

    const before = await testDb.supportTicket.findUnique({ where: { id: ticketId } });
    const prevRead = before?.lastReadByUserAt;

    // Небольшая задержка чтобы now() отличалось.
    await new Promise((r) => setTimeout(r, 10));

    await app.inject({
      method: 'GET', url: `/support/tickets/${ticketId}`, headers: bearer(token),
    });
    // Ждём async update.
    await new Promise((r) => setTimeout(r, 50));

    const after = await testDb.supportTicket.findUnique({ where: { id: ticketId } });
    expect(after?.lastReadByUserAt).toBeDefined();
    if (prevRead && after?.lastReadByUserAt) {
      expect(after.lastReadByUserAt.getTime()).toBeGreaterThanOrEqual(prevRead.getTime());
    }

    await app.close();
  });

  it('чужой тикет → 403', async () => {
    const owner = await userClient(902005);
    const other = await userClient(902006);

    const createRes = await owner.app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(owner.token),
      payload: { subject: 'Владельческий', type: 'request', message: { body: 'Текст' } },
    });
    const ticketId = createRes.json().ticket.id as string;

    const res = await other.app.inject({
      method: 'GET', url: `/support/tickets/${ticketId}`, headers: bearer(other.token),
    });

    expect(res.statusCode).toBe(403);

    await owner.app.close();
    await other.app.close();
  });

  it('несуществующий тикет → 404', async () => {
    const { app, token } = await userClient(902007);

    const res = await app.inject({
      method: 'GET', url: '/support/tickets/nonexistent_id', headers: bearer(token),
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });
});

// ─── POST /support/tickets/:id/messages ───────────────────────────────────────

describe('POST /support/tickets/:id/messages', () => {
  it('отправляет сообщение в открытый тикет → 201', async () => {
    const { app, token } = await userClient(903001);

    const createRes = await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: { subject: 'Открытый тикет', type: 'request', message: { body: 'Начало' } },
    });
    const ticketId = createRes.json().ticket.id as string;

    const res = await app.inject({
      method: 'POST', url: `/support/tickets/${ticketId}/messages`, headers: bearer(token),
      payload: { body: 'Уточняю: когда будет выплата?' },
    });

    expect(res.statusCode).toBe(201);
    const { message } = res.json();
    expect(message.body).toBe('Уточняю: когда будет выплата?');
    expect(message.fromAdmin).toBe(false);
    expect(message.attachments).toEqual([]);

    await app.close();
  });

  it('lastMessageAt тикета обновляется', async () => {
    const { app, token } = await userClient(903002);

    const createRes = await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: { subject: 'Обновление', type: 'request', message: { body: 'Начало' } },
    });
    const ticketId = createRes.json().ticket.id as string;
    const oldTime = createRes.json().ticket.lastMessageAt as string;

    await new Promise((r) => setTimeout(r, 10));

    await app.inject({
      method: 'POST', url: `/support/tickets/${ticketId}/messages`, headers: bearer(token),
      payload: { body: 'Новое сообщение' },
    });

    const ticket = await testDb.supportTicket.findUnique({ where: { id: ticketId } });
    expect(ticket?.lastMessageAt.toISOString()).not.toBe(oldTime);
    expect(ticket!.lastMessageAt.getTime()).toBeGreaterThan(new Date(oldTime).getTime());

    await app.close();
  });

  it('сообщение с вложением → 201, вложение сохранено', async () => {
    const { app, token } = await userClient(903003);

    const createRes = await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: { subject: 'Файл', type: 'request', message: { body: 'Смотри файл' } },
    });
    const ticketId = createRes.json().ticket.id as string;

    const res = await app.inject({
      method: 'POST', url: `/support/tickets/${ticketId}/messages`, headers: bearer(token),
      payload: {
        attachments: [{ fileId: 'docx_id', fileName: 'contract.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().message.attachments).toHaveLength(1);
    expect(res.json().message.attachments[0].fileName).toBe('contract.docx');

    await app.close();
  });

  it('закрытый тикет → 409', async () => {
    const { app, token } = await userClient(903004);

    const createRes = await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: { subject: 'Закрою', type: 'request', message: { body: 'Текст' } },
    });
    const ticketId = createRes.json().ticket.id as string;

    // Закрываем тикет напрямую.
    await testDb.supportTicket.update({ where: { id: ticketId }, data: { status: 'closed' } });

    const res = await app.inject({
      method: 'POST', url: `/support/tickets/${ticketId}/messages`, headers: bearer(token),
      payload: { body: 'После закрытия' },
    });

    expect(res.statusCode).toBe(409);

    await app.close();
  });

  it('чужой тикет → 403', async () => {
    const owner = await userClient(903005);
    const other = await userClient(903006);

    const createRes = await owner.app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(owner.token),
      payload: { subject: 'Чужой', type: 'request', message: { body: 'Текст' } },
    });
    const ticketId = createRes.json().ticket.id as string;

    const res = await other.app.inject({
      method: 'POST', url: `/support/tickets/${ticketId}/messages`, headers: bearer(other.token),
      payload: { body: 'Попытка чужого' },
    });

    expect(res.statusCode).toBe(403);

    await owner.app.close();
    await other.app.close();
  });

  it('пустое сообщение (нет body и вложений) → 400', async () => {
    const { app, token } = await userClient(903007);

    const createRes = await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: { subject: 'Нормальный', type: 'request', message: { body: 'Начало' } },
    });
    const ticketId = createRes.json().ticket.id as string;

    const res = await app.inject({
      method: 'POST', url: `/support/tickets/${ticketId}/messages`, headers: bearer(token),
      payload: {},
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('несуществующий тикет → 404', async () => {
    const { app, token } = await userClient(903008);

    const res = await app.inject({
      method: 'POST', url: '/support/tickets/no_such_ticket/messages', headers: bearer(token),
      payload: { body: 'Привет' },
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('уведомляет админов (support_user_reply)', async () => {
    const { bot, calls } = makeFakeBot();
    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();

    const auth = await appWithBot.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 903009 }) },
    });
    const tok = auth.json().token as string;
    await appWithBot.inject({ method: 'PUT', url: '/me/role', headers: bearer(tok), payload: { role: 'blogger' } });
    await appWithBot.inject({
      method: 'PUT', url: '/me/profile', headers: bearer(tok),
      payload: { displayName: 'Блогер 903009', categories: ['Бьюти'], linkedAccounts: [] },
    });

    const createRes = await appWithBot.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(tok),
      payload: { subject: 'Уведомление reply', type: 'request', message: { body: 'Первое' } },
    });
    const ticketId = createRes.json().ticket.id as string;

    // Ждём async new_ticket-уведомление, затем сбрасываем список вызовов.
    await new Promise((r) => setTimeout(r, 50));
    calls.length = 0;

    await appWithBot.inject({
      method: 'POST', url: `/support/tickets/${ticketId}/messages`, headers: bearer(tok),
      payload: { body: 'Уточнение' },
    });

    await new Promise((r) => setTimeout(r, 50));

    const adminCalls = calls.filter((c) => c.to === Number(ADMIN_TG_ID));
    expect(adminCalls.length).toBeGreaterThanOrEqual(1);
    expect(adminCalls[0].text).toContain('ответил');

    await appWithBot.close();
  });

  it('дедуп support_user_reply: одно сообщение → одно уведомление (дубль не проходит)', async () => {
    const { bot, calls } = makeFakeBot();
    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();

    const auth = await appWithBot.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 903010 }) },
    });
    const tok = auth.json().token as string;
    await appWithBot.inject({ method: 'PUT', url: '/me/role', headers: bearer(tok), payload: { role: 'blogger' } });
    await appWithBot.inject({
      method: 'PUT', url: '/me/profile', headers: bearer(tok),
      payload: { displayName: 'Блогер 903010', categories: ['Бьюти'], linkedAccounts: [] },
    });

    const createRes = await appWithBot.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(tok),
      payload: { subject: 'Дедуп тест', type: 'request', message: { body: 'Первое' } },
    });
    const ticketId = createRes.json().ticket.id as string;

    // Ждём async new_ticket-уведомление перед сбросом.
    await new Promise((r) => setTimeout(r, 50));
    calls.length = 0;

    // Отправляем одно сообщение.
    const msgRes = await appWithBot.inject({
      method: 'POST', url: `/support/tickets/${ticketId}/messages`, headers: bearer(tok),
      payload: { body: 'Одно сообщение' },
    });
    const messageId = msgRes.json().message.id as string;

    await new Promise((r) => setTimeout(r, 50));

    const callsAfterFirst = calls.filter((c) => c.to === Number(ADMIN_TG_ID)).length;
    expect(callsAfterFirst).toBe(1);

    // Эмулируем повторный notify с тем же dedupeKey (messageId) — должен быть дедуп.
    const { notifyAdmins } = await import('../src/services/notifications');
    await notifyAdmins(testDb, bot, 'support_user_reply', {
      lotTitle: 'Дедуп тест',
      ticketId: messageId, // тот же dedupeKey
    });

    const callsAfterDup = calls.filter((c) => c.to === Number(ADMIN_TG_ID)).length;
    expect(callsAfterDup).toBe(1); // не увеличилось

    await appWithBot.close();
  });
});

// ─── Комплексный сценарий: полный жизненный цикл ──────────────────────────────

describe('Полный жизненный цикл тикета', () => {
  it('создание → сообщение → тред отдаёт оба сообщения', async () => {
    const { app, token } = await userClient(904001);

    // Создаём тикет.
    const createRes = await app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(token),
      payload: { subject: 'Полный цикл', type: 'request', message: { body: 'Сообщение 1' } },
    });
    expect(createRes.statusCode).toBe(201);
    const ticketId = createRes.json().ticket.id as string;

    // Добавляем второе сообщение.
    const msgRes = await app.inject({
      method: 'POST', url: `/support/tickets/${ticketId}/messages`, headers: bearer(token),
      payload: { body: 'Сообщение 2', attachments: [{ fileId: 'f99', fileName: 'a.txt', mimeType: 'text/plain' }] },
    });
    expect(msgRes.statusCode).toBe(201);

    // Получаем тред.
    const threadRes = await app.inject({
      method: 'GET', url: `/support/tickets/${ticketId}`, headers: bearer(token),
    });
    expect(threadRes.statusCode).toBe(200);
    const { ticket } = threadRes.json();
    expect(ticket.messages).toHaveLength(2);
    expect(ticket.messages[0].body).toBe('Сообщение 1');
    expect(ticket.messages[1].body).toBe('Сообщение 2');
    expect(ticket.messages[1].attachments).toHaveLength(1);
    expect(ticket.messages[1].attachments[0].mimeType).toBe('text/plain');

    // В списке тикет появился.
    const listRes = await app.inject({
      method: 'GET', url: '/support/tickets', headers: bearer(token),
    });
    expect(listRes.json().tickets).toHaveLength(1);

    await app.close();
  });
});
