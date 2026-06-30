import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppDeps, BloggerProfileData, CompanyProfileData, BloggerProfileRecord } from '../types';
import { requireAuth, loadAuthedUser, ensureCompany } from '../deps';
import {
  roleBodySchema,
  bloggerProfileSchema,
  companyProfileSchema,
  logoBodySchema,
  LOGO_MAX_BYTES,
  LOGO_EXT,
  phoneSchema,
} from '../schemas';
// logoBodySchema/LOGO_MAX_BYTES/LOGO_EXT используется и для аватара блогера (те же ограничения).
import { toUserDto, toUserDtoWithRating, loadProfile } from '../serializers/user';
import { getPlatformSettings } from '../services/platform-settings';

const settingsBodySchema = z.object({
  notificationsEnabled: z.boolean(),
});

// Роуты профиля текущего пользователя: /me, /me/role, /me/profile, /me/profile/logo.
export function profileRoutes(deps: AppDeps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    // GET /me — защищён нашим JWT, возвращает пользователя + его профиль из БД + свой рейтинг.
    // Также включает платформенные настройки (platformSettings) для клиентской инициализации.
    app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      const [profile, settings] = await Promise.all([
        loadProfile(deps.db, user),
        getPlatformSettings(deps.db),
      ]);
      const userDto = await toUserDtoWithRating(deps.db, user, profile);
      const needsPhone =
        user.role === 'blogger' &&
        (!profile || !(profile as BloggerProfileRecord).phone);
      return {
        user: {
          ...userDto,
          needsPhone,
          platformSettings: { budgetFilterEnabled: settings.budgetFilterEnabled },
        },
      };
    });

    // PUT /me/role — проставляет роль один раз. Смену роли в MVP не делаем (409).
    app.put('/me/role', { preHandler: requireAuth }, async (req, reply) => {
      const body = roleBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'role must be "blogger" or "company"' });
      }

      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (user.role !== null) {
        return reply.code(409).send({ error: 'Role already set' });
      }

      const updated = await deps.db.user.update({
        where: { id: user.id },
        data: { role: body.data.role },
      });
      return { user: toUserDto(updated, null) };
    });

    // PUT /me/profile — upsert профиля под роль пользователя (zod-валидация по роли).
    app.put('/me/profile', { preHandler: requireAuth }, async (req, reply) => {
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (user.role === null) {
        return reply.code(400).send({ error: 'Choose a role first' });
      }

      if (user.role === 'blogger') {
        const body = bloggerProfileSchema.safeParse(req.body);
        if (!body.success) {
          return reply.code(400).send({ error: 'Invalid blogger profile', issues: body.error.issues });
        }
        const d = body.data;
        const data: BloggerProfileData = {
          displayName: d.displayName,
          bio: d.bio ?? null,
          categories: d.categories,
          city: d.city ?? null,
          contact: d.contact ?? null,
          linkedAccounts: d.linkedAccounts,

          birthDate: d.birthDate ?? null,
          phone: d.phone ?? null,
          email: d.email ?? null,

          audienceGender: d.audienceGender ?? null,
          audienceAge: d.audienceAge ?? null,
          audienceGeo: d.audienceGeo ?? null,
          audienceLanguage: d.audienceLanguage ?? null,

          reachStories: d.reachStories ?? null,
          reachReels: d.reachReels ?? null,
          reachPosts: d.reachPosts ?? null,
          engagementRate: d.engagementRate ?? null,
          statsScreenshotUrl: d.statsScreenshotUrl ?? null,

          formats: d.formats,

          priceStories: d.priceStories ?? null,
          priceStoriesSeries: d.priceStoriesSeries ?? null,
          priceReels: d.priceReels ?? null,
          pricePost: d.pricePost ?? null,
          priceEvent: d.priceEvent ?? null,
          priceUgc: d.priceUgc ?? null,
          avgPrice3m: d.avgPrice3m ?? null,

          brandsWorkedWith: d.brandsWorkedWith ?? null,
          bestCaseUrl: d.bestCaseUrl ?? null,

          barterAvailable: d.barterAvailable,
          travelAvailable: d.travelAvailable,
          preferredAdvertiserCategories: d.preferredAdvertiserCategories,

          termsAcceptedAt: d.termsAcceptedAt ?? null,
          marketingOptIn: d.marketingOptIn,
        };
        const profile = await deps.db.bloggerProfile.upsert({
          where: { userId: user.id },
          update: data,
          create: { ...data, userId: user.id },
        });
        return { user: toUserDto(user, profile) };
      }

      // company
      const body = companyProfileSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid company profile', issues: body.error.issues });
      }
      const data: CompanyProfileData = {
        name: body.data.name,
        sphere: body.data.sphere ?? null,
        city: body.data.city ?? null,
        contact: body.data.contact ?? null,
      };
      const profile = await deps.db.companyProfile.upsert({
        where: { userId: user.id },
        update: data,
        create: { ...data, userId: user.id },
      });
      return { user: toUserDto(user, profile) };
    });

    // POST /me/profile/logo — загрузка логотипа компании (base64) в канал-хранилище.
    app.post('/me/profile/logo', { preHandler: requireAuth }, async (req, reply) => {
      if (!deps.storage) {
        return reply
          .code(503)
          .send({ error: 'Хранилище медиа не настроено: задайте MEDIA_CHANNEL_ID в .env и перезапустите API.' });
      }

      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (!ensureCompany(reply, user, 'Only companies can upload a logo')) return;

      const body = logoBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Expected { contentType: png|jpeg|webp, data: base64 }' });
      }

      const buffer = Buffer.from(body.data.data, 'base64');
      if (buffer.length === 0) {
        return reply.code(400).send({ error: 'Empty image' });
      }
      if (buffer.length > LOGO_MAX_BYTES) {
        return reply.code(400).send({ error: 'Image too large (max 5 MB)' });
      }

      // Логотип можно загрузить только к уже существующему профилю компании.
      const existing = await deps.db.companyProfile.findUnique({ where: { userId: user.id } });
      if (!existing) {
        return reply.code(400).send({ error: 'Create the company profile before uploading a logo' });
      }

      const ext = LOGO_EXT[body.data.contentType];
      const ref = await deps.storage.put(buffer, {
        filename: `logo_${user.id}.${ext}`,
        contentType: body.data.contentType,
      });

      const profile = await deps.db.companyProfile.update({
        where: { userId: user.id },
        data: { logoFileId: ref.fileId, logoMsgId: ref.messageId ?? null },
      });
      return { user: toUserDto(user, profile) };
    });

    // PATCH /me/settings — переключение флага уведомлений.
    app.patch('/me/settings', { preHandler: requireAuth }, async (req, reply) => {
      const body = settingsBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Expected { notificationsEnabled: boolean }' });
      }

      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;

      const updated = await deps.db.user.update({
        where: { id: user.id },
        data: { notificationsEnabled: body.data.notificationsEnabled },
      });
      const profile = await loadProfile(deps.db, updated);
      return { user: toUserDto(updated, profile) };
    });

    // PATCH /me/phone — установка/обновление телефона блогером (бэкафилл существующих).
    // Переиспользует phoneSchema с той же нормализацией. Под /me-префиксом (proxy без изменений).
    const setPhoneBodySchema = z.object({ phone: phoneSchema });
    app.patch('/me/phone', { preHandler: requireAuth }, async (req, reply) => {
      const body = setPhoneBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid phone', issues: body.error.issues });
      }
      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (user.role !== 'blogger') {
        return reply.code(403).send({ error: 'Only bloggers can update phone via this endpoint' });
      }
      const existing = await deps.db.bloggerProfile.findUnique({ where: { userId: user.id } });
      if (!existing) {
        return reply.code(400).send({ error: 'Create your blogger profile first' });
      }
      const profile = await deps.db.bloggerProfile.update({
        where: { userId: user.id },
        data: { phone: body.data.phone },
      });
      return { user: { ...toUserDto(user, profile), needsPhone: false } };
    });

    // POST /me/profile/avatar — загрузка аватара блогера (base64) через тот же Storage.
    // Переиспользует logoBodySchema/LOGO_MAX_BYTES/LOGO_EXT и media-прокси /media/:fileId.
    app.post('/me/profile/avatar', { preHandler: requireAuth }, async (req, reply) => {
      if (!deps.storage) {
        return reply
          .code(503)
          .send({ error: 'Хранилище медиа не настроено: задайте MEDIA_CHANNEL_ID в .env и перезапустите API.' });
      }

      const user = await loadAuthedUser(deps.db, req, reply);
      if (!user) return;
      if (user.role !== 'blogger') {
        return reply.code(403).send({ error: 'Only bloggers can upload an avatar' });
      }

      const body = logoBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Expected { contentType: png|jpeg|webp, data: base64 }' });
      }

      const buffer = Buffer.from(body.data.data, 'base64');
      if (buffer.length === 0) {
        return reply.code(400).send({ error: 'Empty image' });
      }
      if (buffer.length > LOGO_MAX_BYTES) {
        return reply.code(400).send({ error: 'Image too large (max 5 MB)' });
      }

      const existing = await deps.db.bloggerProfile.findUnique({ where: { userId: user.id } });
      if (!existing) {
        return reply.code(400).send({ error: 'Create the blogger profile before uploading an avatar' });
      }

      const ext = LOGO_EXT[body.data.contentType];
      const ref = await deps.storage.put(buffer, {
        filename: `avatar_${user.id}.${ext}`,
        contentType: body.data.contentType,
      });

      const profile = await deps.db.bloggerProfile.update({
        where: { userId: user.id },
        data: { avatarFileId: ref.fileId, avatarMsgId: ref.messageId ?? null },
      });
      return { user: toUserDto(user, profile) };
    });
  };
}
