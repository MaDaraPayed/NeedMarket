# UI Inventory — NeedMarket miniapp

> Дата инвентаризации: 2026-06-21  
> Версия: после ЧАСТИ 9D (поддержка frontend B, admin-сторона)  
> Код не менялся — только описание.

---

## 1. Архитектура входа и шеллов

### Поток авторизации (App.tsx → AuthProvider.tsx)

**AuthProvider** стартует со статусом `loading`:

1. `retrieveRawInitData()` (tma.js SDK) — если вне Telegram (нет mock) → статус `no-telegram` → заглушка «Откройте в Telegram 📲»
2. POST `/auth` с initData → если 401 → статус `unauthorized` → заглушка «Подпись не подтверждена 🔒»; если иная ошибка → статус `error ⚠️`
3. GET `/me` → статус `authed {user, token}` → рендерит `<Home>`

**App.tsx** при загрузке показывает Spinner + «Подключаемся к серверу...»

---

### Home.tsx — выбор шелла

`Home` вычисляет три флага из `ApiUser`:

```
hasMarketplace = user.role !== null
hasAdmin       = user.isAdmin
hasMultiple    = hasMarketplace && hasAdmin
```

**`parseStartParam()`** разбирает `?startapp=` из URL:

| `startapp=` | Результат |
|---|---|
| `lot_<id>` | `{ kind: 'lot', id }` |
| `support_<ticketId>` | `{ kind: 'support', ticketId }` |
| `admin_payment` | `{ kind: 'admin', section: 'payment' }` |
| `admin_payout` | `{ kind: 'admin', section: 'payout' }` |
| `admin_dispute` | `{ kind: 'admin', section: 'disputes' }` |
| `admin_support` | `{ kind: 'admin', section: 'support' }` |
| *(отсутствует или неизвестный)* | `null` |

**Инициальный `activeShell`** выбирается один раз при маунте:

| Условие | activeShell |
|---|---|
| `isAdmin && !hasMarketplace` | `'admin'` |
| `hasMarketplace && !isAdmin` | `'marketplace'` |
| диплинк `admin_*` | `'admin'` |
| диплинк `lot_*` или `support_*` | `'marketplace'` |
| дефолт | `'marketplace'` |

**`showSelector`** = true только при `hasMultiple && startParam === null`.  
Переключение вида — **только через переоткрытие приложения** → попадают на ViewSelector.  
В коде нет кнопки «Сменить вид» и нет `localStorage nm_active_view`.

**Матрица рендера:**

| hasMarketplace | hasAdmin | startParam | Результат |
|---|---|---|---|
| false | false | любой | RoleSelect (онбординг) |
| false | true | любой | AdminShell |
| true | false | любой | Dashboard (marketplace) |
| true | true | `null` | **ViewSelector** |
| true | true | `admin_*` | **AdminShell** (с секцией) |
| true | true | `lot_*` / `support_*` | **Dashboard** (с initialLotId / initialTicketId) |

**Форма профиля** вставляется между Home и Dashboard:  
если `user.profile === null || editing` → `BloggerForm` или `CompanyForm` (по `user.role`).

---

### AdminShell — переключение AdminPanel ↔ AdminSupportPanel

`AdminShellView`: `'panel'` | `'support'`

- Диплинк `admin_support` → `initialSection='support'` → сразу `AdminSupportPanel`
- Иначе → `AdminPanel` с `initialSection` (payment / payout / disputes)
- Кнопка «Открыть →» в AdminPanel.поддержка → `setView('support')`
- «← Назад» в AdminSupportPanel → `setView('panel')`

---

## 2. Карта экранов и маршрутов

### Общие (до выбора роли)

| Экран | Компонент | Кто видит | Как попасть |
|---|---|---|---|
| Загрузка | App.tsx (Spinner) | все | Авто при старте |
| Заглушки ошибок | App.tsx (Placeholder) | все | Авто при ошибке auth |
| RoleSelect | RoleSelect.tsx | новый пользователь (`role=null`, `!isAdmin`) | Авто после авторизации |
| ViewSelector | ViewSelector.tsx | дуал-кап без диплинка | Авто при старте |

### Онбординг / профили

| Экран | Компонент | Кто видит | Как попасть |
|---|---|---|---|
| BloggerForm (создание) | BloggerForm.tsx | blogger без профиля | Авто после RoleSelect |
| BloggerForm (редакт.) | BloggerForm.tsx | blogger | Кнопка «Редактировать» в ProfileView |
| CompanyForm (создание) | CompanyForm.tsx | company без профиля | Авто после RoleSelect |
| CompanyForm (редакт.) | CompanyForm.tsx | company | Кнопка «Редактировать» в ProfileView |
| ProfileView | ProfileView.tsx | blogger / company | Кнопка «Профиль» в шапке |
| Settings | Settings.tsx | blogger / company | Кнопка «Настройки» в шапке |

### Маркет блогера

| Экран | Компонент | Кто видит | Как попасть |
|---|---|---|---|
| BloggerHome (лента лотов) | BloggerHome.tsx | blogger | Dashboard `view='home'` при role=blogger |
| LotDetail | LotDetail.tsx | blogger | Тап по LotCard; диплинк `lot_<id>` |
| MyResponses | MyResponses.tsx | blogger | Кнопка «Отклики» в BloggerHome |
| SavedSearches | SavedSearches.tsx | blogger | Кнопка «Поиски» в BloggerHome |

### Маркет компании

| Экран | Компонент | Кто видит | Как попасть |
|---|---|---|---|
| CompanyHome (мои лоты) | CompanyHome.tsx | company | Dashboard `view='home'` при role=company |
| CreateLotForm | CreateLotForm.tsx | company | Кнопка «+ Создать лот» в CompanyHome |
| LotDetail | LotDetail.tsx | company | Тап по LotCard |

### Поддержка пользователя

