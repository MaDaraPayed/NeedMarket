import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db, UserRecord } from '../types';
import { adminTelegramIds } from '../env';

// Загрузка текущего пользователя по JWT (req.user.sub). Если его нет в БД —
// отправляет 404 и возвращает null (вызывающий просто делает early-return).
// Централизует повторяющийся `findUnique + 404` во всех защищённых роутах.
export async function loadAuthedUser(
  db: Db,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<UserRecord | null> {
  const user = await db.user.findUnique({ where: { id: req.user.sub } });
  if (!user) {
    reply.code(404).send({ error: 'User not found' });
    return null;
  }
  return user;
}

// Загрузка текущего пользователя с проверкой админ-привилегии.
// 403, если telegramId не входит в ADMIN_TELEGRAM_IDS.
export async function loadAdminUser(
  db: Db,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<UserRecord | null> {
  const user = await loadAuthedUser(db, req, reply);
  if (!user) return null;
  if (!adminTelegramIds.has(user.telegramId)) {
    reply.code(403).send({ error: 'Admin access required' });
    return null;
  }
  return user;
}

// Проверка роли «компания». Возвращает false и шлёт 403, если роль другая.
// Вызывается ИНЛАЙН внутри обработчика, чтобы не менять порядок проверок
// (напр. в логотипе 503 про хранилище идёт раньше — поведение сохраняется).
// message задаётся вызывающим, чтобы сообщение об ошибке было контекстным.
export function ensureCompany(reply: FastifyReply, user: UserRecord, message: string): boolean {
  if (user.role !== 'company') {
    reply.code(403).send({ error: message });
    return false;
  }
  return true;
}
