import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, signInitData } from './helpers';

// vitest.config.ts: ADMIN_TELEGRAM_IDS='555000111'
// signInitData() по умолчанию tgId=555000111 → этот пользователь является админом.
const ADMIN_TG_ID = 555000111n;
const NON_ADMIN_TG_ID = 960999999;

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

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

// Авторизуется как admin (tgId=555000111). Профиль не нужен для admin-эндпоинтов.
async function adminClient(): Promise<{ app: FastifyInstance; token: string; userId: string }> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date()) }, // tgId=555000111 → admin
  });
  return { app, token: auth.json().token as string, userId: auth.json().user.id as string };
}

// Авторизуется как обычный пользователь (не-admin), опционально создаёт профиль.
async function userClient(tgId: number, role?: 'blogger' | 'company'): Promise<{
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

  if (role === 'blogger') {
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
    await app.inject({
      method: 'PUT', url: '/me/profile', headers: bearer(token),
      payload: { displayName: `Блогер ${tgId}`, phone: '+77000000001', categories: ['Красота'], linkedAccounts: [] },
    });
  } else if (role === 'company') {
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
    await app.inject({
      method: 'PUT', url: '/me/profile', headers: bearer(token),
      payload: { name: `ООО ${tgId}`, contact: `contact${tgId}@test.ru` },
    });
  }

  return { app, token, userId };
}

async function createTicket(
  app: FastifyInstance,
  token: string,
  overrides: Partial<{ subject: string; type: 'request' | 'idea' }> = {},
): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/support/tickets', headers: bearer(token),
    payload: {
      subject: overrides.subject ?? 'Тестовый тикет',
      type: overrides.type ?? 'request',
      message: { body: 'Текст первого сообщения' },
    },
  });
  return res.json().ticket.id as string;
}

// ─── GET /admin/support/users ──────────────────────────────────────────────────

