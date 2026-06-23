import type { FastifyInstance } from 'fastify';

// GET /health — простой liveness-пробник.
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ ok: true }));
}
