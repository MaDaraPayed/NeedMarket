import { z } from 'zod';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../types';
import { requireAuth, loadAdminUser } from '../deps';
import { createTicketMessageSchema } from '../schemas';
import { notifyUser } from '../services/notifications';
import type {
  AdminSupportUserDto,
  AdminSupportTicketListItemDto,
  AdminSupportTicketThreadDto,
  AdminTicketAuthorDto,
  TicketMessageDto,
  TicketAttachmentDto,
} from '@needmarket/shared';
import type { TicketMessageRecord, TicketAttachmentRecord, SupportTicketRecord } from '../types';

function toAttachmentDto(a: TicketAttachmentRecord): TicketAttachmentDto {
  return { id: a.id, fileId: a.fileId, fileName: a.fileName, mimeType: a.mimeType };
}

function toMessageDto(m: TicketMessageRecord, attachments: TicketAttachmentRecord[]): TicketMessageDto {
  return {
    id: m.id,
    fromAdmin: m.fromAdmin,
    body: m.body,
    attachments: attachments.map(toAttachmentDto),
    createdAt: m.createdAt.toISOString(),
  };
}

// hasUnread для администратора: lastMessageAt > lastReadByAdminAt И последнее сообщение НЕ fromAdmin.
function adminHasUnread(ticket: SupportTicketRecord, lastMsg: TicketMessageRecord | undefined): boolean {
  const timeUnread =
    !ticket.lastReadByAdminAt ||
    ticket.lastMessageAt.getTime() > ticket.lastReadByAdminAt.getTime();
  const fromUser = lastMsg ? !lastMsg.fromAdmin : false;
  return timeUnread && fromUser;
}

const adminTicketsQuerySchema = z.object({
  userId: z.string().optional(),
  status: z.enum(['open', 'closed']).optional(),
});

const adminUpdateTicketSchema = z.object({
  status: z.enum(['open', 'closed']),
});