describe('GET /admin/support/users', () => {
  it('403 для не-администратора', async () => {
    const { app, token } = await userClient(950001);

    const res = await app.inject({
      method: 'GET', url: '/admin/support/users', headers: bearer(token),
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('пустой список если нет тикетов', async () => {
    const { app, token } = await adminClient();

    const res = await app.inject({
      method: 'GET', url: '/admin/support/users', headers: bearer(token),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().users).toHaveLength(0);
    await app.close();
  });

  it('возвращает пользователей с тикетами: role/name, counts, hasUnread', async () => {
    const user1 = await userClient(950002, 'blogger');
    const user2 = await userClient(950003, 'company');
    const { app: adminApp, token: adminToken } = await adminClient();

    // user1 создаёт 2 тикета (1 open, затем 1 закроем).
    const t1 = await createTicket(user1.app, user1.token, { subject: 'Тикет A' });
    const t2 = await createTicket(user1.app, user1.token, { subject: 'Тикет B' });
    await testDb.supportTicket.update({ where: { id: t2 }, data: { status: 'closed' } });

    // user2 создаёт 1 тикет, добавляем сообщение fromAdmin → hasUnread для админа false (fromAdmin=true).
    const t3 = await createTicket(user2.app, user2.token, { subject: 'Компания запрос' });
    // Добавим сообщение от пользователя после создания → это будет последнее НЕ-fromAdmin сообщение.
    await new Promise((r) => setTimeout(r, 5));
    const adminMsgTime = new Date(Date.now() + 2000);
    await testDb.ticketMessage.create({
      data: { ticketId: t3, senderId: user2.userId, fromAdmin: false, body: 'Уточнение от пользователя', createdAt: adminMsgTime },
    });
    await testDb.supportTicket.update({ where: { id: t3 }, data: { lastMessageAt: adminMsgTime } });

    const res = await adminApp.inject({
      method: 'GET', url: '/admin/support/users', headers: bearer(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const { users } = res.json();

    // Должны быть user1 и user2.
    expect(users).toHaveLength(2);

    const u1dto = users.find((u: { userId: string }) => u.userId === user1.userId);
    const u2dto = users.find((u: { userId: string }) => u.userId === user2.userId);

    expect(u1dto).toBeDefined();
    expect(u1dto.role).toBe('blogger');
    expect(u1dto.name).toBe(`Блогер 950002`);
    expect(u1dto.ticketCount).toBe(2);
    expect(u1dto.openCount).toBe(1);
    // u1 — последнее сообщение у тикета A/B — fromAdmin=false (только пользователь писал).
    // lastReadByAdminAt=null → timeUnread=true, последнее msg НЕ fromAdmin → hasUnread=true.
    expect(u1dto.hasUnread).toBe(true);

    expect(u2dto).toBeDefined();
    expect(u2dto.role).toBe('company');
    expect(u2dto.name).toBe(`ООО 950003`);
    expect(u2dto.ticketCount).toBe(1);
    expect(u2dto.openCount).toBe(1);
    // Последнее сообщение — fromAdmin=false (пользователь уточнял) → hasUnread=true.
    expect(u2dto.hasUnread).toBe(true);

    await user1.app.close();
    await user2.app.close();
    await adminApp.close();
  });

  it('сортировка по lastActivityAt desc', async () => {
    const user1 = await userClient(950004);
    const user2 = await userClient(950005);
    const { app: adminApp, token: adminToken } = await adminClient();

    // user1 — старый тикет.
    await createTicket(user1.app, user1.token, { subject: 'Старый' });
    await new Promise((r) => setTimeout(r, 10));
    // user2 — свежий тикет.
    await createTicket(user2.app, user2.token, { subject: 'Свежий' });

    const res = await adminApp.inject({
      method: 'GET', url: '/admin/support/users', headers: bearer(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const { users } = res.json();
    expect(users).toHaveLength(2);
    // user2 активнее всего — должен быть первым.
    expect(users[0].userId).toBe(user2.userId);
    expect(users[1].userId).toBe(user1.userId);

    await user1.app.close();
    await user2.app.close();
    await adminApp.close();
  });

  it('hasUnread=false когда последнее сообщение fromAdmin', async () => {
    const user = await userClient(950006);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    // Добавляем сообщение от админа — последнее fromAdmin → hasUnread для ДРУГОГО ЗАПРОСА false.
    // Но для /users hasUnread = не fromAdmin. Поэтому добавляем fromAdmin=true.
    const adminTime = new Date(Date.now() + 1000);
    await testDb.ticketMessage.create({
      data: { ticketId, senderId: user.userId, fromAdmin: true, body: 'Отвечаем', createdAt: adminTime },
    });
    await testDb.supportTicket.update({ where: { id: ticketId }, data: { lastMessageAt: adminTime } });

    const res = await adminApp.inject({
      method: 'GET', url: '/admin/support/users', headers: bearer(adminToken),
    });

    const { users } = res.json();
    expect(users[0].hasUnread).toBe(false);

    await user.app.close();
    await adminApp.close();
  });

  it('hasUnread=false после того как админ открыл тред', async () => {
    const user = await userClient(950007);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    // Проверяем hasUnread=true перед чтением.
    const before = await adminApp.inject({
      method: 'GET', url: '/admin/support/users', headers: bearer(adminToken),
    });
    expect(before.json().users[0].hasUnread).toBe(true);

    // Открываем тред → lastReadByAdminAt обновится.
    await adminApp.inject({
      method: 'GET', url: `/admin/support/tickets/${ticketId}`, headers: bearer(adminToken),
    });
    await new Promise((r) => setTimeout(r, 30));

    const after = await adminApp.inject({
      method: 'GET', url: '/admin/support/users', headers: bearer(adminToken),
    });
    expect(after.json().users[0].hasUnread).toBe(false);

    await user.app.close();
    await adminApp.close();
  });
});

// ─── GET /admin/support/tickets ───────────────────────────────────────────────

describe('GET /admin/support/tickets', () => {
  it('403 для не-администратора', async () => {
    const { app, token } = await userClient(951001);

    const res = await app.inject({
      method: 'GET', url: '/admin/support/tickets', headers: bearer(token),
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('все тикеты без фильтра', async () => {
    const user1 = await userClient(951002);
    const user2 = await userClient(951003);
    const { app: adminApp, token: adminToken } = await adminClient();

    await createTicket(user1.app, user1.token, { subject: 'Тикет 1' });
    await createTicket(user2.app, user2.token, { subject: 'Тикет 2' });

    const res = await adminApp.inject({
      method: 'GET', url: '/admin/support/tickets', headers: bearer(adminToken),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().tickets).toHaveLength(2);

    await user1.app.close();
    await user2.app.close();
    await adminApp.close();
  });

  it('фильтр ?userId= возвращает только тикеты этого пользователя', async () => {
    const user1 = await userClient(951004);
    const user2 = await userClient(951005);
    const { app: adminApp, token: adminToken } = await adminClient();

    await createTicket(user1.app, user1.token, { subject: 'U1 тикет' });
    await createTicket(user2.app, user2.token, { subject: 'U2 тикет' });

    const res = await adminApp.inject({
      method: 'GET',
      url: `/admin/support/tickets?userId=${user1.userId}`,
      headers: bearer(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const { tickets } = res.json();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].subject).toBe('U1 тикет');

    await user1.app.close();
    await user2.app.close();
    await adminApp.close();
  });

  it('фильтр ?status=closed возвращает только закрытые', async () => {
    const user = await userClient(951006);
    const { app: adminApp, token: adminToken } = await adminClient();

    const t1 = await createTicket(user.app, user.token, { subject: 'Открытый' });
    const t2 = await createTicket(user.app, user.token, { subject: 'Закрытый' });
    await testDb.supportTicket.update({ where: { id: t2 }, data: { status: 'closed' } });

    const res = await adminApp.inject({
      method: 'GET', url: '/admin/support/tickets?status=closed', headers: bearer(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const { tickets } = res.json();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].subject).toBe('Закрытый');
    void t1;

    await user.app.close();
    await adminApp.close();
  });

  it('hasUnread в списке тикетов', async () => {
    const user = await userClient(951007);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    // Изначально: lastReadByAdminAt=null, последнее — fromAdmin=false → hasUnread=true.
    const res = await adminApp.inject({
      method: 'GET', url: '/admin/support/tickets', headers: bearer(adminToken),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().tickets[0].hasUnread).toBe(true);
    void ticketId;

    await user.app.close();
    await adminApp.close();
  });

  it('DTO тикета содержит ожидаемые поля', async () => {
    const user = await userClient(951008);
    const { app: adminApp, token: adminToken } = await adminClient();

    await createTicket(user.app, user.token, { subject: 'Поля', type: 'idea' });

    const res = await adminApp.inject({
      method: 'GET', url: '/admin/support/tickets', headers: bearer(adminToken),
    });

    const t = res.json().tickets[0];
    expect(t).toHaveProperty('id');
    expect(t).toHaveProperty('subject', 'Поля');
    expect(t).toHaveProperty('type', 'idea');
    expect(t).toHaveProperty('status', 'open');
    expect(t).toHaveProperty('lastMessageAt');
    expect(t).toHaveProperty('hasUnread');

    await user.app.close();
    await adminApp.close();
  });
});

// ─── GET /admin/support/tickets/:id ───────────────────────────────────────────

describe('GET /admin/support/tickets/:id', () => {
  it('403 для не-администратора', async () => {
    const user = await userClient(952001);
    const { app: adminApp, token: adminToken } = await adminClient();
    const ticketId = await createTicket(user.app, user.token);

    const res = await user.app.inject({
      method: 'GET', url: `/admin/support/tickets/${ticketId}`, headers: bearer(user.token),
    });

    expect(res.statusCode).toBe(403);
    void adminToken;

    await user.app.close();
    await adminApp.close();
  });

  it('404 для несуществующего тикета', async () => {
    const { app, token } = await adminClient();

    const res = await app.inject({
      method: 'GET', url: '/admin/support/tickets/nonexistent_id', headers: bearer(token),
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('тред содержит мета, автора и сообщения', async () => {
    const user = await userClient(952002, 'blogger');
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token, { subject: 'Тред тест', type: 'idea' });

    const res = await adminApp.inject({
      method: 'GET', url: `/admin/support/tickets/${ticketId}`, headers: bearer(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const { ticket } = res.json();

    // Мета тикета.
    expect(ticket.id).toBe(ticketId);
    expect(ticket.subject).toBe('Тред тест');
    expect(ticket.type).toBe('idea');
    expect(ticket.status).toBe('open');
    expect(ticket.createdAt).toBeDefined();
    expect(ticket.lastMessageAt).toBeDefined();

    // Автор.
    expect(ticket.author).toBeDefined();
    expect(ticket.author.userId).toBe(user.userId);
    expect(ticket.author.name).toBe(`Блогер 952002`);
    expect(ticket.author.role).toBe('blogger');
    expect(ticket.author.username).toBeDefined();

    // Сообщения.
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0].fromAdmin).toBe(false);
    expect(ticket.messages[0].body).toBe('Текст первого сообщения');
    expect(ticket.messages[0].attachments).toEqual([]);

    await user.app.close();
    await adminApp.close();
  });

  it('автор компании: name из companyProfile, role=company', async () => {
    const user = await userClient(952003, 'company');
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    const res = await adminApp.inject({
      method: 'GET', url: `/admin/support/tickets/${ticketId}`, headers: bearer(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const { ticket } = res.json();
    expect(ticket.author.role).toBe('company');
    expect(ticket.author.name).toBe(`ООО 952003`);
    expect(ticket.author.contact).toBe(`contact952003@test.ru`);

    await user.app.close();
    await adminApp.close();
  });

  it('тред включает вложения сообщений', async () => {
    const user = await userClient(952004);
    const { app: adminApp, token: adminToken } = await adminClient();

    const res = await user.app.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(user.token),
      payload: {
        subject: 'С вложением',
        type: 'request',
        message: {
          body: 'Прикладываю',
          attachments: [{ fileId: 'file_x', fileName: 'doc.pdf', mimeType: 'application/pdf' }],
        },
      },
    });
    const ticketId = res.json().ticket.id as string;

    const threadRes = await adminApp.inject({
      method: 'GET', url: `/admin/support/tickets/${ticketId}`, headers: bearer(adminToken),
    });

    expect(threadRes.statusCode).toBe(200);
    const msgs = threadRes.json().ticket.messages;
    expect(msgs[0].attachments).toHaveLength(1);
    expect(msgs[0].attachments[0].fileName).toBe('doc.pdf');

    await user.app.close();
    await adminApp.close();
  });

  it('помечает lastReadByAdminAt при открытии треда', async () => {
    const user = await userClient(952005);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    const before = await testDb.supportTicket.findUnique({ where: { id: ticketId } });
    expect(before?.lastReadByAdminAt).toBeNull();

    await adminApp.inject({
      method: 'GET', url: `/admin/support/tickets/${ticketId}`, headers: bearer(adminToken),
    });
    await new Promise((r) => setTimeout(r, 30));

    const after = await testDb.supportTicket.findUnique({ where: { id: ticketId } });
    expect(after?.lastReadByAdminAt).toBeDefined();
    expect(after?.lastReadByAdminAt).not.toBeNull();

    await user.app.close();
    await adminApp.close();
  });

  it('сообщения отсортированы хронологически (asc)', async () => {
    const user = await userClient(952006);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    // Добавляем второе сообщение от пользователя.
    await new Promise((r) => setTimeout(r, 5));
    await user.app.inject({
      method: 'POST', url: `/support/tickets/${ticketId}/messages`, headers: bearer(user.token),
      payload: { body: 'Второе сообщение' },
    });

    const res = await adminApp.inject({
      method: 'GET', url: `/admin/support/tickets/${ticketId}`, headers: bearer(adminToken),
    });

    const msgs = res.json().ticket.messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].body).toBe('Текст первого сообщения');
    expect(msgs[1].body).toBe('Второе сообщение');

    await user.app.close();
    await adminApp.close();
  });
});

// ─── POST /admin/support/tickets/:id/messages ─────────────────────────────────

describe('POST /admin/support/tickets/:id/messages', () => {
  it('403 для не-администратора', async () => {
    const user = await userClient(953001);
    const { app: adminApp, token: adminToken } = await adminClient();
    const ticketId = await createTicket(user.app, user.token);

    const res = await user.app.inject({
      method: 'POST', url: `/admin/support/tickets/${ticketId}/messages`,
      headers: bearer(user.token),
      payload: { body: 'Попытка' },
    });

    expect(res.statusCode).toBe(403);
    void adminToken;

    await user.app.close();
    await adminApp.close();
  });

  it('ответ администратора: fromAdmin=true, статус 201', async () => {
    const user = await userClient(953002);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    const res = await adminApp.inject({
      method: 'POST', url: `/admin/support/tickets/${ticketId}/messages`,
      headers: bearer(adminToken),
      payload: { body: 'Привет, мы вам помогли!' },
    });

    expect(res.statusCode).toBe(201);
    const { message } = res.json();
    expect(message.fromAdmin).toBe(true);
    expect(message.body).toBe('Привет, мы вам помогли!');
    expect(message.attachments).toEqual([]);

    await user.app.close();
    await adminApp.close();
  });

  it('lastMessageAt обновляется после ответа администратора', async () => {
    const user = await userClient(953003);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);
    const before = await testDb.supportTicket.findUnique({ where: { id: ticketId } });

    await new Promise((r) => setTimeout(r, 10));

    await adminApp.inject({
      method: 'POST', url: `/admin/support/tickets/${ticketId}/messages`,
      headers: bearer(adminToken),
      payload: { body: 'Ответ' },
    });

    const after = await testDb.supportTicket.findUnique({ where: { id: ticketId } });
    expect(after!.lastMessageAt.getTime()).toBeGreaterThan(before!.lastMessageAt.getTime());

    await user.app.close();
    await adminApp.close();
  });

  it('ответ с вложением → 201, вложение сохранено', async () => {
    const user = await userClient(953004);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    const res = await adminApp.inject({
      method: 'POST', url: `/admin/support/tickets/${ticketId}/messages`,
      headers: bearer(adminToken),
      payload: {
        attachments: [{ fileId: 'admin_file', fileName: 'guide.pdf', mimeType: 'application/pdf' }],
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().message.attachments).toHaveLength(1);
    expect(res.json().message.attachments[0].fileName).toBe('guide.pdf');

    await user.app.close();
    await adminApp.close();
  });

  it('409 при попытке ответить в закрытый тикет', async () => {
    const user = await userClient(953005);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);
    await testDb.supportTicket.update({ where: { id: ticketId }, data: { status: 'closed' } });

    const res = await adminApp.inject({
      method: 'POST', url: `/admin/support/tickets/${ticketId}/messages`,
      headers: bearer(adminToken),
      payload: { body: 'После закрытия' },
    });

    expect(res.statusCode).toBe(409);

    await user.app.close();
    await adminApp.close();
  });

  it('400 при пустом теле (нет body и вложений)', async () => {
    const user = await userClient(953006);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    const res = await adminApp.inject({
      method: 'POST', url: `/admin/support/tickets/${ticketId}/messages`,
      headers: bearer(adminToken),
      payload: {},
    });

    expect(res.statusCode).toBe(400);

    await user.app.close();
    await adminApp.close();
  });

  it('404 для несуществующего тикета', async () => {
    const { app, token } = await adminClient();

    const res = await app.inject({
      method: 'POST', url: '/admin/support/tickets/no_such_ticket/messages',
      headers: bearer(token),
      payload: { body: 'Текст' },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('уведомляет автора (support_admin_reply, дедуп по messageId)', async () => {
    const { bot, calls } = makeFakeBot();
    const userTgId = 953007;
    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();

    // Авторизуем пользователя и создаём тикет.
    const userAuth = await appWithBot.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: userTgId }) },
    });
    const userTok = userAuth.json().token as string;
    const ticketRes = await appWithBot.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(userTok),
      payload: { subject: 'Уведомление', type: 'request', message: { body: 'Вопрос' } },
    });
    const ticketId = ticketRes.json().ticket.id as string;

    // Ждём async new_ticket уведомление → сбрасываем.
    await new Promise((r) => setTimeout(r, 50));
    calls.length = 0;

    // Авторизуем как admin и отвечаем.
    const adminAuth = await appWithBot.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });
    const adminTok = adminAuth.json().token as string;

    await appWithBot.inject({
      method: 'POST', url: `/admin/support/tickets/${ticketId}/messages`,
      headers: bearer(adminTok),
      payload: { body: 'Ответ поддержки' },
    });

    await new Promise((r) => setTimeout(r, 50));

    // Уведомление должно прийти пользователю (userTgId=953007), не в adminTgId.
    const userCalls = calls.filter((c) => c.to === userTgId);
    expect(userCalls.length).toBeGreaterThanOrEqual(1);
    expect(userCalls[0].text).toContain('ответила');

    // Проверяем дедуп: второй notify с тем же messageId не должен дать нового вызова.
    const msgId = (await testDb.ticketMessage.findMany({
      where: { ticketId, fromAdmin: true },
      orderBy: { createdAt: 'desc' },
    }))[0].id;

    const { notifyUser } = await import('../src/services/notifications');
    await notifyUser(testDb, bot, userAuth.json().user.id, 'support_admin_reply', {
      lotTitle: 'Уведомление',
      ticketId: msgId,         // тот же dedupeKey
      linkTicketId: ticketId,
    });

    const userCallsAfterDup = calls.filter((c) => c.to === userTgId).length;
    expect(userCallsAfterDup).toBe(userCalls.length); // не увеличилось

    await appWithBot.close();
  });
});

// ─── PATCH /admin/support/tickets/:id ─────────────────────────────────────────

describe('PATCH /admin/support/tickets/:id', () => {
  it('403 для не-администратора', async () => {
    const user = await userClient(954001);
    const { app: adminApp, token: adminToken } = await adminClient();
    const ticketId = await createTicket(user.app, user.token);

    const res = await user.app.inject({
      method: 'PATCH', url: `/admin/support/tickets/${ticketId}`,
      headers: bearer(user.token),
      payload: { status: 'closed' },
    });

    expect(res.statusCode).toBe(403);
    void adminToken;

    await user.app.close();
    await adminApp.close();
  });

  it('закрывает открытый тикет → status=closed', async () => {
    const user = await userClient(954002);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    const res = await adminApp.inject({
      method: 'PATCH', url: `/admin/support/tickets/${ticketId}`,
      headers: bearer(adminToken),
      payload: { status: 'closed' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ticket.status).toBe('closed');

    const dbTicket = await testDb.supportTicket.findUnique({ where: { id: ticketId } });
    expect(dbTicket?.status).toBe('closed');

    await user.app.close();
    await adminApp.close();
  });

  it('переоткрывает закрытый тикет → status=open', async () => {
    const user = await userClient(954003);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);
    await testDb.supportTicket.update({ where: { id: ticketId }, data: { status: 'closed' } });

    const res = await adminApp.inject({
      method: 'PATCH', url: `/admin/support/tickets/${ticketId}`,
      headers: bearer(adminToken),
      payload: { status: 'open' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ticket.status).toBe('open');

    await user.app.close();
    await adminApp.close();
  });

  it('404 для несуществующего тикета', async () => {
    const { app, token } = await adminClient();

    const res = await app.inject({
      method: 'PATCH', url: '/admin/support/tickets/no_such_ticket',
      headers: bearer(token),
      payload: { status: 'closed' },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('400 при неверном статусе', async () => {
    const user = await userClient(954004);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    const res = await adminApp.inject({
      method: 'PATCH', url: `/admin/support/tickets/${ticketId}`,
      headers: bearer(adminToken),
      payload: { status: 'deleted' },
    });

    expect(res.statusCode).toBe(400);

    await user.app.close();
    await adminApp.close();
  });

  it('при закрытии отправляет уведомление автору (support_ticket_closed)', async () => {
    const { bot, calls } = makeFakeBot();
    const userTgId = 954005;
    const appWithBot = buildApp({ db: testDb, bot });
    await appWithBot.ready();

    const userAuth = await appWithBot.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: userTgId }) },
    });
    const userTok = userAuth.json().token as string;
    const ticketRes = await appWithBot.inject({
      method: 'POST', url: '/support/tickets', headers: bearer(userTok),
      payload: { subject: 'Закрываемый', type: 'request', message: { body: 'Текст' } },
    });
    const ticketId = ticketRes.json().ticket.id as string;

    await new Promise((r) => setTimeout(r, 50));
    calls.length = 0;

    const adminAuth = await appWithBot.inject({
      method: 'POST', url: '/auth/telegram',
      payload: { initData: signInitData(new Date()) },
    });
    const adminTok = adminAuth.json().token as string;

    await appWithBot.inject({
      method: 'PATCH', url: `/admin/support/tickets/${ticketId}`,
      headers: bearer(adminTok),
      payload: { status: 'closed' },
    });

    await new Promise((r) => setTimeout(r, 50));

    const userCalls = calls.filter((c) => c.to === userTgId);
    expect(userCalls.length).toBeGreaterThanOrEqual(1);
    expect(userCalls[0].text).toContain('закрыт');

    await appWithBot.close();
  });
});

// ─── Взаимный unread: end-to-end ─────────────────────────────────────────────

describe('Взаимный unread', () => {
  it('юзер ответил → hasUnread-для-админа=true', async () => {
    const user = await userClient(955001);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    // Добавляем второе сообщение от пользователя.
    await new Promise((r) => setTimeout(r, 5));
    const userMsgTime = new Date(Date.now() + 1000);
    await testDb.ticketMessage.create({
      data: { ticketId, senderId: user.userId, fromAdmin: false, body: 'Уточнение', createdAt: userMsgTime },
    });
    await testDb.supportTicket.update({
      where: { id: ticketId }, data: { lastMessageAt: userMsgTime },
    });

    // Список тикетов от admin → hasUnread=true.
    const res = await adminApp.inject({
      method: 'GET', url: '/admin/support/tickets', headers: bearer(adminToken),
    });
    expect(res.json().tickets[0].hasUnread).toBe(true);

    await user.app.close();
    await adminApp.close();
  });

  it('админ открыл тред → hasUnread-для-админа=false', async () => {
    const user = await userClient(955002);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    // Убедимся что hasUnread=true.
    const before = await adminApp.inject({
      method: 'GET', url: '/admin/support/tickets', headers: bearer(adminToken),
    });
    expect(before.json().tickets[0].hasUnread).toBe(true);

    // Открываем тред → lastReadByAdminAt = lastMessageAt.
    await adminApp.inject({
      method: 'GET', url: `/admin/support/tickets/${ticketId}`, headers: bearer(adminToken),
    });
    await new Promise((r) => setTimeout(r, 30));

    const after = await adminApp.inject({
      method: 'GET', url: '/admin/support/tickets', headers: bearer(adminToken),
    });
    expect(after.json().tickets[0].hasUnread).toBe(false);

    await user.app.close();
    await adminApp.close();
  });

  it('админ ответил → hasUnread-для-юзера=true (Backend A)', async () => {
    const user = await userClient(955003);
    const { app: adminApp, token: adminToken } = await adminClient();

    const ticketId = await createTicket(user.app, user.token);

    // Сначала убедимся что у пользователя нет непрочитанных (первое сообщение — свой).
    const before = await user.app.inject({
      method: 'GET', url: '/support/tickets', headers: bearer(user.token),
    });
    expect(before.json().tickets[0].hasUnread).toBe(false);

    // Админ отвечает.
    await new Promise((r) => setTimeout(r, 5));
    await adminApp.inject({
      method: 'POST', url: `/admin/support/tickets/${ticketId}/messages`,
      headers: bearer(adminToken),
      payload: { body: 'Ответ поддержки' },
    });

    // Теперь у пользователя должно появиться непрочитанное.
    const after = await user.app.inject({
      method: 'GET', url: '/support/tickets', headers: bearer(user.token),
    });
    expect(after.json().tickets[0].hasUnread).toBe(true);

    await user.app.close();
    await adminApp.close();
  });

  it('полный цикл: создание → ответ юзера → unread у админа → ответ админа → unread у юзера', async () => {
    const user = await userClient(955004);
    const { app: adminApp, token: adminToken } = await adminClient();

    // 1. Пользователь создаёт тикет.
    const ticketId = await createTicket(user.app, user.token);

    // 2. Проверяем: у юзера нет unread (он сам написал).
    const userList1 = await user.app.inject({ method: 'GET', url: '/support/tickets', headers: bearer(user.token) });
    expect(userList1.json().tickets[0].hasUnread).toBe(false);

    // 3. Пользователь добавляет сообщение → у админа появится unread.
    await new Promise((r) => setTimeout(r, 5));
    await user.app.inject({
      method: 'POST', url: `/support/tickets/${ticketId}/messages`, headers: bearer(user.token),
      payload: { body: 'Дополнение' },
    });

    const adminList1 = await adminApp.inject({ method: 'GET', url: '/admin/support/tickets', headers: bearer(adminToken) });
    expect(adminList1.json().tickets[0].hasUnread).toBe(true);

    // 4. Админ открывает тред → unread у него сбрасывается.
    await adminApp.inject({ method: 'GET', url: `/admin/support/tickets/${ticketId}`, headers: bearer(adminToken) });
    await new Promise((r) => setTimeout(r, 30));

    const adminList2 = await adminApp.inject({ method: 'GET', url: '/admin/support/tickets', headers: bearer(adminToken) });
    expect(adminList2.json().tickets[0].hasUnread).toBe(false);

    // 5. Админ отвечает → у пользователя появляется unread.
    await new Promise((r) => setTimeout(r, 5));
    await adminApp.inject({
      method: 'POST', url: `/admin/support/tickets/${ticketId}/messages`,
      headers: bearer(adminToken),
      payload: { body: 'Мы разобрались' },
    });

    const userList2 = await user.app.inject({ method: 'GET', url: '/support/tickets', headers: bearer(user.token) });
    expect(userList2.json().tickets[0].hasUnread).toBe(true);

    await user.app.close();
    await adminApp.close();
  });
});
