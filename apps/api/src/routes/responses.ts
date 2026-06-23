import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../types';
import { requireAuth, loadAuthedUser, ensureCompany } from '../deps';
import { createResponseSchema } from '../schemas';
import { toResponseDto, toResponseDtosWithBlogger, toResponseDtosWithLot } from '../serializers/response';
import { notifyLotOwner, notifyBloggers } from '../services/notifications';

// Роуты откликов: создание (blogger), просмотр (company-владелец), «мои отклики» (blogger),
// выбор/отклонение (company). Множественный выбор: лот набирает slotsNeeded блогеров.
export function responseRoutes(deps: AppDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    // POST /lots/:id/responses — блогер откликается на активный лот.
    app.post<{ Params: { id: string } }>(
      '/lots/:id/responses',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;
        if (user.role !== 'blogger') {
          return reply.code(403).send({ error: 'Only bloggers can respond to lots' });
        }

        const body = createResponseSchema.safeParse(req.body);
        if (!body.success) {
          return reply.code(400).send({ error: 'Invalid request', issues: body.error.issues });
        }

        const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
        if (!lot) return reply.code(404).send({ error: 'Lot not found' });
        if (lot.status !== 'active') return reply.code(400).send({ error: 'Lot is not active' });

        const blogger = await deps.db.bloggerProfile.findUnique({ where: { userId: user.id } });
        if (!blogger) {
          return reply.code(400).send({ error: 'Create the blogger profile before responding' });
        }

        const existing = await deps.db.response.findUnique({
          where: { lotId_bloggerId: { lotId: lot.id, bloggerId: blogger.id } },
        });
        if (existing) return reply.code(409).send({ error: 'Already responded to this lot' });

        const response = await deps.db.response.create({
          data: { lotId: lot.id, bloggerId: blogger.id, message: body.data.message },
        });

        // Best-effort: уведомить владельца лота о новом отклике.
        void notifyLotOwner(deps.db, deps.bot, lot.companyId, 'new_response', { lotId: lot.id, lotTitle: lot.title });

        return { response: toResponseDto(response) };
      },
    );

    // GET /lots/:id/responses — компания-владелец видит все отклики с инфой блогера.
    // Порядок: принятые/ожидающие по createdAt asc, отклонённые в конце.
    app.get<{ Params: { id: string } }>(
      '/lots/:id/responses',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;
        if (!ensureCompany(reply, user, 'Only the lot owner can view responses')) return;

        const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
        if (!lot) return reply.code(404).send({ error: 'Lot not found' });

        const company = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
        if (!company || company.id !== lot.companyId) {
          return reply.code(403).send({ error: 'Not your lot' });
        }

        const all = await deps.db.response.findMany({
          where: { lotId: lot.id },
          orderBy: { createdAt: 'asc' },
        });
        // Отклонённые — в конец; остальные сохраняют createdAt-порядок.
        const sorted = [
          ...all.filter((r) => r.status !== 'rejected'),
          ...all.filter((r) => r.status === 'rejected'),
        ];
        const acceptedCount = all.filter((r) => r.status === 'accepted' || r.status === 'disputed').length;

        // Batch: статусы споров по responseId (без N+1).
        const disputes = await deps.db.dispute.findMany({ where: { lotId: lot.id } });
        const disputeByResponseId = new Map<string, 'open' | 'resolved'>();
        const resolvedFavorCompanyIds = new Set<string>();
        const awaitingDecisionIds = new Set<string>();
        for (const d of disputes) {
          disputeByResponseId.set(d.responseId, d.status);
          if (d.status === 'resolved' && d.resolution === 'favor_company') {
            resolvedFavorCompanyIds.add(d.responseId);
            if (d.awaitingCompanyDecision) {
              awaitingDecisionIds.add(d.responseId);
            }
          }
        }

        return {
          slotsNeeded: lot.slotsNeeded,
          acceptedCount,
          responses: await toResponseDtosWithBlogger(deps.db, sorted, disputeByResponseId, resolvedFavorCompanyIds, awaitingDecisionIds),
        };
      },
    );

    // GET /me/responses — отклики текущего блогера со статусами.
    app.get('/me/responses', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (user.role !== 'blogger') {
        return reply.code(403).send({ error: 'Only bloggers have responses' });
      }

      const blogger = await deps.db.bloggerProfile.findUnique({ where: { userId: user.id } });
      if (!blogger) return { responses: [] };

      const responses = await deps.db.response.findMany({
        where: { bloggerId: blogger.id },
        orderBy: { createdAt: 'desc' },
      });

      // Batch: статусы споров по responseId.
      let disputeByResponseId: Map<string, 'open' | 'resolved'> | undefined;
      if (responses.length > 0) {
        const disputes = await deps.db.dispute.findMany({
          where: { responseId: { in: responses.map((r) => r.id) } },
        });
        disputeByResponseId = new Map();
        for (const d of disputes) {
          disputeByResponseId.set(d.responseId, d.status);
        }
      }

      return { responses: await toResponseDtosWithLot(deps.db, responses, disputeByResponseId) };
    });

    // POST /lots/:id/responses/:responseId/accept — компания-владелец принимает отклик.
    // Транзакция: response → accepted; если набрано slotsNeeded → остальные pending → rejected,
    // лот → in_progress. Иначе лот остаётся active (продолжает принимать отклики).
    app.post<{ Params: { id: string; responseId: string } }>(
      '/lots/:id/responses/:responseId/accept',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;
        if (!ensureCompany(reply, user, 'Only companies can accept responses')) return;

        const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
        if (!lot) return reply.code(404).send({ error: 'Lot not found' });
        // Гейт: нельзя принимать отклики пока лот ожидает решения по спору.
        if (lot.status === 'awaiting_decision') {
          return reply.code(409).send({ error: 'Сначала примите решение по спорному блогеру' });
        }
        if (lot.status !== 'active') return reply.code(400).send({ error: 'Lot is not active' });

        const company = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
        if (!company || company.id !== lot.companyId) {
          return reply.code(403).send({ error: 'Not your lot' });
        }

        const response = await deps.db.response.findUnique({ where: { id: req.params.responseId } });
        if (!response || response.lotId !== lot.id) {
          return reply.code(404).send({ error: 'Response not found' });
        }
        if (response.status !== 'pending') {
          return reply.code(400).send({ error: 'Response is not pending' });
        }

        // Проверяем, не заполнены ли уже все слоты (на случай гонки).
        const alreadyAccepted = await deps.db.response.findMany({
          where: { lotId: lot.id, status: 'accepted' },
        });
        if (alreadyAccepted.length >= lot.slotsNeeded) {
          return reply.code(400).send({ error: 'All slots are already filled' });
        }

        // Сохраняем pending (кроме принимаемого) до транзакции — для авто-reject уведомлений.
        const otherPending = await deps.db.response.findMany({
          where: { lotId: lot.id, status: 'pending' },
        }).then((rs) => rs.filter((r) => r.id !== response.id));

        const updatedLot = await deps.db.$transaction(async (tx) => {
          await tx.response.update({ where: { id: response.id }, data: { status: 'accepted' } });

          // Считаем accepted внутри транзакции (уже включает только что принятый).
          const acceptedNow = await tx.response.findMany({
            where: { lotId: lot.id, status: 'accepted' },
          });

          if (acceptedNow.length >= lot.slotsNeeded) {
            // Слоты заполнены: остальные pending → rejected, лот → in_progress.
            await tx.response.updateMany({
              where: { lotId: lot.id, status: 'pending' },
              data: { status: 'rejected' },
            });
            return tx.lot.update({ where: { id: lot.id }, data: { status: 'in_progress' } });
          }
          // Слоты ещё не заполнены — лот остаётся active.
          return lot;
        });

        // Best-effort уведомления (fire-and-forget, после коммита).
        const notifyCtx = { lotId: lot.id, lotTitle: lot.title };
        void notifyBloggers(deps.db, deps.bot, [response.bloggerId], 'response_accepted', notifyCtx);
        // Авто-reject: только если слоты заполнились (лот перешёл в in_progress).
        if (updatedLot.status === 'in_progress' && otherPending.length > 0) {
          void notifyBloggers(deps.db, deps.bot, otherPending.map((r) => r.bloggerId), 'response_rejected', notifyCtx);
        }

        return { lot: { id: updatedLot.id, status: updatedLot.status, slotsNeeded: lot.slotsNeeded } };
      },
    );

    // POST /lots/:id/responses/:responseId/reject — компания-владелец отклоняет отклик.
    app.post<{ Params: { id: string; responseId: string } }>(
      '/lots/:id/responses/:responseId/reject',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;
        if (!ensureCompany(reply, user, 'Only companies can reject responses')) return;

        const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
        if (!lot) return reply.code(404).send({ error: 'Lot not found' });
        if (lot.status !== 'active') return reply.code(400).send({ error: 'Lot is not active' });

        const company = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
        if (!company || company.id !== lot.companyId) {
          return reply.code(403).send({ error: 'Not your lot' });
        }

        const response = await deps.db.response.findUnique({ where: { id: req.params.responseId } });
        if (!response || response.lotId !== lot.id) {
          return reply.code(404).send({ error: 'Response not found' });
        }
        if (response.status !== 'pending') {
          return reply.code(400).send({ error: 'Response is not pending' });
        }

        const updated = await deps.db.response.update({
          where: { id: response.id },
          data: { status: 'rejected' },
        });

        // Best-effort: уведомить блогера об отклонении.
        void notifyBloggers(deps.db, deps.bot, [response.bloggerId], 'response_rejected', { lotId: lot.id, lotTitle: lot.title });

        return { response: toResponseDto(updated) };
      },
    );

    // POST /lots/:id/responses/:responseId/reject-after-dispute
    // Компания отклоняет блогера в окне ожидания (awaitingCompanyDecision=true).
    // Гард: accepted + resolved favor_company + awaitingCompanyDecision=true.
    // Эффект: response → rejected; флаг=false; пересчёт слотов → лот active или in_progress.
    app.post<{ Params: { id: string; responseId: string } }>(
      '/lots/:id/responses/:responseId/reject-after-dispute',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;
        if (!ensureCompany(reply, user, 'Only companies can reject responses')) return;

        const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
        if (!lot) return reply.code(404).send({ error: 'Lot not found' });

        const company = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
        if (!company || company.id !== lot.companyId) {
          return reply.code(403).send({ error: 'Not your lot' });
        }

        const response = await deps.db.response.findUnique({ where: { id: req.params.responseId } });
        if (!response || response.lotId !== lot.id) {
          return reply.code(404).send({ error: 'Response not found' });
        }
        if (response.status !== 'accepted') {
          return reply.code(409).send({
            error: `Cannot reject: response status is "${response.status}", expected "accepted"`,
          });
        }

        // Гард: по этому response есть resolved dispute с resolution=favor_company.
        const dispute = await deps.db.dispute.findFirst({
          where: { responseId: response.id, status: 'resolved' },
        });
        if (!dispute || dispute.resolution !== 'favor_company') {
          return reply.code(409).send({
            error: 'No resolved favor_company dispute for this response',
          });
        }
        // Гард: окно решения должно быть открыто.
        if (!dispute.awaitingCompanyDecision) {
          return reply.code(409).send({ error: 'Decision window is already closed' });
        }

        // Атомарно: response → rejected, флаг=false, пересчёт слотов, лот → active/in_progress.
        const updated = await deps.db.$transaction(async (tx) => {
          const resp = await tx.response.update({
            where: { id: response.id },
            data: { status: 'rejected' },
          });
          await tx.dispute.update({
            where: { id: dispute.id },
            data: { awaitingCompanyDecision: false },
          });
          const occupied = await tx.response.findMany({
            where: { lotId: lot.id, status: { in: ['accepted', 'disputed'] } },
          });
          const newLotStatus = occupied.length === 0 ? 'active' : 'in_progress';
          await tx.lot.update({ where: { id: lot.id }, data: { status: newLotStatus } });
          return resp;
        });

        // Best-effort: уведомить блогера.
        void notifyBloggers(deps.db, deps.bot, [response.bloggerId], 'response_rejected', { lotId: lot.id, lotTitle: lot.title });

        return { response: toResponseDto(updated) };
      },
    );

    // POST /lots/:id/responses/:responseId/continue-after-dispute
    // Компания выбирает «Продолжить» — блогер остаётся, лот возвращается в in_progress.
    // Гард: accepted + resolved favor_company + awaitingCompanyDecision=true (одноразово).
    app.post<{ Params: { id: string; responseId: string } }>(
      '/lots/:id/responses/:responseId/continue-after-dispute',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;
        if (!ensureCompany(reply, user, 'Only companies can make this decision')) return;

        const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
        if (!lot) return reply.code(404).send({ error: 'Lot not found' });

        const company = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
        if (!company || company.id !== lot.companyId) {
          return reply.code(403).send({ error: 'Not your lot' });
        }

        const response = await deps.db.response.findUnique({ where: { id: req.params.responseId } });
        if (!response || response.lotId !== lot.id) {
          return reply.code(404).send({ error: 'Response not found' });
        }
        if (response.status !== 'accepted') {
          return reply.code(409).send({
            error: `Cannot continue: response status is "${response.status}", expected "accepted"`,
          });
        }

        const dispute = await deps.db.dispute.findFirst({
          where: { responseId: response.id, status: 'resolved' },
        });
        if (!dispute || dispute.resolution !== 'favor_company') {
          return reply.code(409).send({
            error: 'No resolved favor_company dispute for this response',
          });
        }
        if (!dispute.awaitingCompanyDecision) {
          return reply.code(409).send({ error: 'Decision window is already closed' });
        }

        // Атомарно: флаг=false, лот awaiting_decision → in_progress. Response остаётся accepted.
        await deps.db.$transaction(async (tx) => {
          await tx.dispute.update({
            where: { id: dispute.id },
            data: { awaitingCompanyDecision: false },
          });
          await tx.lot.update({ where: { id: lot.id }, data: { status: 'in_progress' } });
        });

        return { lot: { id: lot.id, status: 'in_progress' } };
      },
    );
  };
}
