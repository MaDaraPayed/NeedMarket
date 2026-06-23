# DECISIONS — журнал решений оркестратора

Здесь фиксируем выборы в точках принятия решений (см. PLAN.md §7).

## Фаза 0 — Каркас и аутентификация

- **Стек:** TypeScript на всём (React+Vite фронт, Fastify+grammY бэк, Prisma+PostgreSQL).
- **Монорепо:** npm workspaces (`packages/*`, `apps/*`).
- **Один процесс на бэке:** Fastify-сервер и grammY-бот (long polling) поднимаются
  вместе в `apps/api`. На проде бота можно перевести на webhook (отдельный шаг).
- **Хранение JWT на фронте:** только в памяти (React state), не в localStorage.
- **БД-движок Prisma 7:** driver adapter `@prisma/adapter-pg` (современный путь v7).
- **Локальный Postgres — Docker.** `postgres:16-alpine` через `docker-compose.yml`
  (порт 5432, именованный volume, healthcheck `pg_isready`). Скрипты `db:up`/`db:down`/
  `db:migrate`/`db:reset`. Managed Postgres (Neon/Supabase/Railway) — на этапе деплоя.
  Redis не добавляем — подключим в Фазе 6, когда появится потребность (очереди/уведомления).
- **Облачный деплой:** НЕ делаем в Фазе 0. Локально + HTTPS-туннель для теста в Telegram.
- **Дев = ОДИН туннель.** Туннель поднимаем только на порт фронта (Vite). Vite dev-proxy
  форвардит `/auth`, `/me`, `/health` на `localhost:3000` — поэтому второй туннель, CORS
  и динамический адрес бэкенда в деве не нужны (это были главные места поломок).
  Фронт берёт базу API как `import.meta.env.VITE_API_URL ?? ''`: пусто в деве (запросы
  относительно origin → прокси), абсолютный адрес в проде (Railway). CORS в API оставлен —
  он нужен в проде, когда фронт и API на разных доменах.

### Гигиена зависимостей

- **Скоуп `@tma.js/*` вместо deprecated `@telegram-apps/*`.** Экосистема переехала обратно
  на `@tma.js/*`; пакеты `@telegram-apps/*` помечаются deprecated (API идентичен).
  Решение — мигрировать по факту наличия поддерживаемого эквивалента, а не вслепую:
  - `@telegram-apps/init-data-node` → **`@tma.js/init-data-node`** (был deprecated). Бэкенд.
  - `@telegram-apps/sdk-react` → **`@tma.js/sdk-react`** (тянул deprecated-транзитивы
    `bridge`/`types`/`transformers`). Фронт. Сырой `initData` — через `retrieveRawInitData`.
    Небольшое отличие API: в `mockTelegramEnv` колбэк `onEvent` получает объект
    `{ name, params }` (а не кортеж) — поправлено в `mockEnv.ts`.
  - **`@telegram-apps/telegram-ui` ОСТАВЛЕН** — у UI-кита нет эквивалента `@tma.js/telegram-ui`
    (404 на npm), это отдельный репозиторий, не deprecated. Переименовывать нечем.
  - Эффект: ушли deprecation-предупреждения, уязвимости 9 → 3.

- **React 18 (не 19).** `@telegram-apps/telegram-ui` объявляет peer `react@^18.2.0`.
  React 19-фич не используем — ровняемся на UI-кит: `react`/`react-dom` на `18.3.1`,
  `@types/*` синхронны. Глобальный `legacy-peer-deps` убран (файл `.npmrc` удалён),
  установка проходит чисто без флагов и без `overrides`.

- **Prisma 7.** Новый генератор `prisma-client` (output в `src/generated/prisma`, в .gitignore);
  connection URL для CLI/Migrate живёт в `prisma.config.ts`, рантайм — через driver adapter
  `@prisma/adapter-pg`; `.env` грузим вручную (Prisma 7 не делает это сам).

## Фаза 1 — Профили и роль

- **Роль ставится один раз.** `PUT /me/role` проставляет роль только если она `null`,
  иначе 409. Смену роли в MVP не делаем (см. PLAN.md §7).
- **`linkedAccounts` — JSON-поле**, а не отдельная модель `LinkedAccount`. Для MVP проще;
  нормализуем позже, если понадобятся запросы/фильтры по аккаунтам.
- **Профили — отдельные таблицы** `BloggerProfile`/`CompanyProfile` (1:1 к `User`,
  `userId @unique`, `onDelete: Cascade`). `PUT /me/profile` делает upsert под текущую роль,
  валидация — отдельные zod-схемы на роль; без выбранной роли → 400.