| Экран | Компонент | Кто видит | Как попасть |
|---|---|---|---|
| SupportList | SupportList.tsx | blogger / company | Кнопка «Поддержка» в BloggerHome / CompanyHome |
| SupportCreateForm | SupportCreateForm.tsx | blogger / company | «+ Создать заявку» в SupportList |
| SupportThread | SupportThread.tsx | blogger / company | Тап по тикету в SupportList; диплинк `support_<id>` |

### Администрация

| Экран | Компонент | Кто видит | Как попасть |
|---|---|---|---|
| AdminPanel | AdminPanel.tsx | admin | AdminShell (panel view) |
| AdminSupportPanel | AdminSupportPanel.tsx | admin | Кнопка «Открыть →» в AdminPanel; диплинк `admin_support` |

---

## 3. Описание экранов (структура сверху вниз)

---

### RoleSelect

**Назначение:** первый запуск — выбор роли (необратимо).

**Блоки:**
- Заголовок `Title level=1` «Кто вы на площадке?»
- `Text` подпись «Роль выбирается один раз — сменить её позже нельзя» (hint_color)
- Карточка `Section > Cell` «Я блогер» (before=🎬 48px, subtitle «Откликаюсь на проекты брендов», after=Spinner/›)
- Карточка «Я компания» (before=🏢, subtitle «Размещаю проекты и ищу блогеров», after=Spinner/›)
- Строка ошибки (destructive_text_color)

**Действия:** тап по карточке → PUT `/me/role` → `onDone(user)` → переход к BloggerForm / CompanyForm

**Состояния:** loading (Spinner вместо ›, карточки заблокированы); ошибка (текст снизу)

---

### ViewSelector

**Назначение:** дуал-кап пользователь выбирает вид перед входом.

**Блоки:**
- `Title level=1` «Выберите вид»
- `Text` «Для этого аккаунта доступно несколько режимов работы» (hint_color)
- `Section > Cell` «Войти как Блогер / Войти как Компания» (before=🎬/🏢 48px, subtitle «Маркетплейс блогеров и компаний», after=›)
- `Section > Cell` «Войти как Администрация» (before=⚙️ 48px, subtitle «Управление лотами, выплатами, спорами», after=›)

**Действия:** тап → `onSelect('marketplace' | 'admin')`

---

### BloggerForm

**Назначение:** создание / редактирование профиля блогера.

**Блоки:**
1. `Title level=2` «Расскажите о себе» / «Профиль блогера»
2. `Section header="Основное"`:
   - `Input` «Имя / название блога» (обязательно, status=error при пустом)
   - `Textarea` «О себе»
   - `Input` «Город»
3. `Section header="Контакт"` footer «Как с вами связаться после выбора»:
   - `SegmentedControl` (Username / Телефон / Другое)
   - `Input` (тип меняется по сегменту: text / tel)
   - При Телефон: кнопка «Получить номер из Telegram» (requestContact) + hint при ошибке
4. `Section header="Аватар"` footer (только при создании: «Сохраните профиль — затем сможете добавить аватар»):
   - Превью 88×88px (круглое, объект/инициалы/👤)
   - Кнопки «Выбрать фото» / «Заменить» (disabled до первого сохранения) + «Загрузить» (после выбора файла)
   - Ошибка загрузки (destructive_text_color)
5. `Section header="Категории"` footer «Выберите темы, в которых вы работаете»:
   - Набор `CategoryChip` мультивыбор
6. `Section header="Аккаунты"` footer «Ссылки на ваши площадки (необязательно)»:
   - Динамический список: `Input` Платформа + `Input` Ссылка + `Input` Подписчики + «Удалить аккаунт»
   - `Cell` «+ Добавить аккаунт»
7. Строка ошибки
8. (mock-only) `Button` filled «Сохранить» / «Продолжить»; «Отмена» bezeled (только при редактировании)

**Действия:** MainButton (нативная Telegram) «Сохранить» / «Продолжить»; загрузка аватара — отдельным шагом, не блокирует сохранение профиля

**Валидация:** `displayName.trim().length > 0` (canSave)

---

### CompanyForm

**Назначение:** создание / редактирование профиля компании.

**Блоки:**
1. `Title level=2` «Расскажите о компании» / «Профиль компании»
2. `Section header="О компании"`:
   - `Input` «Название» (обязательно, status=error при пустом)
   - `Input` «Сфера»
   - `Input` «Город»
3. `Section header="Логотип"` footer (при создании: «Сохраните профиль — затем сможете добавить логотип»):
   - Превью 88×88px (скруглённые углы 16px, объект/инициалы/🏢)
   - «Выбрать изображение» / «Заменить»; «Загрузить» (после выбора)
4. `Section header="Контакт"` footer «Как с вами связаться после выбора блогера»:
   - `SegmentedControl` Username / Телефон / Другое + `Input` + кнопка «Получить номер из Telegram»
5. Строка ошибки; (mock-only) «Сохранить» / «Продолжить» + «Отмена»

**Валидация:** `name.trim().length > 0`

---

### ProfileView

**Назначение:** просмотр собственного профиля (read-only).

**Блоки:**
- Шапка: `Avatar` 48px + `Title level=2` (имя/название) + подпись «Блогер» / «Компания» (hint_color)
- **Блогер:** `Section "О себе"` (bio, город); `Section "Категории"` (Chip list); `Section "Аккаунты"` (Cell: платформа/ссылка/подписчики)
- **Компания:** `Section "О компании"` (сфера, город, контакт)
- Кнопки: «Редактировать» (filled) + «Назад» (bezeled, если `onBack`)

---

### Settings

**Назначение:** управление уведомлениями.

**Блоки:**
- `Title level=2` «Настройки» + кнопка «Назад»
- `Section "Уведомления"`:
  - `Cell` «Уведомления» + description «Получать уведомления в Telegram о статусе лотов и откликов» + `Switch`

