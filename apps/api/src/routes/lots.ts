import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { AppDeps, LotStatus } from '../types';
import { requireAuth, loadAuthedUser, ensureCompany } from '../deps';
import { createLotSchema, lotsQuerySchema, attachmentBodySchema, ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_COUNT } from '../schemas';
import { toLotDto, toLotDtos, toAttachmentDto } from '../serializers/lot';
import { notifyAdmins, notifyBloggers, notifyLotOwner } from '../services/notifications';

// Роуты лотов: создание (company-only), лента, детальный просмотр, свои лоты.
// Отклики/выбор/смена статуса — поздние фазы, здесь НЕ делаем.
export function lotRoutes(deps: AppDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    // POST /lots — компания создаёт лот (сразу active; оплата/эскроу — Фаза 4).
    app.post('/lots', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (!ensureCompany(reply, user, 'Only companies can create lots')) return;

      const body = createLotSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid lot', issues: body.error.issues });
      }

      const company = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
      if (!company) {
        return reply.code(400).send({ error: 'Create the company profile before creating a lot' });
      }

      const lot = await deps.db.lot.create({
        data: {
          companyId: company.id,
          title: body.data.title,
          description: body.data.description,
          categories: body.data.categories,
          platforms: body.data.platforms,
          budget: body.data.budget,
          deadline: body.data.deadline,
          requirements: body.data.requirements,
          status: 'awaiting_payment',
          slotsNeeded: body.data.slotsNeeded,
        },
      });

      // Best-effort: уведомить всех админов о новом лоте (не блокирует ответ).
      void notifyAdmins(deps.db, deps.bot, 'admin_lot_to_verify', { lotId: lot.id, lotTitle: lot.title });

      return { lot: toLotDto(lot, company) };
    });

    // GET /lots — лента активных лотов, новые сверху; фильтры category/platform; пагинация.
    // Для блогеров: добавляет hasResponded на каждый лот одним запросом; поддерживает hideResponded.
    app.get('/lots', { preHandler: requireAuth }, async (req, reply) => {
      const q = lotsQuerySchema.safeParse(req.query);
      if (!q.success) {
        return reply.code(400).send({ error: 'Invalid query', issues: q.error.issues });
      }

      // Фильтр по категориям: hasSome — лоты, чьи categories пересекаются с выбранными.
      const where: {
        status: LotStatus;
        categories?: { hasSome: string[] };
        platforms?: { has: string };
        id?: { notIn: string[] };
      } = { status: 'active' };
      if (q.data.category && q.data.category.length > 0) where.categories = { hasSome: q.data.category };
      if (q.data.platform) where.platforms = { has: q.data.platform };

      // Blogger-специфичная логика: hasResponded и hideResponded.
      let respondedIds: Set<string> | undefined;
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (user.role === 'blogger') {
        const blogger = await deps.db.bloggerProfile.findUnique({ where: { userId: user.id } });
        if (blogger) {
          const responded = await deps.db.response.findMany({ where: { bloggerId: blogger.id } });
          respondedIds = new Set(responded.map((r) => r.lotId));
          if (q.data.hideResponded && respondedIds.size > 0) {
            where.id = { notIn: [...respondedIds] };
          }
        }
      }

      const lots = await deps.db.lot.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: q.data.offset,
        take: q.data.limit,
      });
      return { lots: await toLotDtos(deps.db, lots, respondedIds) };
    });

    // GET /lots/:id — один лот детально с вложениями (видно всем авторизованным).
    app.get<{ Params: { id: string } }>('/lots/:id', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
      if (!lot) {
        return reply.code(404).send({ error: 'Lot not found' });
      }
      const [dto] = await toLotDtos(deps.db, [lot], undefined, true, user.id);
      if (!dto) {
        return reply.code(404).send({ error: 'Lot not found' });
      }
      return { lot: dto };
    });

    // POST /lots/:id/attachments — компания-владелец загружает вложение (base64).
    app.post<{ Params: { id: string } }>('/lots/:id/attachments', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (!ensureCompany(reply, user, 'Only companies can upload lot attachments')) return;

      if (!deps.storage) {
        return reply.code(503).send({ error: 'Хранилище медиа не настроено: задайте MEDIA_CHANNEL_ID в .env.' });
      }

      const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
      if (!lot) return reply.code(404).send({ error: 'Lot not found' });

      const company = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
      if (!company || lot.companyId !== company.id) {
        return reply.code(403).send({ error: 'You are not the owner of this lot' });
      }

      const body = attachmentBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid attachment body', issues: body.error.issues });
      }

      const buffer = Buffer.from(body.data.data, 'base64');
      if (buffer.length === 0) return reply.code(400).send({ error: 'Empty file' });
      if (buffer.length > ATTACHMENT_MAX_BYTES) return reply.code(400).send({ error: 'File too large (max 10 MB)' });

      const count = await deps.db.lotAttachment.count({ where: { lotId: lot.id } });
      if (count >= ATTACHMENT_MAX_COUNT) {
        return reply.code(400).send({ error: `Max ${ATTACHMENT_MAX_COUNT} attachments per lot` });
      }

      const isImage = body.data.contentType.startsWith('image/');
      const ext = body.data.contentType.split('/')[1]?.replace('vnd.openxmlformats-officedocument.', '').split('.')[0] ?? 'bin';
      const ref = await deps.storage.put(buffer, {
        filename: `lot_${lot.id}_att_${Date.now()}.${ext}`,
        contentType: body.data.contentType,
      });

      const attachment = await deps.db.lotAttachment.create({
        data: {
          lotId: lot.id,
          fileId: ref.fileId,
          msgId: ref.messageId ?? null,
          contentType: body.data.contentType,
          fileName: isImage ? null : (body.data.fileName ?? null),
          position: count,
        },
      });

      return { attachment: toAttachmentDto(attachment) };
    });

    // DELETE /lots/:id/attachments/:attachmentId — компания-владелец удаляет вложение.
    app.delete<{ Params: { id: string; attachmentId: string } }>(
      '/lots/:id/attachments/:attachmentId',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;
        if (!ensureCompany(reply, user, 'Only companies can delete lot attachments')) return;

        const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
        if (!lot) return reply.code(404).send({ error: 'Lot not found' });

        const company = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
        if (!company || lot.companyId !== company.id) {
          return reply.code(403).send({ error: 'You are not the owner of this lot' });
        }

        const att = await deps.db.lotAttachment.findUnique({ where: { id: req.params.attachmentId } });
        if (!att || att.lotId !== lot.id) {
          return reply.code(404).send({ error: 'Attachment not found' });
        }

        await deps.db.lotAttachment.delete({ where: { id: att.id } });
        return reply.code(204).send();
      },
    );

    // POST /lots/:id/complete — компания-владелец сообщает, что проект выполнен.
    // Разрешено из active/in_progress при наличии ≥1 принятого отклика.
    // Переводит лот в awaiting_payout; оставшиеся pending → rejected. DM-уведомление админам.
    app.post<{ Params: { id: string } }>('/lots/:id/complete', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (!ensureCompany(reply, user, 'Only companies can complete lots')) return;

      const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
      if (!lot) return reply.code(404).send({ error: 'Lot not found' });

      const company = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
      if (!company || lot.companyId !== company.id) {
        return reply.code(403).send({ error: 'You are not the owner of this lot' });
      }

      // Гейт: нельзя завершить лот пока компания не приняла решение по спорному блогеру.
      if (lot.status === 'awaiting_decision') {
        return reply.code(409).send({ error: 'Сначала примите решение по спорному блогеру' });
      }
      if (lot.status !== 'active' && lot.status !== 'in_progress') {
        return reply.code(409).send({
          error: `Cannot complete lot with status "${lot.status}" — expected "active" or "in_progress"`,
        });
      }

      // Заморозка: нельзя завершить лот при открытом споре.
      const openDisputeCount = await deps.db.dispute.count({ where: { lotId: lot.id, status: 'open' } });
      if (openDisputeCount > 0) {
        return reply.code(409).send({ error: 'Cannot complete lot with an open dispute' });
      }

      const accepted = await deps.db.response.findMany({
        where: { lotId: lot.id, status: 'accepted' },
      });
      if (accepted.length === 0) {
        return reply.code(409).send({ error: 'Cannot complete lot with no accepted responses' });
      }

      // Сохраняем pending до транзакции, чтобы знать, кого уведомить о rejected.
      const pendingBefore = await deps.db.response.findMany({
        where: { lotId: lot.id, status: 'pending' },
      });

      const updated = await deps.db.$transaction(async (tx) => {
        await tx.response.updateMany({
          where: { lotId: lot.id, status: 'pending' },
          data: { status: 'rejected' },
        });
        return tx.lot.update({ where: { id: lot.id }, data: { status: 'awaiting_payout' } });
      });

      // Best-effort уведомления (fire-and-forget, после коммита).
      const notifyCtx = { lotId: lot.id, lotTitle: lot.title };
      void notifyBloggers(deps.db, deps.bot, accepted.map((r) => r.bloggerId), 'lot_completed', notifyCtx);
      if (pendingBefore.length > 0) {
        void notifyBloggers(deps.db, deps.bot, pendingBefore.map((r) => r.bloggerId), 'response_rejected', notifyCtx);
      }
      void notifyAdmins(deps.db, deps.bot, 'admin_lot_to_payout', notifyCtx);

      return { lot: { id: updated.id, status: updated.status } };
    });

    // DELETE /lots/:id — компания-владелец удаляет лот.
    // Разрешено только для awaiting_payment/active; in_progress и позже — 409.
    // Каскад в БД чистит responses/attachments/disputes/reviews автоматически.
    app.delete<{ Params: { id: string } }>('/lots/:id', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (!ensureCompany(reply, user, 'Only companies can delete lots')) return;

      const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
      if (!lot) return reply.code(404).send({ error: 'Lot not found' });

      const company = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
      if (!company || company.id !== lot.companyId) {
        return reply.code(403).send({ error: 'You do not own this lot' });
      }

      if (lot.status !== 'awaiting_payment' && lot.status !== 'active') {
        return reply.code(409).send({
          error: `Cannot delete lot with status "${lot.status}" — only awaiting_payment and active lots can be deleted`,
        });
      }

      // Уведомить pending-блогеров ДО удаления (best-effort, no deeplink).
      if (lot.status === 'active') {
        const pendingResponses = await deps.db.response.findMany({
          where: { lotId: lot.id, status: 'pending' },
        });
        if (pendingResponses.length > 0) {
          void notifyBloggers(
            deps.db,
            deps.bot,
            pendingResponses.map((r) => r.bloggerId),
            'lot_withdrawn',
            { lotTitle: lot.title },
          );
        }
      }

      await deps.db.lot.delete({ where: { id: lot.id } });
      return reply.code(200).send({ lot: { id: lot.id } });
    });

    // GET /me/lots — лоты текущей компании со статусами.
    app.get('/me/lots', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (!ensureCompany(reply, user, 'Only companies have lots')) return;

      const company = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
      if (!company) {
        return { lots: [] };
      }

      const lots = await deps.db.lot.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: 'desc' },
      });
      return { lots: await toLotDtos(deps.db, lots) };
    });
  };
}
