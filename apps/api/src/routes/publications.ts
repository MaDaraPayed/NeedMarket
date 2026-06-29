import { z } from 'zod';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../types';
import { requireAuth, loadAuthedUser } from '../deps';
import { adminTelegramIds } from '../env';
import { isInAudience } from '../services/publication-audience';
import { notifyAdmins } from '../services/notifications';
import { supportAttachmentSchema } from '../schemas';
import type {
  PublicationListItemDto,
  PublicationDetailDto,
  PublicationAttachmentDto,
  PublicationRatingAggregateDto,
  PublicationThreadDto,
  PublicationThreadMessageDto,
  PublicationThreadAttachmentDto,
  PublicationCommentDto,
} from '@needmarket/shared';
import type {
  PublicationRecord,
  PublicationAttachmentRecord,
  PublicationRatingGroupRow,
  PublicationThreadMessageRecord,
  PublicationThreadAttachmentRecord,
  PublicationThreadStateRecord,
} from '../types';

// ─── Вспомогательные сериализаторы ───────────────────────────────────────────

function toAttachmentDto(a: PublicationAttachmentRecord): PublicationAttachmentDto {
  return { id: a.id, fileId: a.fileId, fileName: a.fileName, mimeType: a.mimeType, kind: a.kind };
}

function toThreadAttachmentDto(a: PublicationThreadAttachmentRecord): PublicationThreadAttachmentDto {
  return { id: a.id, fileId: a.fileId, fileName: a.fileName, mimeType: a.mimeType };
}

function toThreadMessageDto(
  m: PublicationThreadMessageRecord,
  attachments: PublicationThreadAttachmentRecord[],
): PublicationThreadMessageDto {
  return {
    id: m.id,
    fromAdmin: m.fromAdmin,
    body: m.body,
    attachments: attachments.map(toThreadAttachmentDto),
    createdAt: m.createdAt.toISOString(),
  };
}

function buildRatingDto(
  pubId: string,
  ratingGroupMap: Map<string, PublicationRatingGroupRow>,
  myRatingMap: Map<string, number>,
): PublicationRatingAggregateDto {
  const row = ratingGroupMap.get(pubId);
  return {
    avgRating: row ? (row._avg.value !== null ? Math.round(row._avg.value * 10) / 10 : null) : null,
    ratingCount: row ? row._count.value : 0,
    myRating: myRatingMap.get(pubId) ?? null,
  };
}

function toListItemDto(
  p: PublicationRecord,
  attachments: PublicationAttachmentRecord[],
  hasRead: boolean,
  rating: PublicationRatingAggregateDto,
): PublicationListItemDto {
  return {
    id: p.id,
    title: p.title,
    body: p.body,
    attachments: attachments.map(toAttachmentDto),
    ratingsEnabled: p.ratingsEnabled,
    replyMode: p.replyMode,
    publishedAt: p.publishedAt!.toISOString(),
    hasRead,
    rating,
  };
}

function threadHasUnreadForUser(
  state: PublicationThreadStateRecord | null,
  lastMsg: PublicationThreadMessageRecord | undefined,
): boolean {
  if (!state || !lastMsg) return false;
  const timeUnread = !state.lastReadByUserAt || state.lastMessageAt.getTime() > state.lastReadByUserAt.getTime();
  return timeUnread && lastMsg.fromAdmin;
}

// ─── Валидационные схемы ──────────────────────────────────────────────────────

const ratingBodySchema = z.object({
  value: z.number().int().min(1).max(5),
});

const threadMessageBodySchema = z
  .object({
    body: z.string().max(4000).optional(),
    attachments: z.array(supportAttachmentSchema).max(10).optional(),
  })
  .refine(
    (d) => (d.body !== undefined && d.body.trim().length > 0) || (d.attachments !== undefined && d.attachments.length > 0),
    { message: 'Message must contain body or at least one attachment' },
  );

const commentBodySchema = z.object({
  body: z.string().min(1).max(4000),
});

// ─── Route factory ─────────────────────────────────────────────────────────────