// Роуты администратора поддержки. Все под requireAuth + loadAdminUser.
export function adminSupportRoutes(deps: AppDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {

    // GET /admin/support/users — пользователи, у кого есть тикеты.
    // DTO/юзер: userId, name, role, ticketCount, openCount, lastActivityAt, hasUnread.
    // Batch: тикеты → последние сообщения → users → blogger/company profiles.
    app.get('/admin/support/users', { preHandler: requireAuth }, async (req, reply) => {
      const admin = await loadAdminUser(deps.db, req, reply);
      if (!admin) return;

      const allTickets = await deps.db.supportTicket.findMany({
        where: {},
        orderBy: { lastMessageAt: 'desc' },
      });
      if (allTickets.length === 0) return { users: [] as AdminSupportUserDto[] };

      // Batch: последние сообщения по всем тикетам одним запросом.
      const ticketIds = allTickets.map((t) => t.id);
      const allMessages = await deps.db.ticketMessage.findMany({
        where: { ticketId: { in: ticketIds } },
        orderBy: { createdAt: 'desc' },
      });
      const lastMsgByTicket = new Map<string, TicketMessageRecord>();
      for (const m of allMessages) {
        if (!lastMsgByTicket.has(m.ticketId)) lastMsgByTicket.set(m.ticketId, m);
      }

      // Группируем по authorId.
      const authorMap = new Map<string, {
        tickets: SupportTicketRecord[];
        lastActivityAt: Date;
        hasUnread: boolean;
      }>();
      for (const t of allTickets) {
        const lastMsg = lastMsgByTicket.get(t.id);
        const ticketUnread = adminHasUnread(t, lastMsg);
        const entry = authorMap.get(t.authorId);
        if (!entry) {
          authorMap.set(t.authorId, {
            tickets: [t],
            lastActivityAt: t.lastMessageAt,
            hasUnread: ticketUnread,
          });
        } else {
          entry.tickets.push(t);
          if (t.lastMessageAt > entry.lastActivityAt) entry.lastActivityAt = t.lastMessageAt;
          if (ticketUnread) entry.hasUnread = true;
        }
      }

      // Batch: users, blogger profiles, company profiles.
      const authorIds = [...authorMap.keys()];
      const [users, bloggerProfiles, companyProfiles] = await Promise.all([
        deps.db.user.findMany({ where: { id: { in: authorIds } } }),
        deps.db.bloggerProfile.findMany({ where: { userId: { in: authorIds } } }),
        deps.db.companyProfile.findMany({ where: { userId: { in: authorIds } } }),
      ]);
      const userById = new Map(users.map((u) => [u.id, u]));
      const bloggerByUserId = new Map(bloggerProfiles.map((p) => [p.userId, p]));
      const companyByUserId = new Map(companyProfiles.map((p) => [p.userId, p]));

      // Строим DTO, сортируем по lastActivityAt desc.
      const dtos: AdminSupportUserDto[] = [];
      for (const [authorId, data] of authorMap) {
        const user = userById.get(authorId);
        if (!user) continue;
        const blogger = bloggerByUserId.get(authorId);
        const company = companyByUserId.get(authorId);
        const name = blogger?.displayName ?? company?.name ?? user.firstName;
        const openCount = data.tickets.filter((t) => t.status === 'open').length;
        dtos.push({
          userId: authorId,
          name,
          role: user.role,
          ticketCount: data.tickets.length,
          openCount,
          lastActivityAt: data.lastActivityAt.toISOString(),
          hasUnread: data.hasUnread,
        });
      }
      dtos.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

      return { users: dtos };
    });

    // GET /admin/support/tickets?userId=&status= — тикеты с фильтром.
    // DTO/тикет: id, subject, type, status, lastMessageAt, hasUnread.
    app.get('/admin/support/tickets', { preHandler: requireAuth }, async (req, reply) => {
      const admin = await loadAdminUser(deps.db, req, reply);
      if (!admin) return;

      const q = adminTicketsQuerySchema.safeParse(req.query);
      if (!q.success) {
        return reply.code(400).send({ error: 'Invalid query', issues: q.error.issues });
      }

      const tickets = await deps.db.supportTicket.findMany({
        where: {
          ...(q.data.userId ? { authorId: q.data.userId } : {}),
          ...(q.data.status ? { status: q.data.status } : {}),
        },
        orderBy: { lastMessageAt: 'desc' },
      });
      if (tickets.length === 0) return { tickets: [] as AdminSupportTicketListItemDto[] };

      // Batch: последние сообщения.
      const ticketIds = tickets.map((t) => t.id);
      const allMessages = await deps.db.ticketMessage.findMany({
        where: { ticketId: { in: ticketIds } },
        orderBy: { createdAt: 'desc' },
      });
      const lastMsgByTicket = new Map<string, TicketMessageRecord>();
      for (const m of allMessages) {
        if (!lastMsgByTicket.has(m.ticketId)) lastMsgByTicket.set(m.ticketId, m);
      }

      const dtos: AdminSupportTicketListItemDto[] = tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        type: t.type,
        status: t.status,
        lastMessageAt: t.lastMessageAt.toISOString(),
        hasUnread: adminHasUnread(t, lastMsgByTicket.get(t.id)),
      }));

      return { tickets: dtos };
    });

    // GET /admin/support/tickets/:id — тред тикета.
    // Побочный эффект: lastReadByAdminAt = now.
    app.get<{ Params: { id: string } }>(
      '/admin/support/tickets/:id',
      { preHandler: requireAuth },
      async (req, reply) => {
        const admin = await loadAdminUser(deps.db, req, reply);
        if (!admin) return;

        const ticket = await deps.db.supportTicket.findUnique({ where: { id: req.params.id } });
        if (!ticket) return reply.code(404).send({ error: 'Ticket not found' });

        // Batch: сообщения + вложения.
        const messages = await deps.db.ticketMessage.findMany({
          where: { ticketId: ticket.id },
          orderBy: { createdAt: 'asc' },
        });
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

        // Batch: автор — user + профиль.
        const [authorUser, bloggerProfiles, companyProfiles] = await Promise.all([
          deps.db.user.findMany({ where: { id: { in: [ticket.authorId] } } }),
          deps.db.bloggerProfile.findMany({ where: { userId: { in: [ticket.authorId] } } }),
          deps.db.companyProfile.findMany({ where: { userId: { in: [ticket.authorId] } } }),
        ]);
        const user = authorUser[0];
        const blogger = bloggerProfiles[0];
        const company = companyProfiles[0];
        const authorName = blogger?.displayName ?? company?.name ?? (user?.firstName ?? '');
        const authorContact = blogger?.contact ?? company?.contact ?? null;

        const author: AdminTicketAuthorDto = {
          userId: ticket.authorId,
          name: authorName,
          role: user?.role ?? null,
          contact: authorContact,
          username: user?.username ?? null,
        };

        // Пометить прочитанным: lastReadByAdminAt = lastMessageAt (аналогично user-side).
        await deps.db.supportTicket.update({
          where: { id: ticket.id },
          data: { lastReadByAdminAt: ticket.lastMessageAt },
        });

        const dto: AdminSupportTicketThreadDto = {
          id: ticket.id,
          subject: ticket.subject,
          type: ticket.type,
          status: ticket.status,
          createdAt: ticket.createdAt.toISOString(),
          lastMessageAt: ticket.lastMessageAt.toISOString(),
          author,
          messages: messages.map((m) => toMessageDto(m, attachsByMsg.get(m.id) ?? [])),
        };

        return { ticket: dto };
      },
    );

    // POST /admin/support/tickets/:id/messages — ответ администратора.
    // fromAdmin=true; уведомляет автора (support_admin_reply, дедуп по messageId).
    app.post<{ Params: { id: string } }>(
      '/admin/support/tickets/:id/messages',
      { preHandler: requireAuth },
      async (req, reply) => {
        const admin = await loadAdminUser(deps.db, req, reply);
        if (!admin) return;

        const ticket = await deps.db.supportTicket.findUnique({ where: { id: req.params.id } });
        if (!ticket) return reply.code(404).send({ error: 'Ticket not found' });
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
              senderId: admin.id,
              fromAdmin: true,
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

        // Уведомить автора тикета (дедуп по messageId через ticketId=message.id).
        void notifyUser(deps.db, deps.bot, ticket.authorId, 'support_admin_reply', {
          lotTitle: ticket.subject,
          ticketId: message.id,       // dedupeKey = messageId
          linkTicketId: ticket.id,    // для диплинка support_<ticketId>
        });

        const attachments = await deps.db.ticketAttachment.findMany({
          where: { messageId: message.id },
        });

        const dto = toMessageDto(message, attachments);
        return reply.code(201).send({ message: dto });
      },
    );

    // PATCH /admin/support/tickets/:id — закрыть/переоткрыть тикет.
    app.patch<{ Params: { id: string } }>(
      '/admin/support/tickets/:id',
      { preHandler: requireAuth },
      async (req, reply) => {
        const admin = await loadAdminUser(deps.db, req, reply);
        if (!admin) return;

        const ticket = await deps.db.supportTicket.findUnique({ where: { id: req.params.id } });
        if (!ticket) return reply.code(404).send({ error: 'Ticket not found' });

        const body = adminUpdateTicketSchema.safeParse(req.body);
        if (!body.success) {
          return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
        }

        const updated = await deps.db.supportTicket.update({
          where: { id: ticket.id },
          data: { status: body.data.status },
        });

        // Уведомить автора при закрытии (дедуп по ticketId — одно уведомление за тикет).
        if (body.data.status === 'closed') {
          void notifyUser(deps.db, deps.bot, ticket.authorId, 'support_ticket_closed', {
            lotTitle: ticket.subject,
            ticketId: ticket.id,         // dedupeKey = ticketId
            linkTicketId: ticket.id,     // для диплинка support_<ticketId>
          });
        }

        return { ticket: { id: updated.id, status: updated.status } };
      },
    );
  };
}
