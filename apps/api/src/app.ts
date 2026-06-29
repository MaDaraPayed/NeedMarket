import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from './env';
import type { AppDeps } from './types';
import { registerJwt } from './deps';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { profileRoutes } from './routes/profile';
import { lotRoutes } from './routes/lots';
import { responseRoutes } from './routes/responses';
import { mediaRoutes } from './routes/media';
import { adminRoutes } from './routes/admin';
import { reviewRoutes } from './routes/reviews';
import { savedSearchRoutes } from './routes/saved-searches';
import { disputeRoutes } from './routes/disputes';
import { supportRoutes } from './routes/support';
import { adminSupportRoutes } from './routes/admin-support';
import { adminPublicationRoutes } from './routes/admin-publications';
import { publicationRoutes } from './routes/publications';

// Реэкспорт доменных типов: внешние импорты (`from '../src/app'`) продолжают
// работать без правок — buildApp по-прежнему точка сборки приложения.
export type {
  Role,
  LinkedAccount,
  UserRecord,
  BloggerProfileRecord,
  CompanyProfileRecord,
  StorageRef,
  Storage,
  Db,
  AppDeps,
} from './types';

// Композиция приложения: плагины (deps) + роуты по доменам. Поведение
// эндпоинтов идентично прежнему монолитному app.ts.
export function buildApp(deps: AppDeps): FastifyInstance {
  // bodyLimit 70 МБ: вложения до 48 МБ приходят base64 (~+33%) в JSON → ~64 МБ payload + запас.
  const app = Fastify({ logger: true, bodyLimit: 70 * 1024 * 1024 });

  app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization'],
  });

  // JWT-плагин до роутов — guard (requireAuth) и /auth используют его.
  registerJwt(app);

  app.register(healthRoutes);
  app.register(authRoutes(deps));
  app.register(profileRoutes(deps));
  app.register(lotRoutes(deps));
  app.register(responseRoutes(deps));
  app.register(mediaRoutes(deps));
  app.register(adminRoutes(deps));
  app.register(reviewRoutes(deps));
  app.register(savedSearchRoutes(deps));
  app.register(disputeRoutes(deps));
  app.register(supportRoutes(deps));
  app.register(adminSupportRoutes(deps));
  app.register(adminPublicationRoutes(deps));
  app.register(publicationRoutes(deps));

  return app;
}