**Действие:** Switch → PATCH `/me/settings {notificationsEnabled}` → `onUpdated(user)`

---

### BloggerHome

**Назначение:** лента открытых лотов для блогера с фильтрацией.

**Блоки:**
1. Шапка: `Title level=2` «Открытые проекты» + кнопки (size=s, mode=bezeled): «Отклики», «Поиски», «Поддержка», «Профиль», «Настройки» (если передан)
2. `Section header="Категории"` footer «Выбрано: N» (при выборе):
   - Горизонтальный wrapping `SelectChip` — мультивыбор из `CATEGORIES`
3. `Section header="Площадка"`:
   - Горизонтальный wrapping `SelectChip` — одиночный выбор из `PLATFORMS`
4. `SelectChip` «Скрыть, на которые откликнулся» (toggle)
5. Лента `LotCard` (reactKey=lot.id)

**Состояния:** Spinner + «Загружаем ленту...»; Placeholder ⚠️ при ошибке; `Section > Cell` «Подходящих проектов пока нет» при пустой ленте

**Данные:** `fetchLots` перезапускается при изменении `[token, categories, platform, hideResponded]`

---

### LotCard (компонент)

**Назначение:** карточка лота в ленте и списке.

**Структура:**
- `Section > Cell`:
  - `before`: `Avatar` 40px (логотип или инициалы компании)
  - основной текст: название лота + (если `hasResponded`) «· Вы откликнулись» (accent_text_color, 500 weight)
  - `subtitle`: название компании
  - `description`: «категории · площадки · бюджет · до дедлайна · Выбрано N из M»
  - `after`: `statusLabel` цветной текст (при `showStatus=true`) ИЛИ «›» (hint_color)

---

### CompanyHome

**Назначение:** список собственных лотов компании.

**Блоки:**
1. Шапка: `Title level=2` «Ваши лоты» + кнопки «Поддержка», «Профиль», «Настройки»
2. `Button` size=l, stretched, filled «+ Создать лот»
3. При ошибке: Placeholder ⚠️
4. Spinner «Загружаем ваши лоты...»
5. При пустом списке: `Section > Cell` «Пока нет лотов» + subtitle с именем пользователя
6. При наличии лотов:
   - `Section header="Стадия"`: SelectChip фильтр (Все/Ждёт оплаты/Активен/В работе/Ожидает выплаты/Завершён) + счётчики в скобках
   - SelectChip «Скрыть завершённые» (toggle) + SelectChip сортировка «↓ Новые / ↑ Старые»
   - Лента: LotCard (showStatus=true) + DeleteLotButton (только для `awaiting_payment` / `active`)

**DeleteLotButton:** первый клик — «Удалить» (plain, destructive); второй клик — inline-подтверждение «Удалить лот? Действие необратимо.» с кнопками «Отмена» / «Удалить» (filled, destructive bg)

---

### LotDetail

**Назначение:** детальный просмотр лота; разные блоки по роли пользователя.

**Блоки (сверху вниз):**

1. **Шапка:** `Avatar` 48px (логотип / инициалы) + `Title level=2` (название лота) + название компании (hint_color) + тапабельная кнопка-рейтинг компании (border outline, показывает «★ X.X (N)» или «нет отзывов»; тап → ReviewsModal)

