import { Bot, InlineKeyboard } from 'grammy';
import { env } from './env';

export function createBot(): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  bot.command('start', async (ctx) => {
    const keyboard = env.MINI_APP_URL
      ? new InlineKeyboard().webApp('🚀 Открыть NeedMarket', env.MINI_APP_URL)
      : undefined;

    await ctx.reply(
      'Добро пожаловать в NeedMarket — маркетплейс блогеров и бизнеса.\n\n' +
        (env.MINI_APP_URL
          ? 'Нажмите кнопку ниже, чтобы открыть приложение.'
          : 'MINI_APP_URL не задан — кнопка недоступна (см. .env).'),
      { reply_markup: keyboard },
    );
  });

  // ВРЕМЕННЫЙ dev-помощник: логирует id канала, куда добавлен бот-админ.
  // Нужен один раз, чтобы снять MEDIA_CHANNEL_ID для .env. После настройки канала
  // этот обработчик можно удалить. См. README, раздел про канал-хранилище.
  bot.on('channel_post', (ctx) => {
    console.log(`📢 channel_post из чата id=${ctx.chat.id} ("${ctx.chat.title ?? '—'}") — это и есть MEDIA_CHANNEL_ID`);
  });

  return bot;
}

// Запуск long polling + (по возможности) Menu Button на Mini App.
export async function startBot(bot: Bot): Promise<void> {
  if (env.MINI_APP_URL) {
    try {
      await bot.api.setChatMenuButton({
        menu_button: { type: 'web_app', text: 'Открыть', web_app: { url: env.MINI_APP_URL } },
      });
    } catch (err) {
      console.warn('Не удалось выставить Menu Button:', (err as Error).message);
    }
  }

  await bot.start({
    onStart: (info) => console.log(`🤖 Бот @${info.username} запущен (long polling)`),
  });
}
