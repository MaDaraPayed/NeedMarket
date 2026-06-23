import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import type { Db } from '../types';
import { adminTelegramIds, env } from '../env';

export type NotificationType =
  | 'new_response'
  | 'response_accepted'
  | 'response_rejected'
  | 'lot_completed'
  | 'lot_activated'
  | 'lot_withdrawn'
  | 'admin_lot_to_verify'
  | 'admin_lot_to_payout'
  | 'saved_search_match'
  | 'dispute_opened'
  | 'admin_dispute'
  | 'dispute_resolved'
  | 'support_new_ticket'
  | 'support_user_reply'
  | 'support_admin_reply'
  | 'support_ticket_closed';

interface NotifyCtx {
  lotId?: string;
  lotTitle?: string;
  // Если задан — используется как dedupeKey вместо lotId (для спор-событий).
  responseId?: string;
  // Для dispute_resolved: передаётся исход в текст уведомления.
  resolution?: string;
  // Для support-событий: используется как dedupeKey (ticketId или messageId).
  ticketId?: string;
  // Для support_admin_reply / support_ticket_closed: реальный ID тикета для диплинка.
  linkTicketId?: string;
}

function buildText(type: NotificationType, ctx: NotifyCtx): string {
  const t = ctx.lotTitle ?? 'лот';
  switch (type) {
    case 'new_response':        return `На ваш лот «${t}» поступил новый отклик.`;
    case 'response_accepted':   return `Ваш отклик на лот «${t}» принят!`;
    case 'response_rejected':   return `Ваш отклик на лот «${t}» отклонён.`;
    case 'lot_completed':       return `Лот «${t}» завершён. Ожидайте выплаты.`;
    case 'lot_activated':       return `Ваш лот «${t}» активирован — блогеры уже могут откликаться.`;
    case 'lot_withdrawn':       return `Лот «${t}» был снят компанией.`;
    case 'admin_lot_to_verify': return `Новый лот «${t}» ожидает оплаты.`;
    case 'admin_lot_to_payout': return `Лот «${t}» завершён компанией и ожидает выплаты.`;
    case 'saved_search_match':  return `Новый лот по твоему сохранённому поиску: «${t}»`;
    case 'dispute_opened':      return `По лоту «${t}» открыт спор. Администратор рассмотрит ситуацию.`;
    case 'admin_dispute':       return `Новый спор по лоту «${t}». Требуется ваше решение.`;
    case 'dispute_resolved': {
      const how = ctx.resolution === 'favor_company' ? 'в пользу компании'
        : ctx.resolution === 'favor_blogger' ? 'в пользу блогера'
        : 'частично';
      return `Спор по лоту «${t}» разрешён ${how}.`;
    }
    case 'support_new_ticket':   return `Новый тикет поддержки: «${t}».`;
    case 'support_user_reply':   return `Пользователь ответил в тикете: «${t}».`;
    case 'support_admin_reply':  return `Поддержка ответила на ваш тикет: «${t}».`;
    case 'support_ticket_closed': return `Ваш тикет «${t}» закрыт администратором.`;
  }
}

function buildDeeplinkParam(type: NotificationType, ctx: NotifyCtx): string | null {
  if (type === 'admin_lot_to_verify') return 'admin_payment';
  if (type === 'admin_lot_to_payout') return 'admin_payout';
  if (type === 'admin_dispute') return 'admin_dispute';
  if (type === 'support_new_ticket' || type === 'support_user_reply') return 'admin_support';
  if (type === 'support_admin_reply' || type === 'support_ticket_closed') {
    return ctx.linkTicketId ? `support_${ctx.linkTicketId}` : null;
  }
  if (type === 'lot_withdrawn') return null; // лот удалён — диплинк не нужен
  if (ctx.lotId) return `lot_${ctx.lotId}`;
  return null;
}

