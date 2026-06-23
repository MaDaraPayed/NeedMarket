import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CATEGORIES, PLATFORMS } from '@needmarket/shared';
import type { AppDeps } from '../types';
import { requireAuth, loadAuthedUser } from '../deps';
import type { SavedSearchDto } from '@needmarket/shared';

const MAX_SAVED_SEARCHES = 20;

const createSavedSearchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  categories: z.array(z.enum(CATEGORIES)).default([]),
  platforms: z.array(z.enum(PLATFORMS)).default([]),
  minBudget: z.number().int().nonnegative().nullable().optional(),
});

const updateSavedSearchSchema = z.object({
  name: z.string().min(1).max(100).nullable().optional(),
  categories: z.array(z.enum(CATEGORIES)).optional(),
  platforms: z.array(z.enum(PLATFORMS)).optional(),
  minBudget: z.number().int().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
});

function toDto(r: {
  id: string; bloggerId: string; name: string | null;
  categories: string[]; platforms: string[]; minBudget: number | null;
  isActive: boolean; createdAt: Date;
}): SavedSearchDto {
  return {
    id: r.id,
    bloggerId: r.bloggerId,
    name: r.name,
    categories: r.categories,
    platforms: r.platforms,
    minBudget: r.minBudget,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  };
}

export function savedSearchRoutes(deps: AppDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    // GET /me/saved-searches — список сохранённых поисков блогера.
    app.get('/me/saved-searches', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (user.role !== 'blogger') return reply.code(403).send({ error: 'Only bloggers can use saved searches' });

      const profile = await deps.db.bloggerProfile.findUnique({ where: { userId: user.id } });
      if (!profile) return reply.code(400).send({ error: 'Create your blogger profile first' });

      const searches = await deps.db.savedSearch.findMany({
        where: { bloggerId: profile.id },
        orderBy: { createdAt: 'desc' },
      });
      return { savedSearches: searches.map(toDto) };
    });

    // POST /me/saved-searches — создать поиск (лимит 20).
    app.post('/me/saved-searches', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (user.role !== 'blogger') return reply.code(403).send({ error: 'Only bloggers can use saved searches' });

      const body = createSavedSearchSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'Invalid input', issues: body.error.issues });

      const profile = await deps.db.bloggerProfile.findUnique({ where: { userId: user.id } });
      if (!profile) return reply.code(400).send({ error: 'Create your blogger profile first' });

      const count = await deps.db.savedSearch.count({ where: { bloggerId: profile.id } });
      if (count >= MAX_SAVED_SEARCHES) {
        return reply.code(400).send({ error: `Saved searches limit reached (max ${MAX_SAVED_SEARCHES})` });
      }

      const search = await deps.db.savedSearch.create({
        data: {
          bloggerId: profile.id,
          name: body.data.name ?? null,
          categories: body.data.categories,
          platforms: body.data.platforms,
          minBudget: body.data.minBudget != null ? body.data.minBudget : null,
        },
      });
      return reply.code(201).send({ savedSearch: toDto(search) });
    });

    // PATCH /me/saved-searches/:id — обновить поиск.
    app.patch<{ Params: { id: string } }>(
      '/me/saved-searches/:id',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;
        if (user.role !== 'blogger') return reply.code(403).send({ error: 'Only bloggers can use saved searches' });

        const body = updateSavedSearchSchema.safeParse(req.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid input', issues: body.error.issues });

        const profile = await deps.db.bloggerProfile.findUnique({ where: { userId: user.id } });
        if (!profile) return reply.code(400).send({ error: 'Create your blogger profile first' });

        const existing = await deps.db.savedSearch.findUnique({ where: { id: req.params.id } });
        if (!existing) return reply.code(404).send({ error: 'Saved search not found' });
        if (existing.bloggerId !== profile.id) return reply.code(403).send({ error: 'Access denied' });

        const updated = await deps.db.savedSearch.update({
          where: { id: req.params.id },
          data: body.data,
        });
        return { savedSearch: toDto(updated) };
      },
    );

    // DELETE /me/saved-searches/:id — удалить поиск.
    app.delete<{ Params: { id: string } }>(
      '/me/saved-searches/:id',
      { preHandler: requireAuth },
      async (req, reply) => {
        const user = await loadAuthedUser(deps.db, req, reply);
        if (!user) return;
        if (user.role !== 'blogger') return reply.code(403).send({ error: 'Only bloggers can use saved searches' });

        const profile = await deps.db.bloggerProfile.findUnique({ where: { userId: user.id } });
        if (!profile) return reply.code(400).send({ error: 'Create your blogger profile first' });

        const existing = await deps.db.savedSearch.findUnique({ where: { id: req.params.id } });
        if (!existing) return reply.code(404).send({ error: 'Saved search not found' });
        if (existing.bloggerId !== profile.id) return reply.code(403).send({ error: 'Access denied' });

        await deps.db.savedSearch.delete({ where: { id: req.params.id } });
        return reply.code(204).send();
      },
    );
  };
}
