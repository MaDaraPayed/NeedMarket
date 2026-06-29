import { z } from 'zod';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../types';
import { requireAuth, loadAdminUser } from '../deps';
import { supportUploadSchema, supportAttachmentSchema, ATTACHMENT_MAX_BYTES } from '../schemas';
import { resolveAudienceUserIds } from '../services/publication-audience';
import { notifyUser, notifyAdmins } from '../services/notifications';
import type {
  AdminPublicationListItemDto,
  AdminPublicationDetailDto,
  PublicationAttachmentDto,
  PublicationRatingAggregateDto,
  AdminPublicationThreadListItemDto,
  AdminPublicationThreadDto,
  PublicationThreadMessageDto,
  PublicationThreadAttachmentDto,
} from '@needmarket/shared';
import type {
  PublicationRecord,
  PublicationAttachmentRecord,
  PublicationRatingGroupRow,
  PublicationThreadMessageRecord,
  PublicationThreadAttachmentRecord,
  PublicationThreadStateRecord,
} from '../types';

// ─── Константы и схемы ────────────────────────────────────────────────────────

const ROLE_VALUES = ['blogger', 'company'] as const;
const REPLY_MODE_VALUES = ['off', 'private', 'public'] as const;

const createPublicationSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1),
  audienceRoles: z.array(z.enum(ROLE_VALUES)).default([]),
  audienceUserIds: z.array(z.string().min(1)).default([]),
  ratingsEnabled: z.boolean().default(false),
  replyMode: z.enum(REPLY_MODE_VALUES).default('off'),
  attachments: z
    .array(z.object({ fileId: z.string().min(1), fileName: z.string().min(1), mimeType: z.string().min(1) }))
    .default([]),
  publish: z.boolean().default(false),
});

const updatePublicationSchema = z.object({
  title: z.string().min(1).nullable().optional(),
  body: z.string().min(1).optional(),
  audienceRoles: z.array(z.enum(ROLE_VALUES)).optional(),
  audienceUserIds: z.array(z.string().min(1)).optional(),
  ratingsEnabled: z.boolean().optional(),
  replyMode: z.enum(REPLY_MODE_VALUES).optional(),
  attachments: z
    .array(z.object({ fileId: z.string().min(1), fileName: z.string().min(1), mimeType: z.string().min(1) }))
    .optional(),
  publish: z.boolean().optional(),
});

const adminThreadMessageBodySchema = z
  .object({
    body: z.string().max(4000).optional(),
    attachments: z.array(supportAttachmentSchema).max(10).optional(),
  })
  .refine(
    (d) => (d.body !== undefined && d.body.trim().length > 0) || (d.attachments !== undefined && d.attachments.length > 0),
    { message: 'Message must contain body or at least one attachment' },
  );

// ─── Сериализаторы ────────────────────────────────────────────────────────────

function kindFromMime(mimeType: string): 'image' | 'video' {
  return mimeType.startsWith('video/') ? 'video' : 'image';
}

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
): PublicationRatingAggregateDto {
  const row = ratingGroupMap.get(pubId);
  return {
    avgRating: row ? (row._avg.value !== null ? Math.round(row._avg.value * 10) / 10 : null) : null,
    ratingCount: row ? row._count.value : 0,
    myRating: null, // admin не ставит оценок
  };
}

function adminHasUnread(
  state: PublicationThreadStateRecord,
  lastMsg: PublicationThreadMessageRecord | undefined,
): boolean {
  const timeUnread =
    !state.lastReadByAdminAt ||
    state.lastMessageAt.getTime() > state.lastReadByAdminAt.getTime();
  return timeUnread && !!(lastMsg && !lastMsg.fromAdmin);
}

function toAdminListItem(
  p: PublicationRecord,
  attachmentCount: number,
  rating: PublicationRatingAggregateDto,
  commentCount: number,
  threadCount: number,
): AdminPublicationListItemDto {
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    audience: { roles: p.audienceRoles, explicitUserCount: p.audienceUserIds.length },
    ratingsEnabled: p.ratingsEnabled,
    replyMode: p.replyMode,
    attachmentCount,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    rating,
    commentCount,
    threadCount,
  };
}

// ─── Уведомления ─────────────────────────────────────────────────────────────