function buildKeyboard(type: NotificationType, ctx: NotifyCtx): InstanceType<typeof InlineKeyboard> | undefined {
  if (!env.MINI_APP_URL) return undefined;
  const param = buildDeeplinkParam(type, ctx);
  if (!param) return undefined;
  const url = `${env.MINI_APP_URL}?startapp=${encodeURIComponent(param)}`;
  return new InlineKeyboard().webApp('Открыть NeedMarket', url);
}

async function trySend(
  db: Db,
  bot: Bot,
  recipientTgId: bigint,
  userId: string | null,
  type: NotificationType,
  ctx: NotifyCtx,
): Promise<void> {
  // Дедуп: responseId (споры) или ticketId (поддержка) переопределяет lotId.
  const dedupeKey = ctx.responseId ?? ctx.ticketId ?? null;
  const existing = dedupeKey != null
    ? await db.notification.findFirst({ where: { recipientTgId, type, dedupeKey } })
    : await db.notification.findFirst({ where: { recipientTgId, type, lotId: ctx.lotId ?? null } });
  if (existing) return;

  try {
    await bot.api.sendMessage(Number(recipientTgId), buildText(type, ctx), {
      reply_markup: buildKeyboard(type, ctx),
    });
    await db.notification.create({
      data: { recipientTgId, userId, type, lotId: ctx.lotId ?? null, dedupeKey },
    });
  } catch {
    // best-effort: отправка провалилась — не пишем лог, не пробрасываем
  }
}

// Уведомить пользователя по User.id. Уважает notificationsEnabled.
// Возвращает Promise (тесты могут await; роуты вызывают через `void`).
export async function notifyUser(
  db: Db,
  bot: Bot | null | undefined,
  userId: string,
  type: NotificationType,
  ctx: NotifyCtx = {},
): Promise<void> {
  if (!bot) return;
  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || !user.notificationsEnabled) return;
    await trySend(db, bot, user.telegramId, userId, type, ctx);
  } catch {
    // best-effort
  }
}

// Уведомить блогеров по массиву BloggerProfile.id.
// Ищет профили → userId → user, уважает notificationsEnabled каждого.
export async function notifyBloggers(
  db: Db,
  bot: Bot | null | undefined,
  bloggerProfileIds: string[],
  type: NotificationType,
  ctx: NotifyCtx = {},
): Promise<void> {
  if (!bot || bloggerProfileIds.length === 0) return;
  try {
    const profiles = await db.bloggerProfile.findMany({ where: { id: { in: bloggerProfileIds } } });
    const userIds = profiles.map((p) => p.userId);
    const users = await db.user.findMany({ where: { id: { in: userIds } } });
    for (const user of users) {
      if (!user.notificationsEnabled) continue;
      await trySend(db, bot, user.telegramId, user.id, type, ctx);
    }
  } catch {
    // best-effort
  }
}

// Уведомить владельца лота по CompanyProfile.id (Lot.companyId).
// Уважает notificationsEnabled.
export async function notifyLotOwner(
  db: Db,
  bot: Bot | null | undefined,
  companyProfileId: string,
  type: NotificationType,
  ctx: NotifyCtx = {},
): Promise<void> {
  if (!bot) return;
  try {
    const [company] = await db.companyProfile.findMany({ where: { id: { in: [companyProfileId] } } });
    if (!company) return;
    const user = await db.user.findUnique({ where: { id: company.userId } });
    if (!user || !user.notificationsEnabled) return;
    await trySend(db, bot, user.telegramId, user.id, type, ctx);
  } catch {
    // best-effort
  }
}

// Уведомить всех админов из ADMIN_TELEGRAM_IDS.
// Флаг notificationsEnabled НЕ проверяется — стафф уведомляется всегда.
export async function notifyAdmins(
  db: Db,
  bot: Bot | null | undefined,
  type: NotificationType,
  ctx: NotifyCtx = {},
): Promise<void> {
  if (!bot || adminTelegramIds.size === 0) return;
  try {
    await Promise.allSettled(
      [...adminTelegramIds].map((tgId) => trySend(db, bot, tgId, null, type, ctx)),
    );
  } catch {
    // best-effort
  }
}