- **Список категорий — константа `CATEGORIES`.** Источник истины — общий пакет
  `@needmarket/shared` (`packages/shared/src/categories.ts`); фронт и бэк импортируют
  одну константу, дублей нет (см. Фаза 2 §0). Бэкенд валидирует категории блогера по
  этому списку (`z.enum`).
- **JSON-граница Prisma в `Db`-интерфейсе.** Ручной тип `Db` (для инъекции в тестах) на поле
  `linkedAccounts` использует `any`: его generic-`upsert` не принимает ни `unknown`, ни
  именованный интерфейс (нет индекс-сигнатуры под `InputJsonValue`). Значение валидируется
  zod'ом до записи, так что безопасность на рантайме сохранена.
- **`GET /me`** теперь отдаёт `user.profile` (профиль под роль или `null`); фронт по
  `role` + наличию `profile` выбирает экран: выбор роли → форма → просмотр/редактирование.

### Фаза 1 — UI регистрации (доработка, только фронт)

- **Тема Telegram (корень бага «серое на сером»).** `AppRoot` сам определяет светлую/тёмную
  тему только через legacy-`window.Telegram.WebApp`, которого при @tma.js SDK нет → он
  оставался светлым на тёмном клиенте. Решение: монтируем `themeParams` и передаём
  `appearance={isDark ? 'dark' : 'light'}` в `AppRoot` (`isDark = useSignal(themeParams.isDark)`),
  плюс `themeParams.bindCssVars()`. Все кастомные цвета — через переменные **`--tgui--*`**
  (`hint_color`, `text_color`, `button_color`, `destructive_text_color`, `secondary_bg_color`),
  а не захардкоженные hex и не `--tg-theme-*`.
- **Главное действие форм — нативная `MainButton`** (`@tma.js/sdk-react`), хук
  `useMainButton` (mount + `setParams` + `onClick`, неактивна пока не заполнены обязательные
  поля). В браузерном mock нативной кнопки нет → там показываем тема-aware `Button`
  telegram-ui; разделяем по флагу `isMockEnv` из `mockEnv.ts`.
- **Чипы категорий** — кастомная кнопка с явным selected-состоянием (заливка
  `--tgui--button_color` + галочка), читаемая в обеих темах. У telegram-ui `Chip` нет
  встроенного selected-вида, поэтому стилизуем сами через переменные кита.
- **Контакт компании** преподставляем текущим `@username` из `/me` (пусто, если username
  нет); пользователь может отредактировать. Чисто фронт.

### Фаза 1 — логотип компании (медиа-хранилище)

- **Медиа в приватном Telegram-канале, не на диске/в БД.** Бот (админ канала) шлёт файл
  через `sendDocument` (а не `sendPhoto` — чтобы Telegram НЕ перекодировал), хранит `file_id`
  (+`message_id` на будущее). Раздача — только через свой кэширующий `GET /media/:fileId`;
  прямой getFile-URL (с токеном бота) наружу не отдаём. Чат с ботом не превращаем в
  функционал — загрузка лого только из мини-аппа.
- **Абстракция `Storage`** (`put`/`getStream`) в `types.ts`; реализация `TelegramChannelStorage`
  в `services/storage.ts`. Цель — drop-in замена на R2/S3 позже без правок роутов. В `buildApp`
  инжектируется как `storage` (в тестах — фейк со счётчиками вызовов).
- **`MEDIA_CHANNEL_ID` необязателен** — без него `storage = null`, а ручки лого/медиа
  возвращают 503 (API не падает). Numeric id снимается временным `bot.on('channel_post')`.
- **Формат загрузки — base64 в JSON** (не multipart): для лого до 5 МБ проще и без новой
  зависимости. `bodyLimit` поднят до 8 МБ (base64 +33%). Валидация: тип png/jpeg/webp,
  ≤5 МБ; лого грузится только к уже существующему профилю компании.
- **Кэш media-прокси** — простой in-memory LRU (Map, до 64 файлов) по `file_id`;
  заголовки `cache-control: public, max-age=1y, immutable` + `x-cache: HIT/MISS`.

## Фаза 2 §0 — реструктуризация репозитория (чистый рефактор)

Подготовка чистой основы под лоты. Поведение эндпоинтов **не менялось** — те же
маршруты, тела, статус-коды, ответы; те же 27 тестов по смыслу.

