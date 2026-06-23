import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../types';
import { requireAuth, loadAuthedUser } from '../deps';
import { createDisputeSchema } from '../schemas';
import { notifyUser, notifyAdmins } from '../services/notifications';
import type { DisputeDto } from '@needmarket/shared';

function toDisputeDto(d: {
  id: string;
  lotId: string;
  responseId: string;
  raisedById: string;
  againstId: string;
  reason: string;
  description: string;
  status: string;
  resolution: string | null;
  createdAt: Date;
}): DisputeDto {
  return {
    id: d.id,
    lotId: d.lotId,
    responseId: d.responseId,
    raisedById: d.raisedById,
    againstId: d.againstId,
    reason: d.reason as DisputeDto['reason'],
    description: d.description,
    status: d.status as DisputeDto['status'],
    resolution: d.resolution as DisputeDto['resolution'],
    createdAt: d.createdAt.toISOString(),
  };
}

// Роуты споров: открытие спора участником пары.
// Разрешение спора — POST /admin/disputes/:id/resolve (admin.ts).
export function disputeRoutes(deps: AppDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    // POST /lots/:id/disputes — участник пары открывает спор.
    app.post<{ Params: { id: string } }>(
      '/lots/:id/disputes',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;

        const body = createDisputeSchema.safeParse(req.body);
        if (!body.success) {
          return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
        }

        // 1. Лот существует.
        const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
        if (!lot) return reply.code(404).send({ error: 'Lot not found' });

        // 2. Лот в статусе in_progress или awaiting_payout.
        if (lot.status !== 'in_progress' && lot.status !== 'awaiting_payout') {
          return reply.code(409).send({
            error: `Cannot open dispute for lot with status "${lot.status}" — expected "in_progress" or "awaiting_payout"`,
          });
        }

        // 3. Response существует и принадлежит лоту.
        const response = await deps.db.response.findUnique({ where: { id: body.data.responseId } });
        if (!response || response.lotId !== lot.id) {
          return reply.code(404).send({ error: 'Response not found for this lot' });
        }

        // 4. Response.status === 'accepted' (не pending, rejected, disputed).
        if (response.status !== 'accepted') {
          return reply.code(409).send({
            error: `Cannot open dispute for response with status "${response.status}" — expected "accepted"`,
          });
        }

        // 5. Вызывающий — участник пары: владелец лота (company) ИЛИ блогер этого response.
        const companyProfile = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
        const bloggerProfile = await deps.db.bloggerProfile.findUnique({ where: { userId: user.id } });

        const isCompanyOwner = companyProfile !== null && companyProfile.id === lot.companyId;
        const isBlogger = bloggerProfile !== null && bloggerProfile.id === response.bloggerId;

        if (!isCompanyOwner && !isBlogger) {
          return reply.code(403).send({ error: 'You are not a participant of this response pair' });
        }

        // 6. По этому response ещё нет Dispute.
        const existing = await deps.db.dispute.findFirst({ where: { responseId: response.id } });
        if (existing) {
          return reply.code(409).send({ error: 'Dispute already exists for this response' });
        }

        // Вычисляем againstId: raiser = company → against = blogger; raiser = blogger → against = company.
        let raisedById: string;
        let againstId: string;

        if (isCompanyOwner) {
          const bloggerProfiles = await deps.db.bloggerProfile.findMany({
            where: { id: { in: [response.bloggerId] } },
          });
          const bloggerUser = bloggerProfiles[0];
          if (!bloggerUser) {
            return reply.code(404).send({ error: 'Blogger profile not found' });
          }
          raisedById = user.id;
          againstId = bloggerUser.userId;
        } else {
          const companyProfiles = await deps.db.companyProfile.findMany({
            where: { id: { in: [lot.companyId] } },
          });
          const companyUser = companyProfiles[0];
          if (!companyUser) {
            return reply.code(404).send({ error: 'Company profile not found' });
          }
          raisedById = user.id;
          againstId = companyUser.userId;
        }

        // Транзакция: Dispute.create + вложения (batch) + Response.status → disputed.
        const dispute = await deps.db.$transaction(async (tx) => {
          const created = await tx.dispute.create({
            data: {
              lotId: lot.id,
              responseId: response.id,
              raisedById,
              againstId,
              reason: body.data.reason,
              description: body.data.description,
            },
          });

          if (body.data.attachments && body.data.attachments.length > 0) {
            await tx.disputeAttachment.createMany({
              data: body.data.attachments.map((a) => ({
                disputeId: created.id,
                fileId: a.fileId,
                fileName: a.fileName,
                mimeType: a.mimeType,
              })),
            });
          }

          await tx.response.update({
            where: { id: response.id },
            data: { status: 'disputed' },
          });

          return created;
        });

        // Уведомление второй стороне и всем админам (best-effort, дедуп по responseId).
        void notifyUser(deps.db, deps.bot, againstId, 'dispute_opened', {
          lotId: lot.id,
          lotTitle: lot.title,
          responseId: response.id,
        });
        void notifyAdmins(deps.db, deps.bot, 'admin_dispute', {
          lotId: lot.id,
          lotTitle: lot.title,
          responseId: response.id,
        });

        return reply.code(201).send({ dispute: toDisputeDto(dispute) });
      },
    );
  };
}
