import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env';

// JWT-нагрузка наших токенов.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

// Регистрируем @fastify/jwt на инстансе (декорирует req.jwtVerify / reply.jwtSign).
// Вызывается в buildApp до подключения роутов, чтобы guard и /auth их видели.
export function registerJwt(app: FastifyInstance): void {
  app.register(jwt, { secret: env.JWT_SECRET });
}

// preHandler-гард: 401 при отсутствии/невалидности токена.
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await req.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}