2. **Статусные баннеры** (secondary_bg, outline border, radius 10):
   - `awaiting_payment`: «⏳ Лот ожидает оплаты — с вами свяжется менеджер для активации»
   - `awaiting_payout`: «💳 Ожидает выплаты — лот закроет администратор после перевода средств блогерам»
   - `completed`: «✅ Сделка завершена — оставьте отзыв партнёру» (borderColor=#4CAF50, color=#2e7d32)

3. **Блокирующий баннер `awaiting_decision`** (orange, только для владельца-компании при выигранном споре):
   - «⚖️ Спор решён в вашу пользу»
   - «Выберите дальнейшее действие по блогеру»
   - Кнопки: «Продолжить работу» (filled) / «Отказаться от блогера» (bezeled, destructive цвет) → confirm Modal

4. **Баннер `awaiting_decision` для блогера:** «⏳ Ожидается решение компании»

5. **Кнопка «Проект завершён»** (company-owner, active/in_progress + acceptedCount≥1):
   - Если `awaiting_decision` → disabled + «Сначала решите по спорному блогеру»
   - Если `myDisputeStatus='open'` → disabled + «Есть нерешённый спор — завершение заблокировано»
   - Иначе → active → открывает confirm Modal

6. **`Section header="Условия"`:** Cell subhead: Категории / Площадки / Бюджет / Дедлайн / Статус / «Блогеров нужно»

7. **`Section header="Описание"`:** Cell multiline

8. **`Section header="Требования"`:** Cell с ✓ (или «—» при пустом)

9. **Вложения:**
   - Владелец (company-owner): `CompanyAttachmentsBlock` — превью + «+ Добавить файл» + ×-удаление; accept: PNG/JPEG/WebP/PDF/Office/txt ≤10 МБ ≤10 штук
   - Блогер/чужой: `BloggerAttachmentsBlock` — только просмотр (картинки 80×80, файлы — чип-ссылка 📄)

10. **Блок блогера** (role=blogger, только при загруженном `myResponse`):
    - Нет отклика + лот active → `BloggerResponseBlock`: `Section "Откликнуться"` + Textarea «Расскажите, почему вы подходите...» + `Button` filled «Отправить отклик»
    - Есть отклик → `Section "Ваш отклик"`: Cell (текст + ResponseStatusBadge subhead) + DisputeBanner / кнопка «Открыть спор»
    - completed + accepted/disputed → `Section "Оценка компании"`: GivenReviewBadge (если уже оценил) + ReceivedReviewBadge (если есть отзыв от компании) + Button «Оценить компанию» → Modal ReviewForm

11. **Список откликов** (company-owner):
    - `Section header="Отклики (N) · выбрано M/K"`
    - Карточки `ResponseCard` на каждый отклик

12. **Кнопка «Назад»** (bezeled, stretched)

**ResponseCard:**
- `Avatar` 40px + имя блогера (bold) + категории + рейтинг «★ X.X (N)» (gold)
- Аккаунты: «платформа · NNK подписчиков»
- Текст отклика
- `DisputeBanner` (если есть спор): оранжевый / серый
- `ResponseStatusBadge` (⏳ / ✅ / ❌ / ⚖️)
- Кнопки:
  - «Выбрать» (filled) + «Отклонить» (bezeled) — только pending + slotsOpen
  - «Посмотреть профиль» → BloggerProfileModal
  - «Связаться» (bezeled/plain; копирует contact или openTelegramLink)
  - «Оценить» (bezeled) — completed + (accepted/disputed) + нет givenReview → Modal ReviewForm
  - «Открыть спор» (bezeled) — in_progress/awaiting_payout + accepted + нет спора → Modal DisputeForm
- GivenReviewBadge + ReceivedReviewBadge (если есть)

**Модалки в LotDetail:**
| Модалка | Условие открытия |
|---|---|
| Подтверждение выбора блогера | Кнопка «Выбрать» в ResponseCard |
| Подтверждение завершения лота | Кнопка «Проект завершён» |
| Подтверждение отклонения после спора | «Отказаться от блогера» в awaiting_decision-баннере |
| ReviewForm (компания → блогер) | Кнопка «Оценить» в ResponseCard |
| ReviewForm (блогер → компания) | Кнопка «Оценить компанию» |
| DisputeForm (от компании) | «Открыть спор» в ResponseCard |
| DisputeForm (от блогера) | «Открыть спор» в блоке своего отклика |
| ReviewsModal | Тап по рейтингу компании в шапке |
| BloggerProfileModal | «Посмотреть профиль» в ResponseCard |

---

### CreateLotForm

**Назначение:** создание нового лота компанией.

**Блоки:**
1. `Title level=2` «Новый лот»
2. `Section "О проекте"`:
   - `Input` «Заголовок» (status=error при пустом, placeholder «Например, обзор крема в Reels»)
   - `Textarea` «Описание»
3. `Section "Категории"` footer «Выберите одну или несколько»:
   - SelectChip мультивыбор
4. `Section "Площадки"` footer «Где нужна реклама (минимум одна)»:
   - SelectChip мультивыбор
5. `Section "Бюджет и срок"`:
   - `Input` «Бюджет, ₸» (type=number, status=error если ≤0)
   - `Input` «Количество блогеров» (type=number, 1–20, status=error если вне диапазона)
   - `Input` «Дедлайн» (type=date, status=error если прошлое)
6. `Section "Материалы лота"` footer «Добавьте изображения, PDF или документы прямо в карточке лота»:
   - Cell «Брифы, референсы и другие файлы можно прикрепить после публикации лота» (hint_color)
7. `Section "Требования"` footer «Чек-лист для блогера (необязательно)»:
   - Динамический список Input + «Удалить пункт»
   - `Cell` «+ Добавить требование»
8. Строка ошибки; (mock-only) «Опубликовать лот» filled + «Отмена» bezeled

**Главное действие:** MainButton «Опубликовать лот» (disabled при !canSave)

**canSave:** заголовок + описание + ≥1 категория + ≥1 площадка + budget>0 + дедлайн в будущем + slots 1–20

---

### MyResponses

**Назначение:** список откликов блогера с данными лота.

**Блоки:**
1. Шапка: «← Назад» (bezeled) + `Title level=2` «Мои отклики»
2. `Section "Статус"`: SelectChip фильтр (Все / На рассмотрении / Принят / Отклонён + счётчики)
3. SelectChip «Скрыть отклонённые» (toggle) + сортировка «↓ Новые / ↑ Старые»
4. Section с Cell на каждый отклик:
   - Заголовок лота (bold) + `subtitle`=statusLabel
   - Вторая строка: бюджет/дедлайн/статус лота (hint_color)
   - Третья строка: текст отклика
   - Тап → `onOpenLot(r.lotId)` → LotDetail

**Состояния:** Spinner; Placeholder «Откликов пока нет» / «Под этот фильтр ничего нет»

---

### SavedSearches

**Назначение:** CRUD сохранённых поисков (blogger-only).

**Блоки:**
1. Шапка: `Title level=2` «Мои поиски» + «← Назад»
2. `Button` filled stretched «+ Создать поиск»
3. Section: Cell на каждый поиск
   - имя (bold) + кнопки «Изменить» / «Удалить»
   - `subtitle`: criteria (категории · площадки · от N ₸)
   - `after`: `Switch` (isActive)
4. Пустое: Placeholder 🔍 «Нет сохранённых поисков»

**Модалка создания/редактирования:**
- `Title level=3` «Новый поиск» / «Редактировать поиск»
- `<input>` «Название (необязательно)» (raw styled input, border hint_color, radius 8)
- `Section "Категории"` footer «Пусто = любая»: SelectChip мультивыбор
- `Section "Площадки"` footer «Пусто = любая»: SelectChip мультивыбор
- `<input type=number>` «Минимальный бюджет, ₸ (необязательно)»
- Строка ошибки
- `Button` filled stretched «Сохранить»

**Модалка удаления:** «Удалить поиск? "<Название>" будет удалён безвозвратно» + «Отмена» / «Удалить» (filled destructive bg)

---

### SupportList

**Назначение:** список тикетов поддержки пользователя.

**Блоки:**
1. Шапка: `Title level=2` «Поддержка» + «Назад»
2. `Button` filled stretched «+ Создать заявку»
3. Карточки TicketCard (custom div, secondary_bg, radius 12):
   - Тип-бейдж (pill, bg=link_color/#hint, text=white)
   - Статус-бейдж (outline, border/text=link_color/#hint)
   - Тема (текст, 15px, ellipsis)
   - Relative time (hint_color)
   - Точка hasUnread (8px, link_color, absolute top-right)
4. Пустое: `Section > Cell` «Заявок пока нет»

---

### SupportCreateForm

**Назначение:** создание новой заявки в поддержку.

**Блоки:**
1. Шапка: `Title level=2` «Новая заявка» + «Отмена»
2. `Section "Тема"`: `Input` (≤200 символов) + счётчик
3. `Section "Тип"`: SelectChip «Заявка» / «Идея»
4. `Section "Сообщение"` footer «Обязательно: текст и/или хотя бы одно вложение»:
   - `Textarea` (≤4000 символов) + счётчик
5. `Section "Вложения"` footer «Любой формат — до 10 МБ, максимум 10 файлов»:
   - Список прикреплённых (📎 имя + ×)
   - `Button` bezeled «+ Прикрепить файл» (hidden file input, accept=\*)
6. Строка ошибки; (mock-only) «Отправить» filled

**Главное действие:** MainButton «Отправить»

**Валидация:** тема непустая + (текст.trim() ИЛИ вложение ≥1)

---

### SupportThread

**Назначение:** переписка пользователя с поддержкой.

**Раскладка:** `display:flex, flexDirection:column, height:100dvh`

**Блоки:**
1. **Шапка (flex-shrink:0):** «← Назад» + тема (ellipsis) + тип-бейдж + статус-бейдж; border-bottom divider_color
2. **Область сообщений (flex:1, overflowY:auto, padding 12×16):** MessageBubble на каждое
   - `fromAdmin=false` (юзер) → правый пузырь, link_color bg, белый текст, border-radius «16 16 4 16»
   - `fromAdmin=true` (поддержка) → левый пузырь, secondary_bg, text_color, метка «Поддержка»; radius «16 16 16 4»
   - Вложения: картинки `<img>` ≤200px / файлы — ссылка-чип 📄
   - Время (HH:MM, opacity 0.6)
3. **Баннер «Тикет закрыт»** (closed): padding 10px, secondary_bg, hint_color; border-top divider
4. **Поле ввода** (только открытый, flex-shrink:0):
   - Список pending-вложений (чипы с ×)
   - Кнопка 📎 (border:none, link_color, 22px) + `<textarea>` (rows=1, auto-grow ≤120px, Enter без Shift → send) + (mock-only) round-кнопка ↑

**Поллинг:** `setInterval(fetchSupportTicket, 5000)` + `clearInterval` при unmount

**Оптимистичное добавление:** после sendMessage — сразу append в `thread.messages`, не ждём поллинга

**Главное действие:** MainButton «Отправить» (visible только при открытом тикете)

---

### AdminPanel

**Назначение:** панель администратора — 4 секции: оплата / выплата / поддержка / споры.

**Блоки:**
1. Шапка: `Title level=2` «Панель администратора» + кнопка «Назад» (если `onBack`)
2. **Секция «Ожидают оплаты»:** AwaitingPaymentCard на каждый лот; «Нет лотов, ожидающих оплаты»
3. **Секция «Ожидают выплаты»** (ref для deep-link скролла): AwaitingPayoutCard; «Нет лотов»
4. **Секция «Поддержка»** (только если `onOpenSupport`):
   - Шапка: «Поддержка» + Button filled «Открыть →»
   - `Section > Cell` multiline «Раздел поддержки» + subtitle «Заявки и вопросы от пользователей платформы»
5. **Секция «Споры»** (ref для deep-link скролла):
   - Заголовок + badge (openDisputeCount, button_color bg, button_text_color)
   - Тумблер «Открытые / Разрешённые» (filled/bezeled)
   - DisputeCard на каждый спор

**AwaitingPaymentCard:**
- Название (bold 15) + категории/площадки (hint_color)
- «Компания:» имя; «Бюджет:» + дедлайн
- «Контакт:» (link_color, тап → copyText)
- Кнопки: «Связаться в Telegram» (bezeled, если username) или «Скопировать контакт» (bezeled) + «Активировать лот» (filled); «Скопировано» 1.5с
- Строка ошибки

**AwaitingPayoutCard:**
- Название + категории/площадки/дедлайн; компания + @username-ссылка (link_color)
- Блок разбивки (secondary_bg, radius 8): Бюджет / Комиссия 10% (hint) / К выплате блогерам (button_color bold)
- Список PayoutBloggerCard: Avatar 40px + имя + категории + контакт; кнопки «Профиль» → BloggerProfileModal, «Связаться»
- Кнопка «Закрыть лот» (filled) → confirm Modal «Закрыть лот? Подтвердите, что выплата проведена»

**DisputeCard:**
- Название лота (bold 15)
- Бюджет / Комиссия / К выплате (row в secondary_bg)
- Badge «Инициатор: Компания / Блогер» (цветной)
- Секции «Компания» / «Блогер»: имя, контакт, Button plain «Связаться»
- «Причина:» (текст из DISPUTE_REASONS) + описание (secondary_bg, pre-wrap)
- Вложения: картинки 40×40 (preview) / файлы — чип-ссылка 📄
- **Если resolved:** «✅ Разрешён: <исход>» + заметка
- **Если open:** Textarea «Заметка (необязательно)» (≤1000) + кнопки исходов (В пользу компании=filled / В пользу блогера=bezeled / Частично=outline)

**Deep-link прокрутка:** `scrollIntoView({behavior:'smooth'})` к нужной секции при маунте (после загрузки данных)

---

### AdminSupportPanel

**Назначение:** 3-уровневый интерфейс поддержки для администратора.

**Раскладка:** `display:flex, flexDirection:column, height:100dvh`

Глобальная шапка (flex-shrink:0): «← Назад» + заголовок уровня (меняется при навигации)

**UsersView (Поддержка — пользователи):**
- Карточки AdminSupportUserDto (custom div, secondary_bg, radius 12):
  - 🏢/👤/❓ + имя (bold 15)
  - «Тикетов: N» + «Открытых: M» (link_color) + relative time
  - Точка hasUnread (link_color, absolute top-right)
- Тап → TicketsView

**TicketsView (Тикеты: Имя):**
- Подпись с именем пользователя (hint_color)
- Тумблер «Все / Открытые / Закрытые»
- Карточки тикетов (тип-бейдж, статус-бейдж, тема, время, точка hasUnread)
- Тап → ThreadView

**ThreadView (Тред):**
- **Шапка тикета** (border-bottom):
  - Тема (bold 15, ellipsis) + тип-бейдж + статус-бейдж
  - Кнопка «Закрыть» (bezeled, destructive цвет) / «Открыть» (filled) — toggle; PATCH `/admin/support/tickets/:id`
  - Автор: эмодзи роли + имя (text_color bold) + @username-кнопка (link_color → openTelegramLink) или contact-ссылка (копирование)
- **Область сообщений:** MsgBubble — `fromAdmin=true` → правый (link_color), `fromAdmin=false` → левый (secondary_bg), метка «Пользователь»
- **Поллинг** 5 с + clearInterval при unmount
- **Баннер закрытого тикета:** «Тикет закрыт — нажмите «Открыть», чтобы возобновить переписку»
- **Поле ввода:** 📎 + `<textarea>` «Ответ пользователю...» + MainButton «Ответить»

---

## 4. Навигация

### Роутинг

Нет URL-роутера. Вся навигация — через React state (stack-like pattern).

**Dashboard:** `view: View` (union type)  
**AdminSupportPanel:** `AdminSupportView` (users → tickets → thread)

### Переходы Dashboard

```
Home (BloggerHome)
  ├── [кнопка «Отклики»]       → MyResponses
  ├── [кнопка «Поиски»]        → SavedSearches
  ├── [кнопка «Поддержка»]     → SupportList
  │     ├── [создать]          → SupportCreateForm → (после создания) SupportThread
  │     └── [тап по тикету]    → SupportThread
  ├── [кнопка «Профиль»]       → ProfileView → [«Редактировать»] → BloggerForm
  ├── [кнопка «Настройки»]     → Settings
  └── [тап по LotCard]         → LotDetail

Home (CompanyHome)
  ├── [«+ Создать лот»]        → CreateLotForm → (после создания) Home
  ├── [кнопка «Поддержка»]     → SupportList (аналогично)
  ├── [кнопка «Профиль»]       → ProfileView
  ├── [кнопка «Настройки»]     → Settings
  └── [тап по LotCard]         → LotDetail
```

Все «Назад» ведут к `goHome()` (view='home').

### Переходы AdminShell

```
AdminPanel
  └── [«Открыть →» поддержка] → AdminSupportPanel
        └── [«← Назад»]       → AdminPanel

AdminSupportPanel (внутри):
  users → tickets (userId) → thread (ticketId)
  «← Назад» на thread → tickets → users → onBack() (AdminPanel)
```

### Нижняя навигация / табы

**Нет.** Весь доступ через кнопки в шапке экранов или тап по карточкам.

### Список модалок

| Модалка | Компонент-владелец |
|---|---|
| Подтверждение выбора блогера | LotDetail |
| Подтверждение завершения лота | LotDetail |
| Подтверждение отклонения после спора | LotDetail |
| ReviewForm (блогер → компания) | LotDetail |
| ReviewForm (компания → блогер) | LotDetail / ResponseCard |
| DisputeForm (от компании / блогера) | LotDetail |
| ReviewsModal (о компании) | LotDetail |
| BloggerProfileModal (в откликах) | LotDetail / ResponseCard |
| BloggerProfileModal (в AdminPanel) | PayoutBloggerCard |
| ReviewsModal (о блогере) | BloggerProfileModal |
| Confirm «Закрыть лот» | AwaitingPayoutCard |
| SavedSearch Edit/Create | SavedSearches |
| SavedSearch Delete confirm | SavedSearches |

### Чат-поллинг (setInterval)

| Место | Интервал | Очистка |
|---|---|---|
| SupportThread (юзер) | 5 000 мс | clearInterval при unmount |
| AdminSupportPanel / ThreadView | 5 000 мс | clearInterval при unmount |

---

## 5. Компоненты

### SelectChip

**Файл:** [components/SelectChip.tsx](apps/miniapp/src/components/SelectChip.tsx)

**Назначение:** кнопка-чип с явным selected-состоянием. Выбранный чип: заливка `button_color`, белый (button_text_color) текст, галочка ✓. Невыбранный: прозрачный фон, `text_color`, граница `hint_color`. Transition 0.15s.

**Используется:** BloggerHome (фильтры категорий, площадок, hideResponded), CompanyHome (фильтры статуса, hideCompleted, sort), CreateLotForm (категории, площадки), MyResponses (фильтр статуса, hideRejected, sort), SavedSearches (категории/площадки в форме), SupportCreateForm (тип), DisputeForm (причина)

---

### BloggerProfileModal

**Файл:** [components/BloggerProfileModal.tsx](apps/miniapp/src/components/BloggerProfileModal.tsx)

**Назначение:** модалка просмотра профиля блогера (чужого). Показывает Avatar 96px, имя, город, `RatingChip` (тапабельный → вложенный ReviewsModal), категории, bio, список аккаунтов (платформа · NNK), кнопку «Связаться с блогером» (openTelegramLink / copyText).

**Используется:** LotDetail (ResponseCard), AdminPanel (PayoutBloggerCard)

---

### ReviewForm

**Файл:** [components/ReviewForm.tsx](apps/miniapp/src/components/ReviewForm.tsx)

**Назначение:** форма отзыва. Звёздный пикер 1-5 (★ gold, ☆ outline цвет), Textarea комментарий ≤500 символов (счётчик), Button filled «Отправить отзыв» (disabled при rating=0).

**Используется:** LotDetail (блогер → компания; компания → блогер в Modal)

---

### ReviewsModal

**Файл:** [components/ReviewsModal.tsx](apps/miniapp/src/components/ReviewsModal.tsx)

**Назначение:** модалка списка отзывов о пользователе. GET `/profiles/:userId/reviews` при открытии. Каждый отзыв: authorName (bold) + StarRating ★ + комментарий + дата (ru-RU). Пустое «Отзывов пока нет».

**Используется:** LotDetail (рейтинг компании), BloggerProfileModal (RatingChip)

---

### DisputeForm

**Файл:** [components/DisputeForm.tsx](apps/miniapp/src/components/DisputeForm.tsx)

**Назначение:** форма открытия спора. Причины-чипы (SelectChip, разные наборы для company/blogger), Textarea описание ≤1000 символов (счётчик), MainButton «Отправить».

Причины компании: `not_delivered`, `poor_quality`, `no_contact`, `terms_violation`, `other`  
Причины блогера: `no_payment`, `no_contact`, `terms_violation`, `other`

**Используется:** LotDetail (от компании и от блогера, в Modal)

---

### LotCard

**Файл:** [screens/lots/LotCard.tsx](apps/miniapp/src/screens/lots/LotCard.tsx)

**Используется:** BloggerHome, CompanyHome

---

### useMainButton

**Файл:** [useMainButton.ts](apps/miniapp/src/useMainButton.ts)

**Назначение:** хук управления нативной нижней кнопкой Telegram (MainButton). Монтирует кнопку при маунте, прячет при unmount (`setParams({isVisible:false})`). В `isMockEnv` (браузер) — бездействует; каждый экран показывает собственную кнопку-фолбэк.

**Используется:** BloggerForm, CompanyForm, CreateLotForm, SupportCreateForm, SupportThread, AdminSupportPanel/ThreadView, DisputeForm

---

### Inline-компоненты (внутри файлов)

| Компонент | Файл | Назначение |
|---|---|---|
| `AttachmentItem` | LotDetail.tsx | Превью вложения лота: картинка 80×80 (ссылка) / чип-документ 📄; кнопка ×-удалить для владельца |
| `CompanyAttachmentsBlock` | LotDetail.tsx | Блок загрузки вложений лота для владельца (company-owner) |
| `BloggerAttachmentsBlock` | LotDetail.tsx | Блок просмотра вложений лота для не-владельца |
| `ResponseStatusBadge` | LotDetail.tsx | Строка «⏳ На рассмотрении / ✅ Принят / ❌ Отклонён / ⚖️ Оспорен» |
| `DisputeBanner` | LotDetail.tsx | Баннер «⚖️ Спор на рассмотрении» (оранжевая граница) / «✅ Спор разрешён» (серая) |
| `GivenReviewBadge` | LotDetail.tsx | «Ваша оценка: ★★★☆☆» + комментарий (secondary_bg блок) |
| `ReceivedReviewBadge` | LotDetail.tsx | «<authorName>: ★★★★☆» + комментарий (secondary_bg блок) |
| `MessageBubble` | SupportThread.tsx | Пузырь сообщения юзер-поддержка |
| `MessageAttachment` | SupportThread.tsx | Вложение в пузыре: картинка инлайн / чип-ссылка 📄 |
| `MsgBubble` + `MsgAttachment` | AdminSupportPanel.tsx | Аналог для admin-стороны (fromAdmin → правый) |
| `AwaitingPaymentCard` | AdminPanel.tsx | Карточка лота, ожидающего оплаты |
| `AwaitingPayoutCard` | AdminPanel.tsx | Карточка лота, ожидающего выплаты |
| `PayoutBloggerCard` | AdminPanel.tsx | Строка блогера в payout-карточке |
| `DisputeCard` | AdminPanel.tsx | Карточка спора для администратора |
| `DeleteLotButton` | CompanyHome.tsx | Inline-подтверждение удаления лота |
| `UsersView` | AdminSupportPanel.tsx | Уровень 1: список пользователей поддержки |
| `TicketsView` | AdminSupportPanel.tsx | Уровень 2: список тикетов пользователя |
| `ThreadView` | AdminSupportPanel.tsx | Уровень 3: тред тикета для администратора |

---

## 6. Визуальный стиль

### Тема

Приложение использует `@telegram-apps/telegram-ui` с `bindCssVars`. Тёмная/светлая тема прозрачна для кода — все цвета через переменные. Явных проверок `themeParams.isDark` в компонентах нет.

### CSS-переменные (токены)

| Переменная | Применение |
|---|---|
| `--tgui--bg_color` | Фон экрана, шапка SupportThread |
| `--tgui--secondary_bg_color` | Фон карточек, баннеров, блоков, пузырей от поддержки |
| `--tgui--text_color` | Основной текст |
| `--tgui--hint_color` | Вторичный текст (подписи, даты, placeholder, «нет отзывов») |
| `--tgui--button_color` | Filled-кнопки, SelectChip selected, AdminPanel badge |
| `--tgui--button_text_color` | Текст на filled-кнопках, SelectChip selected |
| `--tgui--link_color` | Тип-бейджи тикетов, пузырь юзера в чате, 📎-кнопка, RatingChip-ссылки |
| `--tgui--destructive_text_color` | Ошибки, кнопка удаления, кнопка «Закрыть» тикет |
| `--tgui--outline` | Границы карточек AdminPanel, outline-кнопки, SelectChip unselected |
| `--tgui--divider_color` | Разделители в SupportThread/AdminSupportPanel (шапка, поле ввода) |
| `--tgui--accent_text_color` | Бейдж «Вы откликнулись» на LotCard |

### Компоненты telegram-ui

`Section`, `Cell`, `Button`, `Title`, `Text`, `Avatar`, `Chip`, `Spinner`, `Placeholder`, `Modal`, `Modal.Header`, `Input`, `Textarea`, `Switch`, `SegmentedControl`, `SegmentedControl.Item`

### Кастомные компоненты / CSS

- **SelectChip** и **CategoryChip** — кастомные `<button>`, `borderRadius: 18`, `padding: 7px 14px`, transition 0.15s
- **RatingChip** (BloggerProfileModal) — `<button>`, `borderRadius: 8`, `border: 1px solid --outline`
- **MessageBubble/MsgBubble** — flex div, border-radius «16 16 4 16» (правый) / «16 16 16 4» (левый), `maxWidth: 80%`
- **Карточки AdminPanel** — `border: 1px solid --outline, borderRadius: 12, padding: 12`
- **Баннеры статуса** — `secondary_bg + outline border + borderRadius: 10, padding: 10px 14px`
- **Badge AdminPanel sporov** — `background: --button_color, color: --button_text_color, borderRadius: 10, padding: 2px 7px`

### Паттерны раскладки

- **Основной контейнер** (скроллящиеся экраны): `padding: 16, paddingBottom: 32`
- **Чат-раскладка** (SupportThread, AdminSupportPanel): `height: 100dvh, display: flex, flexDirection: column` — шапка flex-shrink:0, сообщения flex:1 overflow:auto, ввод flex-shrink:0
- **Шапки экранов**: `display: flex, alignItems: center, justifyContent: space-between, marginBottom: 8/16`
- **Flex-wrap чипов**: `display: flex, flexWrap: wrap, gap: 8, padding: 12`
- **Разбивка выплат** (AwaitingPayoutCard): `display: flex, justifyContent: space-between` в secondary_bg блоке

### Иконки

Только Unicode-эмодзи (не иконочная библиотека):

| Символ | Контекст |
|---|---|
| 🎬 | Роль блогера |
| 🏢 | Роль компании |
| ⚙️ | Администрация |
| ⏳ | Ожидание (баннеры лота, статусы) |
| 💳 | awaiting_payout баннер |
| ✅ | completed / resolved-спор |
| ⚖️ | Спор |
| ⚠️ | Ошибка (Placeholder) |
| ★ / ☆ | Рейтинг (★ gold #FFD700) |
| 📎 | Прикрепить файл |
| 📄 | Файл-документ (чип-ссылка) |
| 📲 | Открыть в Telegram (заглушка) |
| 🔍 | Пустые сохранённые поиски |
| 👤 | Роль блогера (AdminSupportPanel) |
| ❓ | Неизвестная роль |
| ✓ | Чекмарк в SelectChip/CategoryChip |
| › | Стрелка вправо (Cell after) |
| ×  | Удалить (вложение, кнопка ×) |
| ↑ / ↓ | Сортировка (SelectChip) |

---

## 7. Уведомления-DM (services/notifications.ts)

Все уведомления — Telegram-сообщение с inline-кнопкой «Открыть NeedMarket» (`webApp` URL + `?startapp=<param>`).

Дедупликация: повторное уведомление того же типа на тот же `lotId / responseId / ticketId` не отправляется. `notificationsEnabled` уважается для пользовательских уведомлений; для admin-уведомлений — нет.

| Тип | Получатель | Текст (RU) | startapp-параметр |
|---|---|---|---|
| `new_response` | company-owner | «На ваш лот «{title}» поступил новый отклик.» | `lot_<id>` |
| `response_accepted` | blogger | «Ваш отклик на лот «{title}» принят!» | `lot_<id>` |
| `response_rejected` | blogger | «Ваш отклик на лот «{title}» отклонён.» | `lot_<id>` |
| `lot_completed` | blogger (accepted) | «Лот «{title}» завершён. Ожидайте выплаты.» | `lot_<id>` |
| `lot_activated` | company | «Ваш лот «{title}» активирован — блогеры уже могут откликаться.» | `lot_<id>` |
| `lot_withdrawn` | blogger | «Лот «{title}» был снят компанией.» | *(нет кнопки)* |
| `admin_lot_to_verify` | все admin | «Новый лот «{title}» ожидает оплаты.» | `admin_payment` |
| `admin_lot_to_payout` | все admin | «Лот «{title}» завершён компанией и ожидает выплаты.» | `admin_payout` |
| `saved_search_match` | blogger | «Новый лот по твоему сохранённому поиску: «{title}»» | `lot_<id>` |
| `dispute_opened` | другой участник пары | «По лоту «{title}» открыт спор. Администратор рассмотрит ситуацию.» | `lot_<id>` |
| `admin_dispute` | все admin | «Новый спор по лоту «{title}». Требуется ваше решение.» | `admin_dispute` |
| `dispute_resolved` | оба участника | «Спор по лоту «{title}» разрешён [в пользу компании / в пользу блогера / частично].» | `lot_<id>` |
| `support_new_ticket` | все admin | «Новый тикет поддержки: «{subject}».» | `admin_support` |
| `support_user_reply` | все admin | «Пользователь ответил в тикете: «{subject}».» | `admin_support` |
| `support_admin_reply` | user (автор) | «Поддержка ответила на ваш тикет: «{subject}».» | `support_<ticketId>` |
| `support_ticket_closed` | user (автор) | «Ваш тикет «{subject}» закрыт администратором.» | `support_<ticketId>` |

**Деталь дедупликации:** для sporov dedupeKey = `responseId` (не `lotId`) — два разных спора на одном лоту уведомят независимо. Для поддержки dedupeKey = `ticketId` (создание/сообщение) или `messageId` (ответ/закрытие).