- **Общий пакет `@needmarket/shared`** (`packages/shared`) — источник истины для
  `CATEGORIES` и DTO-контракта API (роль, `LinkedAccount`, формы `/me`/профиля/входных
  тел, `LogoContentType`). Дубли `categories.ts` во фронте и бэке удалены. Потребление —
  через npm workspaces: `exports` пакета указывает прямо на TS-исходники
  (`./src/index.ts`), без шага сборки. Это резолвят все три инструмента — `tsc`
  (`moduleResolution: Bundler`), `tsx` (бэк-рантайм) и `vite` (фронт). Фронтовый `api.ts`
  реэкспортирует типы из пакета, поэтому экраны (`import { type X } from '../api'`)
  не правились.
- **Тесты — против реального Postgres.** Перешли с инъекции in-memory-фейка `db` на
  реальный Prisma-клиент к **отдельной** тестовой БД (`needmarket_test`, URL из
  `TEST_DATABASE_URL`). Внешний Telegram (storage/бот) остаётся **заглушкой** — тесты в
  сеть не ходят (реальная БД + фейковый Telegram). `buildApp({ db, storage })`: в тестах
  `db` = реальный клиент, `storage` = фейк.
  - **Схема:** vitest `globalSetup` накатывает миграции (`prisma migrate deploy` с
    `DATABASE_URL=TEST_DATABASE_URL`) один раз перед прогоном.
  - **Изоляция:** `TRUNCATE ... RESTART IDENTITY CASCADE` всех таблиц перед каждым тестом
    (`setupFiles`). Выбрали TRUNCATE, а не транзакционный откат — проще и надёжнее с
    driver-адаптером Prisma. `fileParallelism: false` — одна БД на процесс, без гонок.
- **Слоистый бэкенд `apps/api/src/`.** Монолитный `app.ts` разложен:
  `routes/` (health, auth, profile, media) · `deps/` (JWT-плагин, `requireAuth`,
  проверки роли) · `schemas/` (zod) · `serializers/` (Prisma→DTO: форма `/me`, `logoUrl`,
  `BigInt`→string) · `services/` (`TelegramChannelStorage`) · `types.ts` (доменные
  интерфейсы `Db`/`Storage`/`*Record`) · `db.ts` (Prisma). `buildApp` — точка композиции
  (cors + JWT + роуты). `notify/scheduler/matcher` — поздние фазы, сейчас не заводим.
  Порядок проверок в обработчиках сохранён (напр. в логотипе 503 про хранилище идёт
  раньше гарда роли), чтобы поведение совпадало для всех входов, а не только тестируемых.

## Фаза 2 — лоты: модель, создание, лента

Отклики/выбор/оплата/отзывы — следующие фазы, здесь НЕ делаем.

- **`PLATFORMS` в `@needmarket/shared`** (Instagram, TikTok, YouTube, Telegram) рядом с
  `CATEGORIES` — единый источник для фронта и бэка. DTO-типы лота (`Lot`, `LotStatus`,
  `CreateLotInput`, `LotCompanyBrief`) — тоже в shared.
- **Модель `Lot`** (миграция `add_lots`): `companyId` → `CompanyProfile` (`onDelete: Cascade`),
  `categories String[]` (⊆ CATEGORIES), `platforms String[]` (⊆ PLATFORMS), `budget Int` (тенге),
  `deadline`, `requirements String[]` (чек-лист), `status LotStatus`. Индексы под ленту:
  `(status, createdAt)` и GIN по `categories`. `chosenResponseId` пока НЕ заводим (выбор отклика —
  Фаза 3).
  - **Мультикатегории (миграция `lot_categories_array`).** Изначально была одна `category String`;
    перешли на `categories String[]`. Миграцию написали вручную (Prisma по умолчанию дропает
    колонку): `ADD COLUMN categories` → `UPDATE ... = ARRAY[category]` (перенос без потерь) →
    `DROP COLUMN category` → GIN-индекс. Фильтр ленты по `category` теперь матчит лоты, где
    `categories` СОДЕРЖИТ выбранную (`has` / array-containment). Данные профилей не трогали.
- **`LotStatus`**: `draft → awaiting_payment → active → in_progress → completed / cancelled /
  disputed`. Новый лот сразу `active` (оплата/эскроу — Фаза 4; `awaiting_payment` зарезервирован).
  Смену статуса (кроме создания) сейчас не делаем.
- **Эндпоинты** (на слоистой структуре): `POST /lots` (JWT, только company → иначе 403;
  zod: categories ⊆ CATEGORIES и непусто, platforms ⊆ PLATFORMS и непусто, budget > 0, deadline в будущем);
  `GET /lots` (лента активных, новые сверху, фильтры `category`/`platform`, пагинация
  `limit`/`offset`, default 20/макс 100); `GET /lots/:id` (детально или 404); `GET /me/lots`
  (company-only, свои лоты со статусами).
