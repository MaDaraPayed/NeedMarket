import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../types';
import { requireAuth, loadAuthedUser } from '../deps';
import type { ReviewDto } from '@needmarket/shared';

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
  targetId: z.string().optional(),
});

export function reviewRoutes(deps: AppDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    // POST /lots/:id/reviews — оставить отзыв на лот (auth).
    // Компания-владелец указывает targetId (userId принятого блогера).
    // Принятый блогер — target выводится сервером (userId владельца компании).
    app.post<{ Params: { id: string } }>(
      '/lots/:id/reviews',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;

        const body = createReviewSchema.safeParse(req.body);
        if (!body.success) {
          return reply.code(400).send({ error: 'Invalid review', issues: body.error.issues });
        }

        const lot = await deps.db.lot.findUnique({ where: { id: req.params.id } });
        if (!lot) return reply.code(404).send({ error: 'Lot not found' });

        if (lot.status !== 'completed') {
          return reply.code(409).send({ error: 'Reviews are only allowed on completed lots' });
        }

        // Определяем роль автора: владелец (company) или принятый блогер.
        const [company, bloggerProfile] = await Promise.all([
          deps.db.companyProfile.findUnique({ where: { userId: user.id } }),
          deps.db.bloggerProfile.findUnique({ where: { userId: user.id } }),
        ]);

        const isOwner = company && lot.companyId === company.id;

        // Принятые блогеры этого лота.
        const acceptedResponses = await deps.db.response.findMany({
          where: { lotId: lot.id, status: 'accepted' },
        });
        const acceptedBloggerIds = new Set(acceptedResponses.map((r) => r.bloggerId));

        const isAcceptedBlogger = bloggerProfile && acceptedBloggerIds.has(bloggerProfile.id);

        if (!isOwner && !isAcceptedBlogger) {
          return reply.code(403).send({ error: 'Only lot parties (owner or accepted bloggers) can leave reviews' });
        }

        let targetUserId: string;

        if (isOwner) {
          // Компания: targetId обязателен и должен быть userId одного из принятых блогеров.
          if (!body.data.targetId) {
            return reply.code(400).send({ error: 'targetId is required when reviewing as company owner' });
          }
          // Проверяем: targetId — userId принятого блогера этого лота.
          const targetProfile = await deps.db.bloggerProfile.findUnique({ where: { userId: body.data.targetId } });
          if (!targetProfile || !acceptedBloggerIds.has(targetProfile.id)) {
            return reply.code(400).send({ error: 'targetId must be the userId of an accepted blogger on this lot' });
          }
          targetUserId = body.data.targetId;
        } else {
          // Блогер: target = userId владельца компании лота (targetId из тела игнорируется).
          const [ownerCompany] = await deps.db.companyProfile.findMany({ where: { id: { in: [lot.companyId] } } });
          if (!ownerCompany) return reply.code(500).send({ error: 'Company not found' });
          targetUserId = ownerCompany.userId;

          // Валидация: если блогер указал targetId, он должен совпадать с владельцем.
          if (body.data.targetId && body.data.targetId !== targetUserId) {
            return reply.code(400).send({ error: 'As a blogger, your review target must be the lot owner' });
          }
        }

        // Проверка уникальности (lot, author, target).
        const existing = await deps.db.review.findFirst({
          where: { lotId: lot.id, authorId: user.id, targetId: targetUserId },
        });
        if (existing) {
          return reply.code(409).send({ error: 'You have already reviewed this user on this lot' });
        }

        const review = await deps.db.review.create({
          data: {
            lotId: lot.id,
            authorId: user.id,
            targetId: targetUserId,
            rating: body.data.rating,
            comment: body.data.comment ?? null,
          },
        });

        return {
          review: {
            id: review.id,
            lotId: review.lotId,
            targetId: review.targetId,
            rating: review.rating,
            comment: review.comment,
            createdAt: review.createdAt.toISOString(),
          },
        };
      },
    );

    // GET /profiles/:userId/reviews — последние отзывы О пользователе (публичный, auth).
    // Отдаёт rating, comment, createdAt, authorName (displayName блогера / name компании).
    app.get<{ Params: { userId: string } }>(
      '/profiles/:userId/reviews',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;

        const reviews = await deps.db.review.findMany({
          where: { targetId: req.params.userId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });

        if (reviews.length === 0) return { reviews: [] as ReviewDto[] };

        // Имена авторов — batch по authorId (= User.id = profile.userId).
        const authorUserIds = [...new Set(reviews.map((r) => r.authorId))];
        const [bloggerProfiles, companyProfiles] = await Promise.all([
          deps.db.bloggerProfile.findMany({ where: { userId: { in: authorUserIds } } }),
          deps.db.companyProfile.findMany({ where: { userId: { in: authorUserIds } } }),
        ]);
        const authorNameMap = new Map<string, string>();
        for (const p of bloggerProfiles) authorNameMap.set(p.userId, p.displayName);
        for (const p of companyProfiles) if (!authorNameMap.has(p.userId)) authorNameMap.set(p.userId, p.name);

        const dtos: ReviewDto[] = reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt.toISOString(),
          authorName: authorNameMap.get(r.authorId) ?? 'Аноним',
        }));

        return { reviews: dtos };
      },
    );
  };
}