export function publicationRoutes(deps: AppDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {

    // GET /publications — лента для текущего пользователя (published + таргет).
    app.get('/publications', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;

      const allPublished = await deps.db.publication.findMany({
        where: { status: 'published' },
        orderBy: { publishedAt: 'desc' },
      });

      const targeted = allPublished.filter((p) =>
        isInAudience(user.id, user.role ?? null, p.audienceRoles, p.audienceUserIds),
      );

      if (targeted.length === 0) return { publications: [] as PublicationListItemDto[] };

      const pubIds = targeted.map((p) => p.id);

      const [attachments, reads, ratingGroups, myRatings] = await Promise.all([
        deps.db.publicationAttachment.findMany({ where: { publicationId: { in: pubIds } } }),
        deps.db.publicationRead.findMany({ where: { userId: user.id, publicationId: { in: pubIds } } }),
        deps.db.publicationRating.groupBy({
          by: ['publicationId'],
          where: { publicationId: { in: pubIds } },
          _avg: { value: true },
          _count: { value: true },
        }),
        deps.db.publicationRating.findMany({ where: { publicationId: { in: pubIds }, userId: user.id } }),
      ]);

      const attachsByPub = new Map<string, PublicationAttachmentRecord[]>();
      for (const a of attachments) {
        const list = attachsByPub.get(a.publicationId) ?? [];
        list.push(a);
        attachsByPub.set(a.publicationId, list);
      }

      const readSet = new Set(reads.map((r) => r.publicationId));

      const ratingGroupMap = new Map(ratingGroups.map((r) => [r.publicationId, r]));
      const myRatingMap = new Map(myRatings.map((r) => [r.publicationId, r.value]));

      const dtos: PublicationListItemDto[] = targeted.map((p) =>
        toListItemDto(
          p,
          attachsByPub.get(p.id) ?? [],
          readSet.has(p.id),
          buildRatingDto(p.id, ratingGroupMap, myRatingMap),
        ),
      );

      return { publications: dtos };
    });

    // GET /publications/:id — одна публикация; проверяет таргет, помечает прочитанной.
    app.get<{ Params: { id: string } }>(
      '/publications/:id',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;

        const pub = await deps.db.publication.findUnique({ where: { id: req.params.id } });
        if (!pub || pub.status !== 'published') return reply.code(404).send({ error: 'Not found' });

        if (!isInAudience(user.id, user.role ?? null, pub.audienceRoles, pub.audienceUserIds)) {
          return reply.code(403).send({ error: 'Forbidden' });
        }

        const [attachments, ratingGroups, myRatings] = await Promise.all([
          deps.db.publicationAttachment.findMany({ where: { publicationId: pub.id } }),
          deps.db.publicationRating.groupBy({
            by: ['publicationId'],
            where: { publicationId: { in: [pub.id] } },
            _avg: { value: true },
            _count: { value: true },
          }),
          deps.db.publicationRating.findMany({ where: { publicationId: pub.id, userId: user.id } }),
          deps.db.publicationRead.upsert({
            where: { publicationId_userId: { publicationId: pub.id, userId: user.id } },
            create: { publicationId: pub.id, userId: user.id },
            update: {},
          }),
        ]);

        const ratingGroupMap = new Map(ratingGroups.map((r) => [r.publicationId, r]));
        const myRatingMap = new Map(myRatings.map((r) => [r.publicationId, r.value]));

        const dto: PublicationDetailDto = toListItemDto(
          pub,
          attachments,
          true,
          buildRatingDto(pub.id, ratingGroupMap, myRatingMap),
        );

        return { publication: dto };
      },
    );

    // PUT /publications/:id/rating — поставить/изменить оценку ★1–5.
    // Гард: published + ratingsEnabled + в аудитории.
    app.put<{ Params: { id: string } }>(
      '/publications/:id/rating',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;

        const pub = await deps.db.publication.findUnique({ where: { id: req.params.id } });
        if (!pub || pub.status !== 'published') return reply.code(404).send({ error: 'Not found' });
        if (!pub.ratingsEnabled) return reply.code(409).send({ error: 'Ratings are disabled for this publication' });
        if (!isInAudience(user.id, user.role ?? null, pub.audienceRoles, pub.audienceUserIds)) {
          return reply.code(403).send({ error: 'Forbidden' });
        }

        const body = ratingBodySchema.safeParse(req.body);
        if (!body.success) {
          return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
        }

        await deps.db.publicationRating.upsert({
          where: { publicationId_userId: { publicationId: pub.id, userId: user.id } },
          create: { publicationId: pub.id, userId: user.id, value: body.data.value },
          update: { value: body.data.value },
        });

        // Вернуть актуальный агрегат.
        const [ratingGroups] = await Promise.all([
          deps.db.publicationRating.groupBy({
            by: ['publicationId'],
            where: { publicationId: { in: [pub.id] } },
            _avg: { value: true },
            _count: { value: true },
          }),
        ]);
        const ratingGroupMap = new Map(ratingGroups.map((r) => [r.publicationId, r]));
        const myRatingMap = new Map([[pub.id, body.data.value]]);

        return { rating: buildRatingDto(pub.id, ratingGroupMap, myRatingMap) };
      },
    );

    // ─── Приватный тред (replyMode = 'private') ──────────────────────────────

    // GET /publications/:id/thread — тред пользователя с администрацией.
    app.get<{ Params: { id: string } }>(
      '/publications/:id/thread',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;

        const pub = await deps.db.publication.findUnique({ where: { id: req.params.id } });
        if (!pub || pub.status !== 'published') return reply.code(404).send({ error: 'Not found' });
        if (!isInAudience(user.id, user.role ?? null, pub.audienceRoles, pub.audienceUserIds)) {
          return reply.code(403).send({ error: 'Forbidden' });
        }
        if (pub.replyMode !== 'private') {
          return reply.code(409).send({ error: 'Replies are not in private mode' });
        }

        const messages = await deps.db.publicationThreadMessage.findMany({
          where: { publicationId: pub.id, userId: user.id },
          orderBy: { createdAt: 'asc' },
        });

        const messageIds = messages.map((m) => m.id);
        const attachments =
          messageIds.length > 0
            ? await deps.db.publicationThreadAttachment.findMany({ where: { messageId: { in: messageIds } } })
            : [];

        const attachsByMsg = new Map<string, PublicationThreadAttachmentRecord[]>();
        for (const a of attachments) {
          const list = attachsByMsg.get(a.messageId) ?? [];
          list.push(a);
          attachsByMsg.set(a.messageId, list);
        }

        const state = await deps.db.publicationThreadState.findUnique({
          where: { publicationId_userId: { publicationId: pub.id, userId: user.id } },
        });

        const lastMsg = messages.length > 0 ? messages[messages.length - 1] : undefined;
        const hasUnread = threadHasUnreadForUser(state, lastMsg);

        // Пометить прочитанным пользователем.
        if (state) {
          await deps.db.publicationThreadState.update({
            where: { publicationId_userId: { publicationId: pub.id, userId: user.id } },
            data: { lastReadByUserAt: state.lastMessageAt },
          });
        }

        const dto: PublicationThreadDto = {
          messages: messages.map((m) => toThreadMessageDto(m, attachsByMsg.get(m.id) ?? [])),
          hasUnread,
          lastMessageAt: state ? state.lastMessageAt.toISOString() : null,
        };

        return { thread: dto };
      },
    );

    // POST /publications/:id/thread/messages — пользователь шлёт сообщение в тред.
    app.post<{ Params: { id: string } }>(
      '/publications/:id/thread/messages',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;

        const pub = await deps.db.publication.findUnique({ where: { id: req.params.id } });
        if (!pub || pub.status !== 'published') return reply.code(404).send({ error: 'Not found' });
        if (!isInAudience(user.id, user.role ?? null, pub.audienceRoles, pub.audienceUserIds)) {
          return reply.code(403).send({ error: 'Forbidden' });
        }
        if (pub.replyMode !== 'private') {
          return reply.code(409).send({ error: 'Replies are not in private mode' });
        }

        const body = threadMessageBodySchema.safeParse(req.body);
        if (!body.success) {
          return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
        }

        const now = new Date();

        const message = await deps.db.$transaction(async (tx) => {
          const msg = await tx.publicationThreadMessage.create({
            data: {
              publicationId: pub.id,
              userId: user.id,
              senderId: user.id,
              fromAdmin: false,
              body: body.data.body ?? null,
            },
          });

          if (body.data.attachments && body.data.attachments.length > 0) {
            await tx.publicationThreadAttachment.createMany({
              data: body.data.attachments.map((a) => ({
                messageId: msg.id,
                fileId: a.fileId,
                fileName: a.fileName,
                mimeType: a.mimeType,
              })),
            });
          }

          await tx.publicationThreadState.upsert({
            where: { publicationId_userId: { publicationId: pub.id, userId: user.id } },
            create: {
              publicationId: pub.id,
              userId: user.id,
              lastMessageAt: now,
              lastReadByUserAt: now,
            },
            update: { lastMessageAt: now, lastReadByUserAt: now },
          });

          return msg;
        });

        void notifyAdmins(deps.db, deps.bot, 'publication_reply_user', {
          publicationId: pub.id,
          ticketId: message.id, // dedupeKey = messageId
        });

        const attachments = await deps.db.publicationThreadAttachment.findMany({
          where: { messageId: message.id },
        });

        return reply.code(201).send({
          message: toThreadMessageDto(message, attachments),
        });
      },
    );

    // ─── Публичные комментарии (replyMode = 'public') ────────────────────────

    // GET /publications/:id/comments — все комментарии публикации.
    // Доступно всем в аудитории; batch без N+1.
    app.get<{ Params: { id: string } }>(
      '/publications/:id/comments',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;

        const pub = await deps.db.publication.findUnique({ where: { id: req.params.id } });
        if (!pub || pub.status !== 'published') return reply.code(404).send({ error: 'Not found' });
        if (!isInAudience(user.id, user.role ?? null, pub.audienceRoles, pub.audienceUserIds)) {
          return reply.code(403).send({ error: 'Forbidden' });
        }
        if (pub.replyMode !== 'public') {
          return reply.code(409).send({ error: 'Comments are not enabled for this publication' });
        }

        const comments = await deps.db.publicationComment.findMany({
          where: { publicationId: pub.id },
          orderBy: { createdAt: 'asc' },
        });

        if (comments.length === 0) return { comments: [] as PublicationCommentDto[] };

        // Batch: имена авторов.
        const authorIds = [...new Set(comments.map((c) => c.authorId))];
        const [users, bloggerProfiles, companyProfiles] = await Promise.all([
          deps.db.user.findMany({ where: { id: { in: authorIds } } }),
          deps.db.bloggerProfile.findMany({ where: { userId: { in: authorIds } } }),
          deps.db.companyProfile.findMany({ where: { userId: { in: authorIds } } }),
        ]);

        const userById = new Map(users.map((u) => [u.id, u]));
        const bloggerByUserId = new Map(bloggerProfiles.map((p) => [p.userId, p]));
        const companyByUserId = new Map(companyProfiles.map((p) => [p.userId, p]));

        const dtos: PublicationCommentDto[] = comments.map((c) => {
          const u = userById.get(c.authorId);
          const blogger = bloggerByUserId.get(c.authorId);
          const company = companyByUserId.get(c.authorId);
          const name = blogger?.displayName ?? company?.name ?? u?.firstName ?? '';
          return {
            id: c.id,
            author: { userId: c.authorId, name, role: u?.role ?? null },
            body: c.body,
            createdAt: c.createdAt.toISOString(),
          };
        });

        return { comments: dtos };
      },
    );

    // POST /publications/:id/comments — пользователь добавляет комментарий.
    app.post<{ Params: { id: string } }>(
      '/publications/:id/comments',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;

        const pub = await deps.db.publication.findUnique({ where: { id: req.params.id } });
        if (!pub || pub.status !== 'published') return reply.code(404).send({ error: 'Not found' });
        if (!isInAudience(user.id, user.role ?? null, pub.audienceRoles, pub.audienceUserIds)) {
          return reply.code(403).send({ error: 'Forbidden' });
        }
        if (pub.replyMode !== 'public') {
          return reply.code(409).send({ error: 'Comments are not enabled for this publication' });
        }

        const body = commentBodySchema.safeParse(req.body);
        if (!body.success) {
          return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
        }

        const comment = await deps.db.publicationComment.create({
          data: { publicationId: pub.id, authorId: user.id, body: body.data.body },
        });

        void notifyAdmins(deps.db, deps.bot, 'publication_comment', {
          publicationId: pub.id,
          ticketId: comment.id, // dedupeKey = commentId
        });

        return reply.code(201).send({ comment: { id: comment.id } });
      },
    );

    // DELETE /publications/:id/comments/:commentId — автор или администратор.
    app.delete<{ Params: { id: string; commentId: string } }>(
      '/publications/:id/comments/:commentId',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;

        const pub = await deps.db.publication.findUnique({ where: { id: req.params.id } });
        if (!pub || pub.status !== 'published') return reply.code(404).send({ error: 'Not found' });

        const comment = await deps.db.publicationComment.findUnique({ where: { id: req.params.commentId } });
        if (!comment || comment.publicationId !== pub.id) return reply.code(404).send({ error: 'Comment not found' });

        // Только автор или администратор.
        const isAdmin = adminTelegramIds.has(user.telegramId);
        const isAuthor = comment.authorId === user.id;
        if (!isAuthor && !isAdmin) return reply.code(403).send({ error: 'Forbidden' });

        await deps.db.publicationComment.delete({ where: { id: comment.id } });

        return { ok: true };
      },
    );
  };
}
