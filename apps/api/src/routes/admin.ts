import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { InputFile } from 'grammy';
import type { AppDeps, LotStatus, DisputeStatus, SavedSearchRecord, Db } from '../types';
import { requireAuth, loadAdminUser } from '../deps';
import type { AdminLotSummary, AdminBloggerBrief, AdminUserCardDto, LinkedAccount } from '@needmarket/shared';
import { deriveTier } from '@needmarket/shared';
import { fetchRatingMap } from '../serializers/rating';
import { notifyLotOwner, notifyUser } from '../services/notifications';
import { resolveDisputeSchema } from '../schemas';
import { buildBloggersXlsx } from '../services/blogger-export';
import { getPlatformSettings } from '../services/platform-settings';

// Матчинг: найти блогеров с активными сохранёнными поисками, совпадающими с лотом,
// и отправить каждому одно уведомление (дедуп по bloggerId).
async function matchSavedSearches(
  deps: AppDeps,
  lotId: string,
  lotTitle: string,
  lotCategories: string[],
  lotPlatforms: string[],
  lotBudget: number,
  budgetFilterEnabled: boolean,
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
      // Бюджет применяется только когда платформенный флаг budgetFilterEnabled=true.
      const budOk = !budgetFilterEnabled || s.minBudget == null || lotBudget >= s.minBudget;
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

// Query-схема для GET /admin/users: справочник пользователей по роли.
const adminUsersQuerySchema = z.object({
  role: z.enum(['blogger', 'company']),
  search: z.string().optional(),
  sort: z.enum(['date_desc', 'date_asc']).default('date_desc'),
});

// Batch-выборка всех блогеров с профилями + рейтингами → AdminUserCardDto[].
// Используется в GET /admin/users (с search/sort) и POST /admin/users/export (все, без фильтра).
async function fetchBloggerDtos(
  db: Db,
  opts: { search?: string; sortDir?: 'asc' | 'desc'; userId?: string } = {},
): Promise<AdminUserCardDto[]> {
  const sortDir = opts.sortDir ?? 'desc';
  const users = await db.user.findMany({
    where: {
      role: 'blogger',
      ...(opts.userId ? { id: opts.userId } : {}),
      ...(opts.search
        ? { bloggerProfile: { displayName: { contains: opts.search, mode: 'insensitive' } } }
        : {}),
    },
    orderBy: { createdAt: sortDir },
  });
  if (users.length === 0) return [];

  const userIds = users.map((u) => u.id);
  const [profiles, ratingMap] = await Promise.all([
    db.bloggerProfile.findMany({ where: { userId: { in: userIds } } }),
    fetchRatingMap(db, userIds),
  ]);
  const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

  return users.map((u) => {
    const p = profileByUserId.get(u.id);
    const rating = ratingMap.get(u.id);
    const accounts = Array.isArray(p?.linkedAccounts) ? (p!.linkedAccounts as LinkedAccount[]) : [];
    const maxFoll = accounts.reduce<number | undefined>((max, acc) => {
      if (typeof acc?.followers === 'number') {
        return max === undefined ? acc.followers : Math.max(max, acc.followers);
      }
      return max;
    }, undefined);
    return {
      userId: u.id,
      role: 'blogger',
      name: p?.displayName ?? u.firstName,
      createdAt: u.createdAt.toISOString(),
      telegramUsername: u.username ?? null,
      avatarUrl: p?.avatarFileId ? `/media/${p.avatarFileId}` : null,
      contact: p?.contact ?? null,
      ratingAvg: rating?.ratingAvg ?? null,
      ratingCount: rating?.ratingCount ?? 0,
      bio: p?.bio ?? null,
      city: p?.city ?? null,
      categories: p?.categories ?? [],
      linkedAccounts: accounts,
      tier: deriveTier(maxFoll) ?? null,
      audienceGender: p?.audienceGender ?? null,
      audienceAge: p?.audienceAge ?? null,
      audienceGeo: p?.audienceGeo ?? null,
      audienceLanguage: p?.audienceLanguage ?? null,
      reachStories: p?.reachStories ?? null,
      reachReels: p?.reachReels ?? null,
      reachPosts: p?.reachPosts ?? null,
      engagementRate: p?.engagementRate ?? null,
      statsScreenshotUrl: p?.statsScreenshotUrl ?? null,
      formats: p?.formats ?? [],
      priceStories: p?.priceStories ?? null,
      priceStoriesSeries: p?.priceStoriesSeries ?? null,
      priceReels: p?.priceReels ?? null,
      pricePost: p?.pricePost ?? null,
      priceEvent: p?.priceEvent ?? null,
      priceUgc: p?.priceUgc ?? null,
      avgPrice3m: p?.avgPrice3m ?? null,
      brandsWorkedWith: p?.brandsWorkedWith ?? null,
      bestCaseUrl: p?.bestCaseUrl ?? null,
      barterAvailable: p?.barterAvailable ?? false,
      travelAvailable: p?.travelAvailable ?? false,
      preferredAdvertiserCategories: p?.preferredAdvertiserCategories ?? [],
      phone: p?.phone ?? null,
      email: p?.email ?? null,
      birthDate: p?.birthDate?.toISOString() ?? null,
      termsAcceptedAt: p?.termsAcceptedAt?.toISOString() ?? null,
      marketingOptIn: p?.marketingOptIn ?? false,
    } satisfies AdminUserCardDto;
  });
}

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
        // Читаем флаг синхронно внутри best-effort обёртки — не блокируем активацию.
        void (async () => {
          const settings = await getPlatformSettings(deps.db);
          void matchSavedSearches(
            deps, lot.id, lot.title, lot.categories, lot.platforms, lot.budget,
            settings.budgetFilterEnabled,
          );
        })();

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

    // GET /admin/users?role=blogger|company&search=&sort=date_desc|date_asc
    // Справочник пользователей по роли. Batch: users → profiles → (для блогеров) rating.
    // Поиск по имени профиля — relation-filter на User (без N+1, без include).
    app.get('/admin/users', { preHandler: requireAuth }, async (req, reply) => {
      const admin = await loadAdminUser(deps.db, req, reply);
      if (!admin) return;

      const q = adminUsersQuerySchema.safeParse(req.query);
      if (!q.success) {
        return reply.code(400).send({ error: 'Invalid query', issues: q.error.issues });
      }

      const { role, search, sort } = q.data;
      const sortDir: 'asc' | 'desc' = sort === 'date_asc' ? 'asc' : 'desc';

      if (role === 'blogger') {
        const dtos = await fetchBloggerDtos(deps.db, { search, sortDir });
        return { users: dtos };
      }

      // role === 'company'
      const users = await deps.db.user.findMany({
        where: {
          role: 'company',
          ...(search ? { companyProfile: { name: { contains: search, mode: 'insensitive' } } } : {}),
        },
        orderBy: { createdAt: sortDir },
      });
      if (users.length === 0) return { users: [] as AdminUserCardDto[] };

      const userIds = users.map((u) => u.id);
      const profiles = await deps.db.companyProfile.findMany({ where: { userId: { in: userIds } } });
      const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

      const dtos: AdminUserCardDto[] = users.map((u) => {
        const p = profileByUserId.get(u.id);
        return {
          userId: u.id,
          role: 'company',
          name: p?.name ?? u.firstName,
          createdAt: u.createdAt.toISOString(),
          telegramUsername: u.username ?? null,
          avatarUrl: p?.logoFileId ? `/media/${p.logoFileId}` : null,
          contact: p?.contact ?? null,
          ratingAvg: null,
          ratingCount: 0,
          bio: null,
          city: p?.city ?? null,
          categories: [],
          linkedAccounts: [],
        };
      });
      return { users: dtos };
    });

    // GET /admin/users/:userId — полный профиль одного пользователя (blogger или company).
    // Admin-only: не-админ → 403. Viewer-aware фильтрация не нужна (зритель всегда админ).
    app.get<{ Params: { userId: string } }>('/admin/users/:userId', { preHandler: requireAuth }, async (req, reply) => {
      const admin = await loadAdminUser(deps.db, req, reply);
      if (!admin) return;

      const user = await deps.db.user.findUnique({ where: { id: req.params.userId } });
      if (!user) return reply.code(404).send({ error: 'Not found' });

      if (user.role === 'blogger') {
        const dtos = await fetchBloggerDtos(deps.db, { userId: user.id });
        if (dtos.length === 0) return reply.code(404).send({ error: 'Not found' });
        return { user: dtos[0] };
      }

      if (user.role === 'company') {
        const profile = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
        const dto: AdminUserCardDto = {
          userId: user.id,
          role: 'company',
          name: profile?.name ?? user.firstName,
          createdAt: user.createdAt.toISOString(),
          telegramUsername: user.username ?? null,
          avatarUrl: profile?.logoFileId ? `/media/${profile.logoFileId}` : null,
          contact: profile?.contact ?? null,
          ratingAvg: null,
          ratingCount: 0,
          bio: null,
          city: profile?.city ?? null,
          categories: [],
          linkedAccounts: [],
        };
        return { user: dto };
      }

      return reply.code(404).send({ error: 'Not found' });
    });

    // POST /admin/users/export — строит xlsx со всеми блогерами и шлёт ботом документом админу.
    // Выгружает ВСЕХ (без поискового фильтра). Ответ: { ok: true, count }.
    app.post('/admin/users/export', { preHandler: requireAuth }, async (req, reply) => {
      const admin = await loadAdminUser(deps.db, req, reply);
      if (!admin) return;

      if (!deps.bot) {
        return reply.code(503).send({ error: 'Бот недоступен — экспорт невозможен' });
      }

      const bloggers = await fetchBloggerDtos(deps.db);
      const buffer = await buildBloggersXlsx(bloggers);

      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `bloggers_export_${dateStr}.xlsx`;

      try {
        await deps.bot.api.sendDocument(
          Number(admin.telegramId),
          new InputFile(buffer, filename),
          { caption: `Выгрузка блогеров NeedMarket (${bloggers.length})` },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return reply.code(502).send({ error: `Ошибка отправки файла в Telegram: ${msg}` });
      }

      return { ok: true, count: bloggers.length };
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

    // ── Платформенные настройки ───────────────────────────────────────────────

    const patchSettingsSchema = z.object({
      budgetFilterEnabled: z.boolean(),
    });

    // GET /admin/settings — текущие платформенные настройки (только для админа).
    app.get('/admin/settings', { preHandler: requireAuth }, async (req, reply) => {
      const admin = await loadAdminUser(deps.db, req, reply);
      if (!admin) return;
      const settings = await getPlatformSettings(deps.db);
      return { settings: { budgetFilterEnabled: settings.budgetFilterEnabled } };
    });

    // PATCH /admin/settings — обновить платформенные настройки (только для админа).
    app.patch('/admin/settings', { preHandler: requireAuth }, async (req, reply) => {
      const admin = await loadAdminUser(deps.db, req, reply);
      if (!admin) return;
      const body = patchSettingsSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Expected { budgetFilterEnabled: boolean }' });
      }
      const settings = await deps.db.platformSettings.upsert({
        where: { id: 'global' },
        create: { id: 'global', budgetFilterEnabled: body.data.budgetFilterEnabled },
        update: { budgetFilterEnabled: body.data.budgetFilterEnabled },
      });
      return { settings: { budgetFilterEnabled: settings.budgetFilterEnabled } };
    });
  };
}
