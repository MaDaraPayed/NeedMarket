import { Readable } from 'node:stream';
import { Bot, InputFile } from 'grammy';
import type { Storage, StorageRef } from '../types';

// Хранилище медиа на базе приватного Telegram-канала.
// Абстракция Storage (см. types.ts) позволяет позже заменить это на R2/S3
// без правок вызывающего кода (роуты загрузки/раздачи).
export class TelegramChannelStorage implements Storage {
  constructor(
    private readonly bot: Bot,
    private readonly channelId: number,
    private readonly botToken: string,
  ) {}

  // Шлём файл документом (sendDocument), чтобы Telegram НЕ перекодировал его,
  // как делает с фото. Возвращаем file_id (для скачивания) и message_id.
  async put(buffer: Buffer, meta: { filename: string; contentType: string }): Promise<StorageRef> {
    const msg = await this.bot.api.sendDocument(this.channelId, new InputFile(buffer, meta.filename));
    const fileId = msg.document?.file_id;
    if (!fileId) {
      throw new Error('sendDocument не вернул document.file_id');
    }
    return { fileId, messageId: msg.message_id };
  }

  // По file_id получаем file_path и стримим байты с серверов Telegram.
  // ВАЖНО: download-URL содержит токен бота и НИКОГДА не покидает сервер —
  // наружу отдаёт только media-прокси (см. GET /media/:fileId).
  async getStream(fileId: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
    const file = await this.bot.api.getFile(fileId); // лимит Bot API: до ~20 МБ
    if (!file.file_path) {
      throw new Error('getFile не вернул file_path');
    }
    const url = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`Скачивание файла не удалось: HTTP ${res.status}`);
    }
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    return { stream: Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), contentType };
  }
}