- **Узкий `Db` без generic-include.** Краткую инфу о компании к лотам прикладываем
  **отдельным** запросом (`companyProfile.findMany({ id: { in } })`) и собираем в сериализаторе
  (`toLotDtos`, без N+1), а не через Prisma `include`. Причина: hand-written `Db`-интерфейс с
  `include` ломает структурную совместимость с реальным `PrismaClient` (generic-метод
  инстанцируется дефолтом без `company`). Базовые методы (`create/findMany/findUnique` без
  include) совместимы чисто.
- **Сериализация лота** — централизованно (`serializers/lot.ts`): даты → ISO, `company` с
  готовым `logoUrl` (тот же media-URL, что и в профиле).
- **Фронт — навигация по роли** (без роутер-либы): после онбординга `Dashboard` держит
  простой стек экранов. Компания: «Ваши лоты» (`/me/lots`) + создание (`CreateLotForm`,
  главное действие — нативная `MainButton`, как в формах профиля) + профиль. Блогер:
  «Открытые проекты» (`/lots`) с фильтр-чипами (категория/площадка, переиспользуемый
  `SelectChip`) + детальный просмотр лота. Вкладки для будущих разделов (отклики, «хочу
  проект») пока не добавляем. Создание лота — мультивыбор категорий (чипы с selected-
  состоянием, как в профиле блогера); карточки/деталь показывают `categories[]`.
- **Dev-proxy: префикс `/lots`.** В одно-туннельном деве Vite форвардит на бэкенд только
  перечисленные префиксы. Голый `/lots` (POST/GET/`:id`) сначала забыли добавить → запросы
  уходили в SPA и возвращали 404 (а `/me/lots` работал, т.к. под `/me`). Починка: добавили
  `/lots` в `server.proxy` (`vite.config.ts`) рядом с `/auth`, `/me`, `/media`, `/health`.
  Бэкенд-маршруты были исправны (их бьют 47 тестов напрямую) — проблема была только в прокси.

## Доработки профилей и ленты

### Контакт компании — тип контакта + ручной ввод (только фронт)

- **`contact` остаётся одной строкой в БД** (модель `CompanyProfile` НЕ меняем). Сегментер
  «Username / Телефон / Другое» в `CompanyForm` — это лишь UI-подсказка для подстановки и
  валидации ввода; поле всегда редактируемо вручную, тип угадывается из сохранённого значения
  (`inferContactType`) при открытии.
- **Телефон — best-effort через нативный попап** `requestContact` из `@tma.js/sdk-react`
  (Mini Apps v6.9; non-fp вариант возвращает `BetterPromise<RequestedContact>`, бросает при
  отказе). Гард `requestContact.isAvailable()` — вне Telegram (браузерный mock) попап
  недоступен. Любой неуспех (недоступно / отказ / пустой ответ) → подсказка «введите вручную»,
  НЕ ошибка. Номер нормализуем префиксом `+`, если его нет.
- **Username** подставляем как `@username` из `/me` (как раньше). Переключение на телефон сразу
  пробует попап; есть и явная кнопка «Получить номер из Telegram» для повтора.

### Фильтр ленты по нескольким категориям

- **`GET /lots`: `category` → массив** (`?category=X&category=Y`). `lotsQuerySchema` нормализует
  одиночное значение и массив в `string[]` через `z.preprocess`. В роуте — `{ hasSome: string[] }`
  вместо `{ has: string }` (array-overlap в Postgres, покрывает и один элемент, и несколько).
- **`LotFindManyArgs.where.categories`** обновлён до `{ hasSome: string[] }` в интерфейсе `Db`
  (удалён теперь неиспользуемый `has`).
- **Фронт `BloggerHome`**: `categories: string[]` (мультивыбор, пустой = «все»); footer отражает
  число выбранных. `fetchLots` получил `categories?: string[]` вместо `category?: string`;
  для каждого элемента вызывает `params.append('category', c)` — отдельный параметр на элемент.

### Аватар блогера (Часть 3)

- **Модель** (миграция `20260617180743_add_blogger_avatar`): `BloggerProfile.avatarFileId String?` +
  `avatarMsgId Int?` — те же поля, что у лого компании (`CompanyProfile.logoFileId/logoMsgId`).
