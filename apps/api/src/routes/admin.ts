import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppDeps, LotStatus, DisputeStatus, SavedSearchRecord } from '../types';
import { requireAuth, loadAdminUser } from '../deps';
import type { AdminLotSummary, AdminBloggerBrief } from '@needmarket/shared';
import { fetchRatingMap } from '../serializers/rating';
import { notifyLotOwner, notifyUser } from '../services/notifications';
import { resolveDisputeSchema } from '../schemas';

// Матчинг: найти блогеров с активными сохранёнными поисками, совпадающими с лотом,
// и отправить каждому одно уведомление (дедуп по bloggerId).
async function matchSavedSearches(
  deps: AppDeps,
  lotId: string,
  lotTitle: string,
  lotCategories: string[],
  lotPlatforms: string[],
  lotBudget: number,
): Promise<void> {
  try {
    // SQL-префильтр: isActive=true И (categories пусто ИЛИ hasSome lot.categories).
    const candidates: SavedSearchRecord[] = await deps.db.savedSearch.findMany({
      where: {
        isActive: true,
        OR: [
          { categories: { isEmpty: true } },
          { categories: { hasSome: lotCategories } },
        ],
      },
    });

    // Доводка в приложении + дедуп по bloggerId.
    const matchedBloggerIds = new Set<string>();
    for (const s of candidates) {
      const catOk = s.categories.length === 0 || s.categories.some((c) => lotCategories.includes(c));
      const platOk = s.platforms.length === 0 || s.platforms.some((p) => lotPlatforms.includes(p));
      const budOk = s.minBudget == null || lotBudget >= s.minBudget;
      if (catOk && platOk && budOk) {
        matchedBloggerIds.add(s.bloggerId);
      }
    }

    if (matchedBloggerIds.size === 0) return;

    // Batch: profili → userIds → notifyUser для каждого.
    const profiles = await deps.db.bloggerProfile.findMany({
      where: { id: { in: [...matchedBloggerIds] } },
    });
    await Promise.allSettled(
      profiles.map((p) =>
        notifyUser(deps.db, deps.bot, p.userId, 'saved_search_match', { lotId, lotTitle }),
      ),
    );
  } catch {
    // best-effort: не блокируем активацию
  }
}

// Query-схема для GET /admin/lots: фильтр по статусу.
const adminLotsQuerySchema = z.object({
  status: z
    .enum(['draft', 'awaiting_payment', 'active', 'in_progress', 'awaiting_decision', 'awaiting_payout', 'completed', 'cancelled', 'disputed'])
    .default('awaiting_payment'),
});

// Query-схема для GET /admin/disputes: фильтр по статусу.
const adminDisputesQuerySchema = z.object({
  status: z.enum(['open', 'resolved']).default('open'),
});

