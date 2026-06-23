import { webhookCallback } from 'grammy';
import { buildApp } from './app';
import { prisma } from './db';
import { createBot, startBot } from './bot';
import { TelegramChannelStorage } from './services/storage';
import { env } from './env';

async function main() {
  const bot = createBot();

  const storage = env.MEDIA_CHANNEL_ID
    ? new TelegramChannelStorage(bot, env.MEDIA_CHANNEL_ID, env.BOT_TOKEN)
    : null;

  const app = buildApp({ db: prisma, storage, bot });

  // Webhook-маршрут регистрируем ДО listen (Fastify не разрешает регистрацию после).
  if (env.WEBHOOK_URL) {
    app.post(
      '/telegram/webhook',
      webhookCallback(bot, 'fastify', { secretToken: env.WEBHOOK_SECRET }),
    );
  }

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  app.log.info(`API слушает на :${env.PORT}`);
  if (!storage) {
    app.log.warn('MEDIA_CHANNEL_ID не задан — загрузка лого недоступна (см. README).');
  }

  if (env.WEBHOOK_URL) {
    // Говорим Telegram куда слать обновления. setWebhook — идемпотентно, безопасно на рестартах.
    await bot.api.setWebhook(`${env.WEBHOOK_URL}/telegram/webhook`, {
      secret_token: env.WEBHOOK_SECRET,
    });
    app.log.info(`Бот в режиме webhook: ${env.WEBHOOK_URL}/telegram/webhook`);
  } else {
    // Локальный dev: long polling. Ошибка бота не роняет API.
    startBot(bot).catch((err) => {
      app.log.error(`Бот не стартовал (API продолжает работать): ${(err as Error).message}`);
    });
  }

  const shutdown = async () => {
    app.log.info('Завершение работы...');
    await bot.stop().catch(() => {});
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