async function notifyAudience(
  deps: AppDeps,
  publicationId: string,
  title: string | null,
  audienceRoles: string[],
  audienceUserIds: string[],
): Promise<void> {
  try {
    const userIds = await resolveAudienceUserIds(deps.db, audienceRoles, audienceUserIds);
    if (userIds.length === 0) return;
    await Promise.allSettled(
      userIds.map((userId) =>
        notifyUser(deps.db, deps.bot, userId, 'publication_published', {
          lotTitle: title ?? 'Новая публикация',
          publicationId,
        }),
      ),
    );
  } catch {
    // best-effort
  }
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function adminPublicationRoutes(deps: AppDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {

    // POST /admin/publications — создать публикацию (draft или сразу publish).
    app.post('/admin/publications', { preHandler: requireAuth }, async (req, reply) => {
      const admin = await loadAdminUser(deps.db, req, reply);
      if (!admin) return;

      const body = createPublicationSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
      }

      const { title, body: text, audienceRoles, audienceUserIds, ratingsEnabled, replyMode, attachments, publish } = body.data;
      const now = new Date();
      const status = publish ? 'published' : 'draft';
      const publishedAt = publish ? now : null;

      const publication = await deps.db.$transaction(async (tx) => {
        const pub = await tx.publication.create({
          data: { authorId: admin.id, title: title ?? null, body: text, status, audienceRoles, audienceUserIds, ratingsEnabled, replyMode, publishedAt },
        });

        if (attachments.length > 0) {
          await tx.publicationAttachment.createMany({
            data: attachments.map((a) => ({
              publicationId: pub.id, fileId: a.fileId, fileName: a.fileName, mimeType: a.mimeType, kind: kindFromMime(a.mimeType),
            })),
          });
        }

        return pub;
      });

      if (publish) {
        void notifyAudience(deps, publication.id, publication.title, audienceRoles, audienceUserIds);
      }

      return reply.code(201).send({ publication: { id: publication.id, status: publication.status } });
    });

    // GET /admin/publications — список (createdAt desc) с агрегатами. Batch без N+1.
    app.get('/admin/publications', { preHandler: requireAuth }, async (req, reply) => {
      const admin = await loadAdminUser(deps.db, req, reply);
      if (!admin) return;

      const publications = await deps.db.publication.findMany({
        where: {},
        orderBy: { createdAt: 'desc' },
      });

      if (publications.length === 0) return { publications: [] as AdminPublicationListItemDto[] };

      const pubIds = publications.map((p) => p.id);

      const [allAttachments, ratingGroups, commentCounts, threadStates] = await Promise.all([
        deps.db.publicationAttachment.findMany({ where: { publicationId: { in: pubIds } } }),
        deps.db.publicationRating.groupBy({
          by: ['publicationId'],
          where: { publicationId: { in: pubIds } },
          _avg: { value: true },
          _count: { value: true },
        }),
        Promise.all(pubIds.map((id) => deps.db.publicationComment.count({ where: { publicationId: id } }))),
        deps.db.publicationThreadState.findMany
          ? Promise.all(pubIds.map((id) => deps.db.publicationThreadState.findMany({ where: { publicationId: id } })))
          : Promise.resolve(pubIds.map(() => [] as PublicationThreadStateRecord[])),
      ]);

      const attachCountById = new Map<string, number>();
      for (const a of allAttachments) {
        attachCountById.set(a.publicationId, (attachCountById.get(a.publicationId) ?? 0) + 1);
      }

      const ratingGroupMap = new Map(ratingGroups.map((r) => [r.publicationId, r]));

      const dtos: AdminPublicationListItemDto[] = publications.map((p, i) =>
        toAdminListItem(
          p,
          attachCountById.get(p.id) ?? 0,
          buildRatingDto(p.id, ratingGroupMap),
          commentCounts[i],
          (threadStates as PublicationThreadStateRecord[][])[i].length,
        ),
      );

      return { publications: dtos };
    });

    // GET /admin/publications/:id — полный DTO с агрегатами.
    app.get<{ Params: { id: string } }>(
      '/admin/publications/:id',
      { preHandler: requireAuth },
      async (req, reply) => {
        const admin = await loadAdminUser(deps.db, req, reply);
        if (!admin) return;

        const pub = await deps.db.publication.findUnique({ where: { id: req.params.id } });
        if (!pub) return reply.code(404).send({ error: 'Publication not found' });

        const [attachments, ratingGroups, commentCount, threadStates] = await Promise.all([
          deps.db.publicationAttachment.findMany({ where: { publicationId: pub.id } }),
          deps.db.publicationRating.groupBy({
            by: ['publicationId'],
            where: { publicationId: { in: [pub.id] } },
            _avg: { value: true },
            _count: { value: true },
          }),
          deps.db.publicationComment.count({ where: { publicationId: pub.id } }),
          deps.db.publicationThreadState.findMany({ where: { publicationId: pub.id } }),
        ]);

        const ratingGroupMap = new Map(ratingGroups.map((r) => [r.publicationId, r]));

        const dto: AdminPublicationDetailDto = {
          id: pub.id,
          title: pub.title,
          body: pub.body,
          status: pub.status,
          audienceRoles: pub.audienceRoles,
          audienceUserIds: pub.audienceUserIds,
          ratingsEnabled: pub.ratingsEnabled,
          replyMode: pub.replyMode,
          attachments: attachments.map(toAttachmentDto),
          publishedAt: pub.publishedAt ? pub.publishedAt.toISOString() : null,
          createdAt: pub.createdAt.toISOString(),
          rating: buildRatingDto(pub.id, ratingGroupMap),
          commentCount,
          threadCount: threadStates.length,
        };

        return { publication: dto };
      },
    );

    // PATCH /admin/publications/:id — редактировать draft; replyMode можно менять и на published.
    app.patch<{ Params: { id: string } }>(
      '/admin/publications/:id',
      { preHandler: requireAuth },
      async (req, reply) => {
        const admin = await loadAdminUser(deps.db, req, reply);
        if (!admin) return;

        const pub = await deps.db.publication.findUnique({ where: { id: req.params.id } });
        if (!pub) return reply.code(404).send({ error: 'Publication not found' });

        const body = updatePublicationSchema.safeParse(req.body);
        if (!body.success) {
          return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
        }

        const { title, body: text, audienceRoles, audienceUserIds, ratingsEnabled, replyMode, attachments, publish } = body.data;
        const isPublishing = publish === true && pub.status === 'draft';

        if (pub.status === 'published') {
          // Для опубликованных — разрешаем только смену replyMode.
          if (title !== undefined || text !== undefined || audienceRoles !== undefined ||
              audienceUserIds !== undefined || ratingsEnabled !== undefined || attachments !== undefined) {
            return reply.code(409).send({ error: 'Cannot edit a published publication (only replyMode is allowed)' });
          }
          if (replyMode !== undefined) {
            const updated = await deps.db.publication.update({
              where: { id: pub.id },
              data: { replyMode },
            });
            return { publication: { id: updated.id, status: updated.status } };
          }
          return { publication: { id: pub.id, status: pub.status } };
        }

        // draft: полное редактирование + опциональная публикация.
        const now = new Date();

        const updated = await deps.db.$transaction(async (tx) => {
          const updateData: Record<string, unknown> = {};
          if (title !== undefined) updateData.title = title;
          if (text !== undefined) updateData.body = text;
          if (audienceRoles !== undefined) updateData.audienceRoles = audienceRoles;
          if (audienceUserIds !== undefined) updateData.audienceUserIds = audienceUserIds;
          if (ratingsEnabled !== undefined) updateData.ratingsEnabled = ratingsEnabled;
          if (replyMode !== undefined) updateData.replyMode = replyMode;
          if (isPublishing) { updateData.status = 'published'; updateData.publishedAt = now; }

          const result = await tx.publication.update({ where: { id: pub.id }, data: updateData });

          if (attachments !== undefined) {
            await tx.publicationAttachment.deleteMany({ where: { publicationId: pub.id } });
            if (attachments.length > 0) {
              await tx.publicationAttachment.createMany({
                data: attachments.map((a) => ({
                  publicationId: pub.id, fileId: a.fileId, fileName: a.fileName, mimeType: a.mimeType, kind: kindFromMime(a.mimeType),
                })),
              });
            }
          }

          return result;
        });

        if (isPublishing) {
          const roles = audienceRoles ?? pub.audienceRoles;
          const userIds = audienceUserIds ?? pub.audienceUserIds;
          void notifyAudience(deps, updated.id, updated.title, roles, userIds);
        }

        return { publication: { id: updated.id, status: updated.status } };
      },
    );

    // DELETE /admin/publications/:id — каскадное удаление.
    app.delete<{ Params: { id: string } }>(
      '/admin/publications/:id',
      { preHandler: requireAuth },
      async (req, reply) => {
        const admin = await loadAdminUser(deps.db, req, reply);
        if (!admin) return;

        const pub = await deps.db.publication.findUnique({ where: { id: req.params.id } });
        if (!pub) return reply.code(404).send({ error: 'Publication not found' });

        await deps.db.publication.delete({ where: { id: pub.id } });

        return { ok: true };
      },
    );

    // POST /admin/publications/upload — загрузить медиа в Telegram-хранилище.
    app.post('/admin/publications/upload', { preHandler: requireAuth }, async (req, reply) => {
      const admin = await loadAdminUser(deps.db, req, reply);
      if (!admin) return;

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
          filename: `publication_${Date.now()}.${ext}`,
          contentType: body.data.contentType,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        req.log.error({ err }, 'publication upload: storage.put failed');
        if (/too.?large|413|file is too big/i.test(message)) {
          return reply.code(413).send({ error: 'Файл слишком большой для Telegram (макс. 48 МБ)' });
        }
        return reply.code(503).send({ error: `Ошибка загрузки медиа: ${message}` });
      }

      const kind = kindFromMime(body.data.contentType);
      return { fileId: ref.fileId, fileName: body.data.fileName, mimeType: body.data.contentType, kind };
    });

    // ─── Приватные треды (admin-сторона) ─────────────────────────────────────

    // GET /admin/publications/:id/threads — список всех тредов публикации.
    app.get<{ Params: { id: string } }>(
      '/admin/publications/:id/threads',
      { preHandler: requireAuth },
      async (req, reply) => {
        const admin = await loadAdminUser(deps.db, req, reply);
        if (!admin) return;

        const pub = await deps.db.publication.findUnique({ where: { id: req.params.id } });
        if (!pub) return reply.code(404).send({ error: 'Publication not found' });

        const states = await deps.db.publicationThreadState.findMany({ where: { publicationId: pub.id } });
        if (states.length === 0) return { threads: [] as AdminPublicationThreadListItemDto[] };

        const userIds = states.map((s) => s.userId);

        // Batch: последние сообщения по каждому треду + user profiles.
        const [allMessages, users, bloggerProfiles, companyProfiles] = await Promise.all([
          deps.db.publicationThreadMessage.findMany({
            where: { publicationId: pub.id },
            orderBy: { createdAt: 'desc' },
          }),
          deps.db.user.findMany({ where: { id: { in: userIds } } }),
          deps.db.bloggerProfile.findMany({ where: { userId: { in: userIds } } }),
          deps.db.companyProfile.findMany({ where: { userId: { in: userIds } } }),
        ]);

        // Последнее сообщение по каждому (pubId, userId).
        const lastMsgByUser = new Map<string, PublicationThreadMessageRecord>();
        const msgCountByUser = new Map<string, number>();
        for (const m of allMessages) {
          if (!lastMsgByUser.has(m.userId)) lastMsgByUser.set(m.userId, m);
          msgCountByUser.set(m.userId, (msgCountByUser.get(m.userId) ?? 0) + 1);
        }

        const userById = new Map(users.map((u) => [u.id, u]));
        const bloggerByUserId = new Map(bloggerProfiles.map((p) => [p.userId, p]));
        const companyByUserId = new Map(companyProfiles.map((p) => [p.userId, p]));

        const dtos: AdminPublicationThreadListItemDto[] = states
          .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
          .map((state) => {
            const u = userById.get(state.userId);
            const blogger = bloggerByUserId.get(state.userId);
            const company = companyByUserId.get(state.userId);
            const name = blogger?.displayName ?? company?.name ?? u?.firstName ?? '';
            const lastMsg = lastMsgByUser.get(state.userId);
            return {
              userId: state.userId,
              userName: name,
              userRole: u?.role ?? null,
              messageCount: msgCountByUser.get(state.userId) ?? 0,
              hasUnread: adminHasUnread(state, lastMsg),
              lastMessageAt: state.lastMessageAt.toISOString(),
            };
          });

        return { threads: dtos };
      },
    );

    // GET /admin/publications/:id/threads/:userId — тред конкретного пользователя.
    app.get<{ Params: { id: string; userId: string } }>(
      '/admin/publications/:id/threads/:userId',
      { preHandler: requireAuth },
      async (req, reply) => {
        const admin = await loadAdminUser(deps.db, req, reply);
        if (!admin) return;

        const pub = await deps.db.publication.findUnique({ where: { id: req.params.id } });
        if (!pub) return reply.code(404).send({ error: 'Publication not found' });

        const messages = await deps.db.publicationThreadMessage.findMany({
          where: { publicationId: pub.id, userId: req.params.userId },
          orderBy: { createdAt: 'asc' },
        });

        const messageIds = messages.map((m) => m.id);
        const [attachments, state, users, bloggerProfiles, companyProfiles] = await Promise.all([
          messageIds.length > 0
            ? deps.db.publicationThreadAttachment.findMany({ where: { messageId: { in: messageIds } } })
            : Promise.resolve([] as PublicationThreadAttachmentRecord[]),
          deps.db.publicationThreadState.findUnique({
            where: { publicationId_userId: { publicationId: pub.id, userId: req.params.userId } },
          }),
          deps.db.user.findMany({ where: { id: { in: [req.params.userId] } } }),
          deps.db.bloggerProfile.findMany({ where: { userId: { in: [req.params.userId] } } }),
          deps.db.companyProfile.findMany({ where: { userId: { in: [req.params.userId] } } }),
        ]);

        const attachsByMsg = new Map<string, PublicationThreadAttachmentRecord[]>();
        for (const a of attachments) {
          const list = attachsByMsg.get(a.messageId) ?? [];
          list.push(a);
          attachsByMsg.set(a.messageId, list);
        }

        const u = users[0];
        const blogger = bloggerProfiles[0];
        const company = companyProfiles[0];
        const name = blogger?.displayName ?? company?.name ?? u?.firstName ?? '';

        const lastMsg = messages.length > 0 ? messages[messages.length - 1] : undefined;
        const hasUnread = state ? adminHasUnread(state, lastMsg) : false;

        // Пометить прочитанным администратором.
        if (state) {
          await deps.db.publicationThreadState.update({
            where: { publicationId_userId: { publicationId: pub.id, userId: req.params.userId } },
            data: { lastReadByAdminAt: state.lastMessageAt },
          });
        }

        const dto: AdminPublicationThreadDto = {
          userId: req.params.userId,
          userName: name,
          userRole: u?.role ?? null,
          messages: messages.map((m) => toThreadMessageDto(m, attachsByMsg.get(m.id) ?? [])),
          hasUnread,
          lastMessageAt: state ? state.lastMessageAt.toISOString() : new Date(0).toISOString(),
        };

        return { thread: dto };
      },
    );

    // POST /admin/publications/:id/threads/:userId/messages — ответ администратора.
    app.post<{ Params: { id: string; userId: string } }>(
      '/admin/publications/:id/threads/:userId/messages',
      { preHandler: requireAuth },
      async (req, reply) => {
        const admin = await loadAdminUser(deps.db, req, reply);
        if (!admin) return;

        const pub = await deps.db.publication.findUnique({ where: { id: req.params.id } });
        if (!pub) return reply.code(404).send({ error: 'Publication not found' });
        if (pub.replyMode !== 'private') {
          return reply.code(409).send({ error: 'Replies are not in private mode' });
        }

        const body = adminThreadMessageBodySchema.safeParse(req.body);
        if (!body.success) {
          return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
        }

        const now = new Date();

        const message = await deps.db.$transaction(async (tx) => {
          const msg = await tx.publicationThreadMessage.create({
            data: {
              publicationId: pub.id,
              userId: req.params.userId,
              senderId: admin.id,
              fromAdmin: true,
              body: body.data.body ?? null,
            },
          });

          if (body.data.attachments && body.data.attachments.length > 0) {
            await tx.publicationThreadAttachment.createMany({
              data: body.data.attachments.map((a) => ({
                messageId: msg.id, fileId: a.fileId, fileName: a.fileName, mimeType: a.mimeType,
              })),
            });
          }

          await tx.publicationThreadState.upsert({
            where: { publicationId_userId: { publicationId: pub.id, userId: req.params.userId } },
            create: {
              publicationId: pub.id, userId: req.params.userId,
              lastMessageAt: now, lastReadByAdminAt: now,
            },
            update: { lastMessageAt: now, lastReadByAdminAt: now },
          });

          return msg;
        });

        // Уведомить пользователя (дедуп по messageId).
        void notifyUser(deps.db, deps.bot, req.params.userId, 'publication_reply_admin', {
          publicationId: pub.id,
          ticketId: message.id,
        });

        const attachments = await deps.db.publicationThreadAttachment.findMany({
          where: { messageId: message.id },
        });

        return reply.code(201).send({
          message: toThreadMessageDto(message, attachments),
        });
      },
    );
  };
}
