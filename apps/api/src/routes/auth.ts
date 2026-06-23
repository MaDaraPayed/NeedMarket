import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { validate, parse } from '@tma.js/init-data-node';
import { env } from '../env';
import type { AppDeps } from '../types';
import { authBodySchema } from '../schemas';
import { toUserDto } from '../serializers/user';

// POST /auth/telegram — криптопроверка initData → upsert User → наш JWT.
export function authRoutes(deps: AppDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    app.post('/auth/telegram', async (req, reply) => {
      const body = authBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'initData is required' });
      }

      const { initData } = body.data;

      try {
        validate(initData, env.BOT_TOKEN, { expiresIn: 3600 });
      } catch {
        return reply.code(401).send({ error: 'Invalid or expired init data' });
      }

      const data = parse(initData);
      if (!data.user) {
        return reply.code(401).send({ error: 'No user in init data' });
      }

      const tg = data.user; // поля в snake_case: first_name, username, id
      const user = await deps.db.user.upsert({
        where: { telegramId: BigInt(tg.id) },
        update: { firstName: tg.first_name, username: tg.username ?? null },
        create: { telegramId: BigInt(tg.id), firstName: tg.first_name, username: tg.username ?? null },
      });

      const token = await reply.jwtSign({ sub: user.id }, { expiresIn: '1d' });
      return { token, user: toUserDto(user) };
    });
  };
}
