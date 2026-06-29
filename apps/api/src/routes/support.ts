import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../types';
import { requireAuth, loadAuthedUser } from '../deps';
import {
  createSupportTicketSchema,
  createTicketMessageSchema,
  supportUploadSchema,
  ATTACHMENT_MAX_BYTES,
} from '../schemas';
import { notifyAdmins } from '../services/notifications';
import type {
  SupportTicketListItemDto,
  SupportTicketDto,
  SupportTicketThreadDto,
  TicketMessageDto,
  TicketAttachmentDto,
} from '@needmarket/shared';
import type { TicketMessageRecord, TicketAttachmentRecord } from '../types';

function toAttachmentDto(a: TicketAttachmentRecord): TicketAttachmentDto {
  return { id: a.id, fileId: a.fileId, fileName: a.fileName, mimeType: a.mimeType };
}

function toMessageDto(
  m: TicketMessageRecord,
  attachments: TicketAttachmentRecord[],
): TicketMessageDto {
  return {
    id: m.id,
    fromAdmin: m.fromAdmin,
    body: m.body,
    attachments: attachments.map(toAttachmentDto),
    createdAt: m.createdAt.toISOString(),
  };
}

export function supportRoutes(deps: AppDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    // POST /support/tickets — создать тикет (первое сообщение + вложения) и уведомить админов.
    app.post('/support/tickets', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;

      const body = createSupportTicketSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
      }

      const { subject, type, message } = body.data;
      const now = new Date();

      const ticket = await deps.db.$transaction(async (tx) => {
        const created = await tx.supportTicket.create({
          data: {
            authorId: user.id,
            subject,
            type,
            lastMessageAt: now,
            lastReadByUserAt: now,
          },
        });

        const msg = await tx.ticketMessage.create({
          data: {
            ticketId: created.id,
            senderId: user.id,
            fromAdmin: false,
            body: message.body ?? null,
          },
        });

        if (message.attachments && message.attachments.length > 0) {
          await tx.ticketAttachment.createMany({
            data: message.attachments.map((a) => ({
              messageId: msg.id,
              fileId: a.fileId,
              fileName: a.fileName,
              mimeType: a.mimeType,
            })),
          });
        }

        return created;
      });

      void notifyAdmins(deps.db, deps.bot, 'support_new_ticket', {
        lotTitle: ticket.subject,
        ticketId: ticket.id,
      });

      const dto: SupportTicketDto = {
        id: ticket.id,
        subject: ticket.subject,
        type: ticket.type,
        status: ticket.status,
        createdAt: ticket.createdAt.toISOString(),
        lastMessageAt: ticket.lastMessageAt.toISOString(),
      };

      return reply.code(201).send({ ticket: dto });
    });

    // GET /support/tickets — список моих тикетов (автор = я), сортировка по lastMessageAt desc.
    // hasUnread = lastMessageAt > lastReadByUserAt И последнее сообщение fromAdmin.
    app.get('/support/tickets', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;

      const tickets = await deps.db.supportTicket.findMany({
        where: { authorId: user.id },
        orderBy: { lastMessageAt: 'desc' },
      });

      if (tickets.length === 0) return { tickets: [] as SupportTicketListItemDto[] };

      // Batch: последние сообщения по всем тикетам одним запросом.
      const ticketIds = tickets.map((t) => t.id);
      const allMessages = await deps.db.ticketMessage.findMany({
        where: { ticketId: { in: ticketIds } },
        orderBy: { createdAt: 'desc' },
      });

      // Для каждого тикета — первое (последнее по времени) сообщение.
      const lastMsgByTicket = new Map<string, (typeof allMessages)[0]>();
      for (const m of allMessages) {
        if (!lastMsgByTicket.has(m.ticketId)) {
          lastMsgByTicket.set(m.ticketId, m);
        }
      }

      const dtos: SupportTicketListItemDto[] = tickets.map((t) => {
        const lastMsg = lastMsgByTicket.get(t.id);
        const timeUnread =
          !t.lastReadByUserAt || t.lastMessageAt.getTime() > t.lastReadByUserAt.getTime();
        const hasUnread = timeUnread && (lastMsg?.fromAdmin ?? false);
        return {
          id: t.id,
          subject: t.subject,
          type: t.type,
          status: t.status,
          lastMessageAt: t.lastMessageAt.toISOString(),
          hasUnread,
        };
      });

      return { tickets: dtos };
    });

    // GET /support/tickets/:id — тред тикета (мета + сообщения + вложения).
    // Гард: author = me. Побочный эффект: пометить lastReadByUserAt = now.
    app.get<{ Params: { id: string } }>(
      '/support/tickets/:id',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;

        const ticket = await deps.db.supportTicket.findUnique({ where: { id: req.params.id } });
        if (!ticket) return reply.code(404).send({ error: 'Ticket not found' });
        if (ticket.authorId !== user.id) return reply.code(403).send({ error: 'Forbidden' });

        // Batch: все сообщения тикета (asc — хронологический порядок для чата).
        const messages = await deps.db.ticketMessage.findMany({
          where: { ticketId: ticket.id },
          orderBy: { createdAt: 'asc' },
        });

        // Batch: все вложения для всех сообщений одним запросом.
        const messageIds = messages.map((m) => m.id);
        const attachments =
          messageIds.length > 0
            ? await deps.db.ticketAttachment.findMany({ where: { messageId: { in: messageIds } } })
            : [];

        const attachsByMsg = new Map<string, TicketAttachmentRecord[]>();
        for (const a of attachments) {
          const list = attachsByMsg.get(a.messageId) ?? [];
          list.push(a);
          attachsByMsg.set(a.messageId, list);
        }

        // Пометить прочитанным до последнего сообщения.
        // Используем ticket.lastMessageAt: lastMessageAt > lastReadByUserAt → false → hasUnread=false.
        await deps.db.supportTicket.update({
          where: { id: ticket.id },
          data: { lastReadByUserAt: ticket.lastMessageAt },
        });

        const dto: SupportTicketThreadDto = {
          id: ticket.id,
          subject: ticket.subject,
          type: ticket.type,
          status: ticket.status,
          createdAt: ticket.createdAt.toISOString(),
          lastMessageAt: ticket.lastMessageAt.toISOString(),
          messages: messages.map((m) =>
            toMessageDto(m, attachsByMsg.get(m.id) ?? []),
          ),
        };

        return { ticket: dto };
      },
    );

    // POST /support/upload — загрузить файл в Telegram-хранилище, получить fileId.
    // Используется фронтом перед созданием тикета/сообщения (любой формат, до 10 МБ).
    app.post('/support/upload', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;

      if (!deps.storage) {
        return reply.code(503).send({ error: 'Хранилище медиа не настроено: задайте MEDIA_CHANNEL_ID в .env.' });
      }

      const body = supportUploadSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
      }

      const buffer = Buffer.from(body.data.data, 'base64');
      if (buffer.length === 0) return reply.code(400).send({ error: 'Empty file' });
      if (buffer.length > ATTACHMENT_MAX_BYTES) return reply.code(400).send({ error: 'File too large (max 48 MB)' });

      const ext = body.data.fileName.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') ?? 'bin';
      let ref: { fileId: string; messageId?: number };
      try {
        ref = await deps.storage.put(buffer, {
          filename: `support_${Date.now()}.${ext}`,
          contentType: body.data.contentType,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        req.log.error({ err }, 'support upload: storage.put failed');
        if (/too.?large|413|file is too big/i.test(message)) {
          return reply.code(413).send({ error: 'Файл слишком большой для Telegram (макс. 48 МБ)' });
        }
        return reply.code(503).send({ error: `Ошибка загрузки файла: ${message}` });
      }

      return { fileId: ref.fileId, fileName: body.data.fileName, mimeType: body.data.contentType };
    });

    // POST /support/tickets/:id/messages — добавить сообщение в открытый тикет.
    app.post<{ Params: { id: string } }>(
      '/support/tickets/:id/messages',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;

        const ticket = await deps.db.supportTicket.findUnique({ where: { id: req.params.id } });
        if (!ticket) return reply.code(404).send({ error: 'Ticket not found' });
        if (ticket.authorId !== user.id) return reply.code(403).send({ error: 'Forbidden' });
        if (ticket.status !== 'open') {
          return reply.code(409).send({ error: 'Ticket is closed' });
        }

        const body = createTicketMessageSchema.safeParse(req.body);
        if (!body.success) {
          return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
        }

        const now = new Date();

        const message = await deps.db.$transaction(async (tx) => {
          const msg = await tx.ticketMessage.create({
            data: {
              ticketId: ticket.id,
              senderId: user.id,
              fromAdmin: false,
              body: body.data.body ?? null,
            },
          });

          if (body.data.attachments && body.data.attachments.length > 0) {
            await tx.ticketAttachment.createMany({
              data: body.data.attachments.map((a) => ({
                messageId: msg.id,
                fileId: a.fileId,
                fileName: a.fileName,
                mimeType: a.mimeType,
              })),
            });
          }

          await tx.supportTicket.update({
            where: { id: ticket.id },
            data: { lastMessageAt: now },
          });

          return msg;
        });

        void notifyAdmins(deps.db, deps.bot, 'support_user_reply', {
          lotTitle: ticket.subject,
          ticketId: message.id, // dedupeKey = messageId
        });

        const attachments = await deps.db.ticketAttachment.findMany({
          where: { messageId: message.id },
        });

        const dto = toMessageDto(message, attachments);
        return reply.code(201).send({ message: dto });
      },
    );
  };
}
