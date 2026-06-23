import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../types';

// GET /media/:fileId — кэширующий media-прокси. Резолвит file_id через storage
// и стримит байты с правильным content-type. Прямой getFile-URL (с токеном бота)
// наружу не отдаём.
//
// Query params (опциональные):
//   ?name=<fileName>  — если задан, ставит Content-Disposition: attachment с именем
//                       (RFC 6266 / RFC 5987: filename* для non-ASCII)
//   ?type=<mime>      — переопределяет Content-Type в ответе (берём из БД,
//                       т.к. Telegram может вернуть application/octet-stream)
//
// Кэш хранит (buffer, telegram-contentType) по fileId. Заголовки ставятся per-request
// из query params — один кэш покрывает и inline (картинки), и attachment (документы).
export function mediaRoutes(deps: AppDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    const MEDIA_CACHE_MAX = 64;
    const mediaCache = new Map<string, { buffer: Buffer; contentType: string }>();
    function cacheGet(fileId: string) {
      const hit = mediaCache.get(fileId);
      if (hit) {
        mediaCache.delete(fileId);
        mediaCache.set(fileId, hit);
      }
      return hit;
    }
    function cacheSet(fileId: string, value: { buffer: Buffer; contentType: string }) {
      mediaCache.set(fileId, value);
      if (mediaCache.size > MEDIA_CACHE_MAX) {
        const oldest = mediaCache.keys().next().value;
        if (oldest !== undefined) mediaCache.delete(oldest);
      }
    }

    app.get<{
      Params: { fileId: string };
      Querystring: { name?: string; type?: string };
    }>('/media/:fileId', async (req, reply) => {
      if (!deps.storage) {
        return reply.code(503).send({ error: 'Media storage is not configured (set MEDIA_CHANNEL_ID).' });
      }
      const { fileId } = req.params;
      const { name: rawName, type: rawType } = req.query;

      const cached = cacheGet(fileId);
      let buffer: Buffer;
      let cachedContentType: string;

      if (cached) {
        buffer = cached.buffer;
        cachedContentType = cached.contentType;
        reply.header('x-cache', 'HIT');
      } else {
        let payload: { stream: NodeJS.ReadableStream; contentType: string };
        try {
          payload = await deps.storage.getStream(fileId);
        } catch (err) {
          req.log.warn(`media getStream failed for ${fileId}: ${(err as Error).message}`);
          return reply.code(404).send({ error: 'File not found' });
        }
        const chunks: Buffer[] = [];
        for await (const chunk of payload.stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        buffer = Buffer.concat(chunks);
        cachedContentType = payload.contentType;
        cacheSet(fileId, { buffer, contentType: cachedContentType });
        reply.header('x-cache', 'MISS');
      }

      // Content-Type: предпочитаем явный ?type из БД над тем, что вернул Telegram.
      const contentType = sanitizeHeaderValue(rawType) || cachedContentType;
      reply.header('content-type', contentType);
      reply.header('cache-control', 'public, max-age=31536000, immutable');

      // Content-Disposition: attachment с именем — только для документов (?name задан).
      if (rawName) {
        reply.header('content-disposition', buildContentDisposition(rawName));
      }

      return reply.send(buffer);
    });
  };
}

// Строит RFC 6266 / RFC 5987 Content-Disposition для скачивания.
// Санитизация: убираем CR/LF/кавычки (header-injection). Кириллица и прочие
// non-ASCII идут через filename*=UTF-8''<percent-encoded>; ASCII-запас — fallback.
function buildContentDisposition(rawName: string): string {
  const name = rawName.replace(/[\r\n"]/g, '');
  const ascii = name.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(name);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// Убираем CR/LF из произвольного header-значения.
function sanitizeHeaderValue(v: string | undefined): string {
  return v ? v.replace(/[\r\n]/g, '') : '';
}