- **Переиспользование Storage/прокси**: `POST /me/profile/avatar` (JWT, роль `blogger`) работает
  через тот же `TelegramChannelStorage.put` и раздаёт через существующий `GET /media/:fileId`.
  Валидация — `logoBodySchema` (те же ограничения: png/jpeg/webp, ≤5 МБ, base64). Файл в канале
  называется `avatar_{userId}.{ext}`.
- **Сериализатор `toProfileDto`**: расширен — для блогера добавляет `avatarUrl: /media/:fileId`
  (аналогично `logoUrl` компании); ветвление по дискриминанту `'logoFileId' in profile`.
- **DTO `BloggerProfile`** в `@needmarket/shared`: добавлено поле `avatarUrl: string | null`.
- **Фронт `BloggerForm`**: блок «Аватар» (круглый превью 88px, выбор/загрузка/замена, кнопка
  «Получить из Telegram» отсутствует — аватар загружается файлом). `onUserPatched?` проп по
  образцу `CompanyForm` — после загрузки аватара форма не закрывается. `Home.tsx` передаёт
  `onUserPatched={setUser}`.
- **`ProfileView`**: `avatarUrl` блогера / `logoUrl` компании объединены в `mediaUrl`; `Avatar`
  получает `src={mediaUrl ? resolveMediaUrl(mediaUrl) : undefined}` в обоих случаях.

## Фаза 3 — отклики и выбор блогера

- **Модель `Response`** (миграция `add_responses`): `lotId` → `Lot` (`onDelete: Cascade`),
  `bloggerId` → `BloggerProfile` (`onDelete: Cascade`), `message String`, `status ResponseStatus`
  (enum `pending/accepted/rejected`), `@@unique([lotId, bloggerId])` — один блогер на лот.
  Индексы `(lotId)`, `(bloggerId)`. `Lot` получил поле `chosenResponseId String?`.
- **4 эндпоинта** на слоистой структуре:
  - `POST /lots/:id/responses` (JWT, blogger-only): проверяет, что лот `active`; что у блогера
    нет отклика на этот лот (409); создаёт отклик со статусом `pending`.
  - `GET /lots/:id/responses` (JWT, company-owner-only): список откликов с краткой инфой блогера
    (имя, аватарUrl, категории, linkedAccounts). Краткая инфа прикладывается отдельным запросом
    (`bloggerProfile.findMany`) — так же как компания к лотам, без N+1.
  - `GET /me/responses` (JWT, blogger-only): отклики текущего блогера со статусами.
  - `POST /lots/:id/responses/:responseId/accept` (JWT, company-owner-only): **одна транзакция**
    (`$transaction`): принятый → `accepted`; остальные отклики лота → `rejected` (`updateMany`);
    `lot.status → in_progress`; `lot.chosenResponseId = responseId`. Лот не `active` → 400.
- **`$transaction` в узком `Db`-интерфейсе.** Для accept нужна атомарность. Добавлен
  `$transaction<T>(fn: (tx: TxDb) => Promise<T>)`, где `TxDb = { response, lot }` — минимальный
  клиент внутри транзакции. Реальный `PrismaClient` структурно совместим (он супер-тип `TxDb`),
  тестовый `testDb` (реальный клиент) — тоже.
- **Сериализатор** `serializers/response.ts`: `toResponseDto` — без блогера (для `/me/responses`);
  `toResponseDtosWithBlogger` — с блогером за один доп. `findMany` по `bloggerId` (без N+1).
- **`bloggerProfile.findMany`** добавлен в `Db`-интерфейс (аналогично `companyProfile.findMany`).
- **Фронт:** `LotDetail` стал ролезависимым (получил проп `user: ApiUser`):
  - **Блогер**: кнопка «Откликнуться» → `Textarea` → `POST` (или блок «Ваш отклик» + статус).
    Текущий отклик ищется через `GET /me/responses` после загрузки лота.
  - **Компания**: секция «Отклики (N)» с карточками блогеров; кнопка «Выбрать» → `Modal`
    подтверждения → `POST .../accept` → перезагрузка лота и откликов.
  - **`MyResponses`** (новый экран, ранее заглушка): список откликов блогера с названием лота
    и статусом (принят/отклонён/на рассмотрении). Названия лотов подгружаются через
    `/lots?limit=200` — пока откликов мало, N+1 API-запросов нет.
  - **`BloggerHome`**: добавлена кнопка «Отклики» → переход на `MyResponses`.
  - **`Dashboard`**: добавлен `view: 'myResponses'`; `LotDetail` получает `user` пропом.

> Дальнейшие решения (хостинг, PSP, юр. субъект) — см. PLAN.md §7, заполняется по фазам.
