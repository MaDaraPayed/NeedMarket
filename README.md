# NeedMarket — Telegram Mini App (маркетплейс блогеров и бизнеса)

Монорепо (npm workspaces). **Фаза 0**: каркас + аутентификация через `initData`.
Подробный план — в [PLAN.md](./PLAN.md), решения — в [DECISIONS.md](./DECISIONS.md).

```
apps/miniapp/      — фронтенд Mini App (Vite + React + TS + @telegram-apps/*)
apps/api/          — Fastify API + grammY бот + Prisma (один Node-процесс)
packages/shared/   — общий пакет @needmarket/shared: CATEGORIES и DTO-типы (фронт+бэк)
.env.example       — список всех переменных окружения
```

Бэкенд (`apps/api/src/`) разложен по слоям:

```
app.ts          — buildApp: композиция (cors + JWT + роуты)
routes/         — по доменам: health, auth (/auth/telegram), profile (/me, /me/role,
                  /me/profile, /me/profile/logo, /me/lots), lots (/lots, /lots/:id),
                  responses (/lots/:id/responses, /me/responses, /lots/:id/responses/:id/accept),
                  media (/media/:fileId)
deps/           — плагины и гарды: JWT-плагин, requireAuth, проверки роли
schemas/        — zod-схемы тел запросов (роль, профили, логотип, лот, фильтры ленты)
serializers/    — мапперы Prisma-моделей в DTO (форма /me, лот+компания, logoUrl, BigInt→string)
services/       — кросс-сквозное: storage (TelegramChannelStorage)
types.ts        — доменные интерфейсы (Db, Storage, *Record)
db.ts           — Prisma-клиент (models)
```

**Лоты (Фаза 2):** компания создаёт лот (`POST /lots`, сразу `active`), видит свои в
`GET /me/lots`; блогер смотрит ленту активных `GET /lots` с фильтрами `category`/`platform`
и пагинацией, открывает `GET /lots/:id`. Фронт даёт навигацию по роли: компания —
«Ваши лоты» + создание; блогер — «Открытые проекты» с фильтр-чипами. Отклики/оплата/
отзывы — следующие фазы.

## Что делает Фаза 0

Mini App открывается из бота → фронт берёт сырой `initData` → шлёт на `POST /auth/telegram`
→ бэкенд **криптографически проверяет подпись** → upsert `User` в Postgres → выдаёт наш JWT.
Фронт затем зовёт `GET /me` с Bearer и показывает «Привет, {имя}» — имя приходит **с бэкенда**,
что доказывает сквозную авторизацию.

---

## Требования