// Роуты администратора платформы. Все под requireAuth + loadAdminUser (403 для не-админов).
export function adminRoutes(deps: AppDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    // GET /admin/lots?status=awaiting_payment — список лотов по статусу.
    // Batch-fetch: лоты → компании → пользователи (без N+1).
    // Для awaiting_payout: дополнительно принятые отклики → профили блогеров → users.
    app.get('/admin/lots', { preHandler: requireAuth }, async (req, reply) => {
      const admin = await loadAdminUser(deps.db, req, reply);
      if (!admin) return;

      const q = adminLotsQuerySchema.safeParse(req.query);
      if (!q.success) {
        return reply.code(400).send({ error: 'Invalid query', issues: q.error.issues });
      }

      const lots = await deps.db.lot.findMany({
        where: { status: q.data.status as LotStatus },
        orderBy: { createdAt: 'desc' },
      });
      if (lots.length === 0) return { lots: [] as AdminLotSummary[] };

      // Batch: все companyProfile по lotId → userId → User
      const companyIds = [...new Set(lots.map((l) => l.companyId))];
      const companies = await deps.db.companyProfile.findMany({ where: { id: { in: companyIds } } });
      const companyById = new Map(companies.map((c) => [c.id, c]));

      const userIds = [...new Set(companies.map((c) => c.userId))];
      const users = await deps.db.user.findMany({ where: { id: { in: userIds } } });
      const userByCompanyUserId = new Map(users.map((u) => [u.id, u]));

      // Payout-обогащение: только для awaiting_payout — принятые отклики + профили блогеров.
      let acceptedBloggersByLot: Map<string, AdminBloggerBrief[]> | undefined;
      if (q.data.status === 'awaiting_payout') {
        const lotIds = lots.map((l) => l.id);
        const acceptedResponses = await deps.db.response.findMany({
          where: { lotId: { in: lotIds }, status: 'accepted' },
        });

        const bloggerIds = [...new Set(acceptedResponses.map((r) => r.bloggerId))];
        const bloggerProfiles = await deps.db.bloggerProfile.findMany({ where: { id: { in: bloggerIds } } });
        const profileById = new Map(bloggerProfiles.map((p) => [p.id, p]));

        const bloggerUserIds = [...new Set(bloggerProfiles.map((p) => p.userId))];
        const [bloggerUsers, ratingMap] = await Promise.all([
          deps.db.user.findMany({ where: { id: { in: bloggerUserIds } } }),
          fetchRatingMap(deps.db, bloggerUserIds),
        ]);
        const bloggerUsernameByUserId = new Map(bloggerUsers.map((u) => [u.id, u.username]));

        acceptedBloggersByLot = new Map();
        for (const r of acceptedResponses) {
          const profile = profileById.get(r.bloggerId);
          if (!profile) continue;
          const rating = ratingMap.get(profile.userId);
          const brief: AdminBloggerBrief = {
            id: profile.id,
            userId: profile.userId,
            displayName: profile.displayName,
            avatarUrl: profile.avatarFileId ? `/media/${profile.avatarFileId}` : null,
            bio: profile.bio,
            city: profile.city,
            categories: profile.categories,
            linkedAccounts: Array.isArray(profile.linkedAccounts) ? profile.linkedAccounts as AdminBloggerBrief['linkedAccounts'] : [],
            contact: profile.contact,
            telegramUsername: bloggerUsernameByUserId.get(profile.userId) ?? null,
            ratingAvg: rating?.ratingAvg ?? null,
            ratingCount: rating?.ratingCount ?? 0,
          };
          const list = acceptedBloggersByLot.get(r.lotId) ?? [];
          list.push(brief);
          acceptedBloggersByLot.set(r.lotId, list);
        }
      }

      const result: AdminLotSummary[] = [];
      for (const lot of lots) {
        const company = companyById.get(lot.companyId);
        if (!company) continue;
        const owner = userByCompanyUserId.get(company.userId);
        const entry: AdminLotSummary = {
          id: lot.id,
          title: lot.title,
          status: lot.status,
          budget: lot.budget,
          deadline: lot.deadline.toISOString(),
          categories: lot.categories,
          platforms: lot.platforms,
          createdAt: lot.createdAt.toISOString(),
          company: { name: company.name, contact: company.contact },
          ownerTelegramUsername: owner?.username ?? null,
        };
        if (acceptedBloggersByLot) {
          entry.commission = Math.round(lot.budget * 0.1);
          entry.payoutPool = lot.budget - entry.commission;
          entry.acceptedBloggers = acceptedBloggersByLot.get(lot.id) ?? [];
        }
        result.push(entry);
      }
      return { lots: result };
    });

    // POST /admin/lots/:id/activate — перевод awaiting_payment → active.
    app.post<{ Params: { id: string } }>(
      '/admin/lots/:id/activate',
      { preHandler: requireAuth },
      async (req, reply) => {
        const admin = await loadAdminUser(deps.db, req, reply);
        if (!admin) return;

        const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
        if (!lot) return reply.code(404).send({ error: 'Lot not found' });
        if (lot.status !== 'awaiting_payment') {
          return reply.code(409).send({
            error: `Cannot activate lot with status "${lot.status}" — expected "awaiting_payment"`,
          });
        }

        const updated = await deps.db.lot.update({
          where: { id: lot.id },
          data: { status: 'active' },
        });

        // Best-effort: уведомить владельца лота об активации.
        void notifyLotOwner(deps.db, deps.bot, lot.companyId, 'lot_activated', { lotId: lot.id, lotTitle: lot.title });

        // Fire-and-forget: матчинг с сохранёнными поисками блогеров.
        void matchSavedSearches(deps, lot.id, lot.title, lot.categories, lot.platforms, lot.budget);

        return { lot: { id: updated.id, status: updated.status } };
      },
    );

    // POST /admin/lots/:id/close — перевод awaiting_payout → completed (выплата проведена).
    app.post<{ Params: { id: string } }>(
      '/admin/lots/:id/close',
      { preHandler: requireAuth },
      async (req, reply) => {
        const admin = await loadAdminUser(deps.db, req, reply);
        if (!admin) return;

        const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
        if (!lot) return reply.code(404).send({ error: 'Lot not found' });
        if (lot.status !== 'awaiting_payout') {
          return reply.code(409).send({
            error: `Cannot close lot with status "${lot.status}" — expected "awaiting_payout"`,
          });
        }

        // Заморозка: нельзя закрыть лот при открытом споре.
        const openDisputeCount = await deps.db.dispute.count({ where: { lotId: lot.id, status: 'open' } });
        if (openDisputeCount > 0) {
          return reply.code(409).send({ error: 'Cannot close lot with an open dispute' });
        }

        const updated = await deps.db.lot.update({
          where: { id: lot.id },
          data: { status: 'completed' },
        });
        return { lot: { id: updated.id, status: updated.status } };
      },
    );

    // GET /admin/disputes?status=open|resolved (default open) — список споров для медиатора.
    // Batch-fetch: споры → лоты → response-пары → профили компании и блогера → users.
    app.get('/admin/disputes', { preHandler: requireAuth }, async (req, reply) => {
      const admin = await loadAdminUser(deps.db, req, reply);
      if (!admin) return;

      const q = adminDisputesQuerySchema.safeParse(req.query);
      if (!q.success) {
        return reply.code(400).send({ error: 'Invalid query', issues: q.error.issues });
      }

      const disputes = await deps.db.dispute.findMany({
        where: { status: q.data.status as DisputeStatus },
        orderBy: { createdAt: 'desc' },
      });
      if (disputes.length === 0) return { disputes: [] };

      // Batch: лоты, отклики, вложения.
      const lotIds = [...new Set(disputes.map((d) => d.lotId))];
      const responseIds = disputes.map((d) => d.responseId);
      const disputeIds = disputes.map((d) => d.id);

      const [lots, responses, allAttachments] = await Promise.all([
        deps.db.lot.findMany({ where: { id: { in: lotIds } } }),
        deps.db.response.findMany({ where: { id: { in: responseIds } } }),
        deps.db.disputeAttachment.findMany({ where: { disputeId: { in: disputeIds } } }),
      ]);

      const lotById = new Map(lots.map((l) => [l.id, l]));
      const responseById = new Map(responses.map((r) => [r.id, r]));

      const attachsByDisputeId = new Map<string, { fileId: string; fileName: string; mimeType: string }[]>();
      for (const a of allAttachments) {
        const list = attachsByDisputeId.get(a.disputeId) ?? [];
        list.push({ fileId: a.fileId, fileName: a.fileName, mimeType: a.mimeType });
        attachsByDisputeId.set(a.disputeId, list);
      }

      // Batch: профили компаний и блогеров.
      const companyIds = [...new Set(lots.map((l) => l.companyId))];
      const bloggerIds = [...new Set(responses.map((r) => r.bloggerId))];

      const [companyProfiles, bloggerProfiles] = await Promise.all([
        deps.db.companyProfile.findMany({ where: { id: { in: companyIds } } }),
        deps.db.bloggerProfile.findMany({ where: { id: { in: bloggerIds } } }),
      ]);

      const companyById = new Map(companyProfiles.map((c) => [c.id, c]));
      const bloggerById = new Map(bloggerProfiles.map((b) => [b.id, b]));

      // Batch: пользователи (нужны telegramUsername для обеих сторон).
      const allUserIds = [
        ...new Set([
          ...companyProfiles.map((c) => c.userId),
          ...bloggerProfiles.map((b) => b.userId),
        ]),
      ];
      const allUsers = await deps.db.user.findMany({ where: { id: { in: allUserIds } } });
      const userById = new Map(allUsers.map((u) => [u.id, u]));

      const result = [];
      for (const d of disputes) {
        const lot = lotById.get(d.lotId);
        const response = responseById.get(d.responseId);
        if (!lot || !response) continue;

        const company = companyById.get(lot.companyId);
        const blogger = bloggerById.get(response.bloggerId);
        if (!company || !blogger) continue;

        const companyUser = userById.get(company.userId);
        const bloggerUser = userById.get(blogger.userId);

        const commission = Math.round(lot.budget * 0.1);
        const atts = attachsByDisputeId.get(d.id) ?? [];

        result.push({
          id: d.id,
          lot: {
            id: lot.id,
            title: lot.title,
            budget: lot.budget,
            commission,
            payout: lot.budget - commission,
          },
          company: {
            name: company.name,
            contact: company.contact,
            telegramUsername: companyUser?.username ?? null,
          },
          blogger: {
            displayName: blogger.displayName,
            contact: blogger.contact,
            telegramUsername: bloggerUser?.username ?? null,
          },
          raisedById: d.raisedById,
          raisedByRole: d.raisedById === company.userId ? 'company' : 'blogger',
          reason: d.reason,
          description: d.description,
          attachments: atts,
          createdAt: d.createdAt.toISOString(),
          status: d.status,
          resolution: d.resolution ?? null,
          resolutionNote: d.resolutionNote ?? null,
          resolvedAt: d.resolvedAt?.toISOString() ?? null,
        });
      }

      return { disputes: result };
    });

    // POST /admin/disputes/:id/resolve — разрешение спора администратором.
    // Транзакция: Response.status меняется по исходу, Dispute → resolved.
    // Лот размораживается автоматически (count open-споров = 0 → complete/close разблокированы).
    app.post<{ Params: { id: string } }>(
      '/admin/disputes/:id/resolve',
      { preHandler: requireAuth },
      async (req, reply) => {
        const admin = await loadAdminUser(deps.db, req, reply);
        if (!admin) return;

        const body = resolveDisputeSchema.safeParse(req.body);
        if (!body.success) {
          return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
        }

        const dispute = await deps.db.dispute.findFirst({ where: { id: req.params.id } });
        if (!dispute) return reply.code(404).send({ error: 'Dispute not found' });
        if (dispute.status !== 'open') {
          return reply.code(409).send({ error: 'Dispute already resolved' });
        }

        // Все исходы → Response accepted.
        // favor_company: лот → awaiting_decision, флаг awaitingCompanyDecision=true —
        // компания обязана выбрать «Продолжить»/«Отказаться» до любых других действий.
        // favor_blogger/partial: лот остаётся in_progress, флаг не ставится.
        const isFavorCompany = body.data.resolution === 'favor_company';
        await deps.db.$transaction(async (tx) => {
          await tx.response.update({
            where: { id: dispute.responseId },
            data: { status: 'accepted' },
          });
          await tx.dispute.update({
            where: { id: dispute.id },
            data: {
              status: 'resolved',
              resolution: body.data.resolution,
              resolutionNote: body.data.note ?? null,
              resolvedById: admin.id,
              resolvedAt: new Date(),
              awaitingCompanyDecision: isFavorCompany,
            },
          });
          if (isFavorCompany) {
            await tx.lot.update({
              where: { id: dispute.lotId },
              data: { status: 'awaiting_decision' },
            });
          }
        });

        // Уведомить обе стороны (best-effort, дедуп по responseId).
        const lot = await deps.db.lot.findUnique({ where: { id: dispute.lotId } });
        const ctx = {
          lotId: dispute.lotId,
          lotTitle: lot?.title,
          responseId: dispute.responseId,
          resolution: body.data.resolution,
        };
        void notifyUser(deps.db, deps.bot, dispute.raisedById, 'dispute_resolved', ctx);
        void notifyUser(deps.db, deps.bot, dispute.againstId, 'dispute_resolved', ctx);

        return reply.code(200).send({
          dispute: { id: dispute.id, status: 'resolved', resolution: body.data.resolution },
        });
      },
    );
  };
}