- Node.js ≥ 20
- PostgreSQL (локально или managed)
- Бот в [@BotFather](https://t.me/BotFather) (нужен `BOT_TOKEN`)
- Туннель для HTTPS: [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) или [ngrok](https://ngrok.com/)

---

## 1. Установка

```bash
npm install            # ставит зависимости всех workspaces из корня
```

## 2. Переменные окружения

Скопируй пример в `.env` в **корне** репозитория и заполни:

```bash
cp .env.example .env
```

| Переменная     | Где используется | Описание |
|----------------|------------------|----------|
| `BOT_TOKEN`    | backend          | Токен из BotFather. **Только на бэкенде.** |
| `MINI_APP_URL` | backend          | HTTPS-URL фронта (туннель) — кнопка бота и Menu Button. |
| `DATABASE_URL` | backend          | Строка подключения к Postgres. |
| `TEST_DATABASE_URL` | tests       | Отдельная БД для `npm test` (см. §6). Необязательна — по умолчанию `needmarket_test` на том же контейнере. |
| `JWT_SECRET`   | backend          | Секрет для подписи наших JWT. |
| `PORT`         | backend          | Порт API (по умолчанию 3000). |
| `CORS_ORIGIN`  | backend          | Разрешённый origin фронта. В деве можно `*`. |
| `MEDIA_CHANNEL_ID` | backend      | Numeric id приватного канала-хранилища медиа (лого). Необязателен — без него загрузка лого вернёт 503. См. §8. |
| `VITE_API_URL` | frontend         | HTTPS-URL бэкенда (туннель) для запросов фронта. |

> Оба приложения читают **один** `.env` из корня (api — через dotenv, Vite — через `envDir`).

## 3. Поднять PostgreSQL локально (Docker)

Нужен запущенный **Docker Desktop**. БД описана в [docker-compose.yml](./docker-compose.yml)
(`postgres:16-alpine`, данные в именованном volume, healthcheck через `pg_isready`).

```bash
npm run db:up          # docker compose up -d (поднимает postgres на :5432)
docker compose ps      # дождись статуса "healthy"
```

Значение `DATABASE_URL` в `.env` уже настроено на этот контейнер:
`postgresql://postgres:postgres@localhost:5432/needmarket?schema=public`.

Остановить / удалить контейнер: `npm run db:down`.

> Если порт `5432` занят другим Postgres — поменяй маппинг в `docker-compose.yml`
> на `"5433:5432"` и порт в `DATABASE_URL` на `5433`.

## 4. Миграция БД + генерация Prisma-клиента

```bash
npm run db:migrate     # prisma migrate dev: создаёт таблицы и генерирует клиент
# при первом запуске спросит имя миграции (например, init)
```

Сбросить БД и накатить миграции заново (удалит данные): `npm run db:reset`.

## 5. Запуск (два терминала)

```bash
npm run dev:api        # Fastify (:3000) + grammY бот (long polling)
npm run dev:miniapp    # Vite dev-сервер (:5173)
```

- Открой http://localhost:5173 — UI отрендерится в браузере через **mock-окружение**.
  Авторизация покажет «Подпись не подтверждена» — это нормально: mock-`initData` не проходит
  реальную криптопроверку. Полный тест делается в Telegram (ниже).

## 6. Тесты

Интеграционные тесты идут против **реального Postgres** (отдельная тестовая БД), а
не против фейка в памяти. Внешний Telegram (хранилище медиа, бот) при этом остаётся
**заглушкой** — тесты в сеть не ходят. То есть: реальная БД + фейковый Telegram.

**Что нужно один раз:**

```bash
npm run db:up          # Postgres должен быть поднят (см. §3)
# создать тестовую БД (имя по умолчанию — needmarket_test):
docker exec needmarket-postgres psql -U postgres -c "CREATE DATABASE needmarket_test"
```

`TEST_DATABASE_URL` в `.env` уже указывает на эту БД. Можно переопределить
переменной окружения (адрес из shell имеет приоритет над `.env`).

**Прогон:**

```bash
npm test
```

Перед прогоном vitest сам накатывает схему на тестовую БД (`prisma migrate deploy`
в `globalSetup`), а перед каждым тестом чистит таблицы (`TRUNCATE` — изоляция между
тестами). Создавать/мигрировать тестовую БД руками после первого `CREATE DATABASE`
не нужно.

> Если меняешь Prisma-схему — добавь миграцию (`npm run db:migrate`); `globalSetup`
> применит её к тестовой БД на следующем `npm test` автоматически.

Проводка тестов (`apps/api/tests/`): `db.ts` — реальный клиент + `truncateAll`;
`globalSetup.ts` — миграции; `setup.ts` — `TRUNCATE` перед каждым тестом;
`helpers.ts` — фейковое медиа-хранилище и подпись `initData`.

---

## 7. Тест в реальном Telegram (ОДИН туннель)

Telegram грузит Mini App только по HTTPS с настоящим сертификатом — поэтому пробрасываем
наружу туннелем **только порт фронта**. Бэкенд второй раз пробрасывать не нужно:
Vite dev-proxy форвардит API-маршруты (`/auth`, `/me`, `/health`) на локальный
`http://localhost:3000`. Поэтому в деве **не задаём `VITE_API_URL`** и не возимся с CORS.

> Важно: в `.env` оставь `VITE_API_URL` пустым (или закомментируй). Если он задан —
> фронт пойдёт на абсолютный адрес мимо прокси (это режим для прода).

1. **Запусти бэкенд** (терминал 1):
   ```bash
   npm run dev:api          # Fastify :3000 + grammY бот (long polling)
   ```

2. **Запусти фронт** (терминал 2):
   ```bash
   npm run dev:miniapp      # Vite :5173 (с dev-proxy на :3000)
   ```

3. **Один туннель — только на фронт** (терминал 3):
   ```bash
   cloudflared tunnel --url http://localhost:5173
   # → выдаст https://<random>.trycloudflare.com
   ```
   Скопируй этот HTTPS-URL в `.env` как `MINI_APP_URL` и **перезапусти `dev:api`**
   (чтобы бот выставил кнопку/Menu Button на новый URL).

4. В **@BotFather** → `/mybots` → твой бот → **Bot Settings → Menu Button → Configure** →
   вставь тот же `MINI_APP_URL`. (Бот при старте также пытается выставить Menu Button сам.)

5. В Telegram открой бота, отправь `/start` → нажми кнопку **«Открыть NeedMarket»**.
   Должно появиться **«Привет, {твоё имя}»** — данные пришли с бэкенда через `/me`
   (через тот же туннель → Vite-proxy → Fastify). ✅

> ngrok вместо cloudflared: `ngrok http 5173` — логика та же (один туннель на фронт).
> `trycloudflare` даёт новый URL при каждом запуске — не забывай обновлять `MINI_APP_URL`
> в `.env` (и перезапускать `dev:api`) и Menu Button в BotFather.

---

## Эндпоинты API

| Метод | Путь              | Описание |
|-------|-------------------|----------|
| GET   | `/health`         | Проверка живости. |
| POST  | `/auth/telegram`  | Тело `{ initData }` → проверка подписи → upsert User → `{ token, user }`. 401 при невалидной/просроченной подписи. |
| GET   | `/me`             | Bearer-JWT → текущий `User` из БД + его `profile` (блогера/компании или `null`). |
| PUT   | `/me/role`        | Тело `{ role: "blogger" \| "company" }` → ставит роль, если она ещё `null` (иначе 409). |
| PUT   | `/me/profile`     | Upsert профиля под роль (zod-валидация по роли). 400, если роль не выбрана / тело невалидно. |
| POST  | `/me/profile/logo`| (company) Тело `{ contentType: png\|jpeg\|webp, data: base64 }` → кладёт лого в канал-хранилище, пишет `logoFileId`. 503 без `MEDIA_CHANNEL_ID`, 403 не-компании, 400 при невалидном файле. |
| POST  | `/lots`           | (company) Создаёт лот (zod: categories ⊆ CATEGORIES и непусто, platforms ⊆ PLATFORMS, budget > 0, deadline в будущем) со статусом `active` → `{ lot }`. 403 не-компании, 400 при невалидном теле. |
| GET   | `/lots`           | Лента активных лотов, новые сверху. Query `category` (матчит лоты, где `categories` содержит её), `platform`, `limit` (≤100), `offset` → `{ lots }`. |
| GET   | `/lots/:id`       | Один лот детально → `{ lot }` или 404. |
| GET   | `/me/lots`        | (company) Лоты текущей компании со статусами → `{ lots }`. |
| POST  | `/lots/:id/responses` | (blogger) Тело `{ message }` → создаёт отклик `pending`. 404 если лот не найден, 400 если не `active`, 409 если уже откликался, 403 не-блогеру. |
| GET   | `/lots/:id/responses` | (company-owner) Отклики на свой лот с краткой инфой блогера → `{ responses }`. 403 не-владельцу. |
| GET   | `/me/responses`   | (blogger) Отклики текущего блогера со статусами → `{ responses }`. 403 не-блогеру. |
| POST  | `/lots/:id/responses/:responseId/accept` | (company-owner) Принимает отклик: `accepted`, остальные → `rejected`, лот → `in_progress`, `chosenResponseId` выставлен. Всё в одной транзакции. 400 если лот не `active`, 403 не-владельцу. |
| GET   | `/media/:fileId`  | Кэширующий media-прокси: стримит байты из канала-хранилища с нужным content-type. Прямой getFile-URL с токеном бота наружу не отдаётся. |

> **Фаза 1 (профили и роль).** После авторизации фронт по `user.role` и `user.profile`
> показывает: выбор роли → форму профиля (блогер: имя, bio, категории, город, аккаунты;
> компания: название, сфера, город, контакт, логотип) → экран просмотра с кнопкой «Редактировать».
> Общий список категорий — константа `CATEGORIES` в пакете `@needmarket/shared`
> (`packages/shared/src/categories.ts`), один источник для фронта и бэка.

> **Фаза 2 (лоты).** После онбординга домашний экран зависит от роли. **Компания** видит
> «Ваши лоты» (`GET /me/lots`) и кнопку «Создать лот» (форма с **категориями** (мультивыбор),
> площадками из `PLATFORMS`, бюджетом, дедлайном, чек-листом → `POST /lots`); новый лот сразу `active`.
> **Блогер** видит «Открытые проекты» (`GET /lots`) с фильтр-чипами по категории/площадке
> и карточками (компания, бюджет, дедлайн); тап открывает детальный просмотр (`GET /lots/:id`).

> **Фаза 3 (отклики + выбор).** Блогер на экране лота (если `active`) видит форму «Откликнуться» →
> вводит сообщение → `POST /lots/:id/responses`; после отклика показывается блок со статусом.
> Раздел «Мои отклики» (кнопка рядом с «Профиль» в BloggerHome) — список откликов с названием
> лота и статусом (на рассмотрении / принят / отклонён).
> Компания на экране своего лота видит секцию «Отклики (N)» с карточками блогеров (имя, аватар,
> категории, подписчики, сообщение), кнопку «Выбрать» → диалог подтверждения → `POST .../accept`.
> После выбора: принятый отклик помечен, остальные — отклонены, лот переходит в `in_progress`
> и **выпадает из открытой ленты** блогеров.
>
> Проверка в Telegram: компания создаёт лот → блогер откликается → компания выбирает блогера →
> лот пропадает из ленты (`status = in_progress`); у блогера в «Моих откликах» появляется «✅ Принят».

## 8. Канал-хранилище медиа (логотипы)

Логотипы компаний (и позже — другие медиа) хранятся в **приватном служебном
Telegram-канале**, а не на диске/в БД. Бот шлёт файл в канал (`sendDocument`, без
перекодирования), сохраняет `file_id`, а раздаёт наружу через кэширующий
прокси `GET /media/:fileId`. Канал пользователю невидим; чат с ботом остаётся
только для уведомлений — весь функционал в мини-аппе.

**Как получить `MEDIA_CHANNEL_ID` (один раз):**
1. Создай приватный канал в Telegram, добавь бота **администратором** (право
   публикации сообщений).
2. Запусти `npm run dev:api` и **опубликуй любой пост** в канале.
3. В логах API появится строка `📢 channel_post из чата id=-100...` — это и есть
   `MEDIA_CHANNEL_ID`. Впиши его в `.env` и перезапусти `dev:api`.

> Обработчик `bot.on('channel_post')` в `apps/api/src/bot.ts` — **временный dev-помощник**
> для получения id; после настройки канала его можно удалить.

> Замена хранилища: реализация `TelegramChannelStorage` (`apps/api/src/services/storage.ts`)
> скрыта за интерфейсом `Storage` (`types.ts`) — позже её можно заменить на R2/S3 без
> правок роутов.
