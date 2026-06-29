# NeedMarket — UI Map (фронтенд apps/miniapp)

> Документ для команды дизайнеров. Описание составлено по реальному коду; ничего не придумано.
> Код не менялся. Дата: 2026-06-27.

---

## 1. Навигационная карта

```
App.tsx
│
├── [loading] — Telegram init spinner
├── [no-telegram] — заглушка "Откройте в Telegram"
├── [unauthorized] — заглушка "Нет доступа"
├── [error] — заглушка "Что-то пошло не так"
│
└── Home.tsx  ← точка входа, разрешает deeplink + роль
    │
    ├── RoleSelect (S-1)          ← role === null && !isAdmin
    │
    ├── ViewSelector (S-2)        ← role есть + isAdmin + нет deeplink
    │
    ├── BloggerOnboardingForm (S-3) ← blogger, profile === null
    │
    ├── BloggerEditProfile (S-4)  ← blogger, флаг редактирования
    ├── CompanyForm (S-5)         ← company, новый / редактирование
    │
    ├── Dashboard (маркетплейс)
    │   ├── [Блогер] BottomTabBar (5 вкладок)
    │   │   ├── feed    → BloggerHome (S-6)
    │   │   ├── responses → MyResponses (S-7)
    │   │   ├── searches  → SavedSearches (S-8)
    │   │   ├── support   → SupportList (S-11)
    │   │   │               └── SupportCreateForm (S-12)
    │   │   │               └── SupportThread (S-13)
    │   │   └── profile → ProfileView (S-15) ← BloggerEditProfile (S-4)
    │   │
    │   ├── [Рекламодатель] BottomTabBar (3 вкладки + FAB)
    │   │   ├── home    → CompanyHome (S-9)
    │   │   │             └── CreateLotForm (S-10)  ← FAB
    │   │   ├── support → SupportList (S-11)
    │   │   │               └── SupportCreateForm (S-12)
    │   │   │               └── SupportThread (S-13)
    │   │   └── profile → ProfileView (S-15) ← CompanyForm (S-5)
    │   │
    │   └── LotDetail (S-14)  ← из BloggerHome, MyResponses, CompanyHome
    │       ├── M-1 BloggerProfileModal
    │       │   └── M-2 ReviewsModal
    │       ├── M-3 DisputeFormModal
    │       └── M-4 ReviewFormModal
    │
    └── AdminShell (7 вкладок)
        ├── payment  → AdminPaymentSection (S-16)
        ├── payout   → AdminPayoutSection (S-17)
        ├── disputes → AdminDisputesSection (S-18)  ← badge: кол-во открытых
        ├── support  → AdminSupportPanel (S-19)     ← dot: есть непрочитанные
        │   └── SupportThread (S-13, admin-режим)
        ├── companies → AdminUsersPanel role=company (S-20)
        ├── bloggers  → AdminUsersPanel role=blogger (S-21)
        └── settings  → PlatformSettings (S-22)
```

### Обработка диплинков (`?startapp=<param>`)

| Параметр | Куда ведёт |
|---|---|
| `lot_<id>` | Маркетплейс → LotDetail (S-14) с нужным ID |
| `support_<id>` | Маркетплейс → SupportThread (S-13) с нужным ticketId |
| `admin_payment` | AdminShell → вкладка payment (S-16) |
| `admin_payout` | AdminShell → вкладка payout (S-17) |
| `admin_dispute` | AdminShell → вкладка disputes (S-18) |
| `admin_support` | AdminShell → вкладка support (S-19) |

### BottomTabBar — Блогер

| Вкладка | Иконка | Экран |
|---|---|---|
| feed | Home | BloggerHome (S-6) |
| responses | Send | MyResponses (S-7) |
| searches | Bookmark | SavedSearches (S-8) |
| support | LifeBuoy | SupportList (S-11) |
| profile | User | ProfileView (S-15) |

### BottomTabBar — Рекламодатель

| Вкладка | Иконка | Экран |
|---|---|---|
| home | ClipboardList | CompanyHome (S-9) |
| *(FAB центр)* | Plus | CreateLotForm (S-10) |
| support | LifeBuoy | SupportList (S-11) |
| profile | User | ProfileView (S-15) |

### AdminShell — Вкладки

| Вкладка | Иконка | Индикатор | Экран |
|---|---|---|---|
| payment | CreditCard | — | AdminPaymentSection (S-16) |
| payout | Wallet | — | AdminPayoutSection (S-17) |
| disputes | Flag | Badge (кол-во) | AdminDisputesSection (S-18) |
| support | LifeBuoy | Синяя точка | AdminSupportPanel (S-19) |
| companies | Building2 | — | AdminUsersPanel/company (S-20) |
| bloggers | Users | — | AdminUsersPanel/blogger (S-21) |
| settings | Settings2 | — | PlatformSettings (S-22) |

---

## 2. Перечень экранов (страниц)

### Онбординг / Вход

| ID | Название | Файл | Вид / Роль | Как попадают |
|---|---|---|---|---|
| S-1 | Выбор роли | `screens/RoleSelect.tsx` | Все новые | Auto (role === null, !isAdmin) |
| S-2 | Выбор вида | `screens/ViewSelector.tsx` | Пользователь + Админ | Auto (обе роли, нет deeplink) |
| S-3 | Онбординг блогера | `screens/BloggerOnboardingForm.tsx` | Блогер (новый) | Auto (profile === null) |

---

#### S-1 — Выбор роли

**Назначение:** Первый экран для нового пользователя — выбрать, кем он является на площадке.

**Блоки (сверху вниз):**
- Заголовок: «Кто вы на площадке?»
- Подзаголовок: «Роль выбирается один раз — сменить её позже нельзя.»
- OptionCard «Я блогер» (иконка Clapperboard) + «Откликаюсь на проекты брендов»
- OptionCard «Я рекламодатель» (иконка Building2) + «Размещаю проекты и ищу блогеров»

**Кнопки / действия:**
- Клик по карточке → API `updateRole` → переход в BloggerOnboardingForm (S-3) или CompanyForm (S-5)

**Состояния:** только стандартное (нет пустого/ошибки)

---

#### S-2 — Выбор вида

**Назначение:** Выбор режима работы для пользователя, у которого есть и рыночная роль, и права админа.

**Блоки (сверху вниз):**
- Заголовок: «Выберите вид»
- Подзаголовок: «Для этого аккаунта доступно несколько режимов работы.»
- OptionCard «Войти как {Блогер / Рекламодатель}» (иконка роли, синяя)
- OptionCard «Войти как Администрация» (иконка Settings2, синяя)

**Кнопки / действия:**
- Клик → устанавливает activeShell → переход в Dashboard или AdminShell

---

#### S-3 — Онбординг блогера

**Назначение:** Первичное заполнение профиля блогером (обязательно перед маркетплейсом).

**Поля формы:**

| Секция | Поле | Тип |
|---|---|---|
| Основное | displayName «Имя / название блога» | text, required |
| Основное | city «Город» | text, required |
| Тематика | categories | MultiSelectChip (CATEGORIES) |
| Аккаунты | Строки: platform, url, followers | dynamic rows, +/- |
| | Чекбокс «Согласен с условиями использования» | checkbox, required |

**Нативная кнопка (MainButton):** «Продолжить» (активна: все обязательные поля заполнены)

**Dev-дублёр (isMockEnv):** кнопка «Продолжить» в вёрстке

---

### Маркет-вид БЛОГЕРА

| ID | Название | Файл | Вид / Роль | Как попадают |
|---|---|---|---|---|
| S-4 | Редактирование профиля блогера | `screens/BloggerEditProfile.tsx` | Блогер | Кнопка «Редактировать» на ProfileView (S-15) |
| S-6 | Лента лотов | `screens/lots/BloggerHome.tsx` | Блогер | Таб «feed» |
| S-7 | Мои отклики | `screens/lots/MyResponses.tsx` | Блогер | Таб «responses» |
| S-8 | Сохранённые поиски | `screens/lots/SavedSearches.tsx` | Блогер | Таб «searches» |

---

#### S-4 — Редактирование профиля блогера

**Назначение:** Полное редактирование профиля (расширенная версия S-3).

**Поля формы (дополнительные секции к S-3):**

| Секция | Поля |
|---|---|
| Аудитория | audienceGender (SelectChip), audienceAge, audienceGeo, audienceLanguage |
| Статистика | reachStories, reachReels, reachPosts, engagementRate, statsScreenshotUrl (upload) |
| Форматы | formats (MultiSelectChip, FORMATS) |
| Прайс | priceStories, priceStoriesSeries, priceReels, pricePost, priceEvent, priceUgc (BudgetRow) |
| Опыт | brandsWorkedWith (textarea), bestCaseUrl (text URL) |
| Дополнительно | barterAvailable (toggle), travelAvailable (toggle), preferredAdvertiserCategories |
| Аватар | FileUpload (PNG/JPEG/WebP, макс. 5 МБ) |

**Нативная кнопка (MainButton):** «Сохранить»

---

#### S-6 — Лента лотов (Блогер)

**Назначение:** Главный экран блогера — список открытых лотов с фильтрами.

**Блоки (сверху вниз):**
1. ScreenHeader: «Открытые проекты» + иконка уведомлений + аватар → ProfileView (S-15)
2. Фильтры:
   - MultiSelectChip «Категории» (CATEGORIES)
   - SingleSelectChip «Платформа» (PLATFORMS)
   - Тоггл «Скрыть, где откликнулся»
3. Баннер заполненности профиля (если completion < 80%): синий фон, «Профиль заполнен на N%» + кнопка «Заполнить» → S-4
4. Список LotCard (вариант blogger)

**Состояния:**
- Загрузка: Spinner
- Пусто: «Подходящих проектов пока нет»
- Список

**Действия:**
- Клик по LotCard → LotDetail (S-14)

---

#### S-7 — Мои отклики

**Назначение:** Список откликов блогера с возможностью просмотра деталей лота.

**Блоки (сверху вниз):**
1. ScreenHeader: «Мои отклики»
2. Фильтры-чипы статуса: all | pending | accepted | rejected
3. Список ResponseItemCard

**ResponseItemCard:**
- Название лота + StatusPill статуса отклика
- Сообщение отклика + (если лот не active) StatusPill статуса лота
- Бюджет + дедлайн

**Состояния:**
- Загрузка: Spinner
- Пусто: «Нет откликов»

**Действия:**
- Клик по карточке → LotDetail (S-14)

---

#### S-8 — Сохранённые поиски

**Назначение:** Список сохранённых поисков блогера; включение/выключение, редактирование, удаление.

**Блоки (сверху вниз):**
1. ScreenHeader: «Сохранённые поиски»
2. Список SavedSearchCard + кнопка «Добавить»

**SavedSearchCard:**
- Имя поиска + Switch (вкл/выкл)
- Критерии: «Категория · Платформа · от N ₸»
- Кнопки: «Редактировать» → M-5 | «Удалить» → inline-подтверждение

**Состояния:**
- Пусто: «Сохранённых поисков нет»

---

### Маркет-вид РЕКЛАМОДАТЕЛЯ

| ID | Название | Файл | Вид / Роль | Как попадают |
|---|---|---|---|---|
| S-5 | Форма профиля рекламодателя | `screens/CompanyForm.tsx` | Рекламодатель | Auto (новый) / кнопка «Редактировать» на S-15 |
| S-9 | Мои лоты | `screens/lots/CompanyHome.tsx` | Рекламодатель | Таб «home» |
| S-10 | Создание лота | `screens/lots/CreateLotForm.tsx` | Рекламодатель | FAB «+» |

---

#### S-5 — Форма профиля рекламодателя

**Назначение:** Создание / редактирование профиля рекламодателя.

**Поля формы:**

| Секция | Поле | Тип |
|---|---|---|
| Основное | name «Название рекламодателя» | text, required |
| Основное | sphere «Сфера» | text, optional |
| Основное | city «Город» | text, optional |
| Контакт | contactType | toggle username / phone / other |
| Контакт | contact | TextField (динамически) |
| | Кнопка «Поделиться номером» (requestContact Telegram API) | — |
| Логотип | logoUrl | FileUpload (PNG/JPEG/WebP, 5 МБ) |

**Нативная кнопка (MainButton):** «Сохранить» (активна: name заполнено)

---

#### S-9 — Мои лоты (Рекламодатель)

**Назначение:** Список лотов рекламодателя с фильтрацией и управлением.

**Блоки (сверху вниз):**
1. ScreenHeader: «Ваши лоты» + аватар → ProfileView (S-15)
2. Фильтры-чипы статуса: all | awaiting_payment | active | in_progress | awaiting_payout | completed
3. Тоггл «Скрыть завершённые»
4. Сортировка: кнопки «Новые» / «Старые»
5. Список LotCard (вариант company) с наложенным DeleteLotButton

**DeleteLotButton:**
- Появляется на лотах со статусом awaiting_payment, active
- Inline-подтверждение: «Удалить лот? Действие необратимо.» + «Отмена» / «Удалить»

**Состояния:**
- Загрузка: Spinner
- Пусто: Placeholder

**Действия:**
- Клик по LotCard → LotDetail (S-14)
- FAB «+» → CreateLotForm (S-10)

---

#### S-10 — Создание лота

**Назначение:** Форма создания нового лота рекламодателем.

**Поля формы:**

| Секция | Поле | Тип |
|---|---|---|
| Основное | title «Название проекта» | text, required |
| Основное | description «Описание» | textarea |
| Параметры | categories | MultiSelectChip (CATEGORIES) |
| Параметры | platforms | MultiSelectChip (PLATFORMS) |
| Условия | budget | BudgetRow (₸) |
| Условия | deadline | DateRow |
| Условия | slotsNeeded | Stepper (мин 1) |
| Требования | requirements | dynamic text rows (+/-) |
| Материалы | attachments | UploadZone (до N файлов) |

**Нативная кнопка (MainButton):** «Создать лот»

---

### Общие экраны (оба вида)

| ID | Название | Файл | Вид / Роль | Как попадают |
|---|---|---|---|---|
| S-11 | Список тикетов | `screens/support/SupportList.tsx` | Все | Таб «support» |
| S-12 | Создание тикета | `screens/support/SupportCreateForm.tsx` | Все | Кнопка «+ Создать заявку» из S-11 |
| S-13 | Чат тикета | `screens/support/SupportThread.tsx` | Все / Админ | Клик по тикету; deeplink `support_<id>` |
| S-14 | Детали лота | `screens/lots/LotDetail.tsx` | Оба роли | LotCard, MyResponses, deeplink `lot_<id>` |
| S-15 | Мой профиль | `screens/ProfileView.tsx` | Все | Таб «profile»; аватар в ScreenHeader |

---

#### S-11 — Список тикетов поддержки

**Блоки (сверху вниз):**
1. ScreenHeader: «Поддержка»
2. Кнопка «+ Создать заявку» (fill, full-width)
3. Список TicketCard

**TicketCard:**
- Синяя точка (top-right) — если непрочитано
- Тип-бейдж (синий): Bug report / Request / …
- StatusPill: «Открыт» (info) / «Закрыт» (neutral)
- Тема (однострочно, ellipsis)
- Время последнего сообщения («30 мин. назад», «2 ч. назад»…)

**Состояния:** загрузка (Spinner) | ошибка (красный текст) | пусто («Нет заявок»)

---

#### S-12 — Создание тикета

**Поля формы:**

| Поле | Тип |
|---|---|
| subject «Тема» | text, max 200, required |
| type «Тип» | SelectChip (SUPPORT_TICKET_TYPES) |
| body «Сообщение» | textarea, max 4000, optional |
| attachments | UploadZone + список с кнопкой «×» |

**Нативная кнопка (MainButton):** «Отправить»
**Кнопка в шапке:** «Отмена» → возврат в S-11

---

#### S-13 — Чат тикета

**Назначение:** Переписка с поддержкой (или между пользователем и поддержкой).

**Блоки (сверху вниз):**
1. Шапка: «← Назад» + тема + Тип-бейдж + StatusPill
2. Область сообщений (flex: 1, scroll)
   - Пузырь «я»: синий фон, белый текст, скруглён 16/16/4/16 px
   - Пузырь «не я»: surface-фон, ink-текст, скруглён 16/16/16/4 px, с именем отправителя
   - Вложения: ссылки / предпросмотр изображений
   - Авто-скролл к новым сообщениям; поллинг каждые 5 сек
3. MessageComposer (footer):
   - Ряд ожидающих вложений (иконка + имя + «×»)
   - Иконка-скрепка (upload) | Textarea (max 4000, auto-resize до 120 px) | Кнопка отправки

**Нативная кнопка (MainButton):** «Отправить» (скрыта, если тикет закрыт)

**Состояния:**
- Загрузка: Spinner
- Ошибка: Placeholder + AlertTriangle
- Закрытый тикет: composer отключён, MainButton скрыта

**Admin-режим (в AdminSupportPanel):**
- Дополнительно: переключатель статуса «Открыт ↔ Закрыт»
- Admin может читать все сообщения и отвечать

---

#### S-14 — Детали лота

**Назначение:** Полная карточка лота; ветвится по роли.

**Блоки (сверху вниз):**
1. «← Назад»
2. StatusBanner (если статус лота ≠ active) — цвет = тон статуса
3. Секция заголовка: title (крупный), company.name + logo, categories + platforms, budget + deadline
4. Секция описания: lot.description
5. Секция требований: маркированный список (если есть)

**→ Ветка БЛОГЕРА:**
6. Секция «Мой отклик» (если отклик есть):
   - Текст отклика + ResponseStatusPill
   - GivenReviewBadge / ReceivedReviewBadge
7. BloggerResponseBlock (если lot.status === 'active' AND нет отклика):
   - Textarea «Ваше сообщение»
   - **MainButton:** «Откликнуться»
   - Ошибка (если есть)

**→ Ветка РЕКЛАМОДАТЕЛЯ:**
6. CompanyAttachmentsBlock: загрузка, список, удаление вложений
7. Список ResponseCard (по одной на каждый отклик)

**ResponseCard (вид рекламодателя):**
- Аватар блогера (40×40) + имя + @username + Tier-бейдж + Rating-чип
- Кнопка «Скопировать @» → тост «Скопировано»
- Кнопка «Контакт» (Telegram-ссылка или копировать)
- Кнопка «Профиль» → M-1 BloggerProfileModal
- Bio блогера (если есть)
- Чипы: reach stories/reels/posts, ER
- Текст отклика
- ResponseStatusPill (pending/accepted/rejected/disputed)
- Баннер спора (если open/resolved)
- Кнопки действий:
  - pending → «Принять» + «Отклонить»
  - accepted + lot in_progress/awaiting_payout → «Открыть спор» → M-3
  - rejected → заблокировано (opacity 0.5)
  - disputed → только информационный баннер
- Секция отзыва (если лот completed): форма M-4 или бейджи

**Состояния экрана:**
- Загрузка: Spinner
- Ошибка: Placeholder
- Лот завершён/заблокирован: соответствующий StatusBanner

---

#### S-15 — Мой профиль

**Назначение:** Просмотр собственного профиля; переход к редактированию.

**Блоки (сверху вниз):**
1. ScreenHeader: имя + роль-subtitle + аватар
2. Данные профиля (зависят от роли):
   - Блогер: аватар, displayName, city, tier, rating, bio, categories, соцсети, аудитория, статистика, форматы, прайс, опыт, barter/travel
   - Рекламодатель: логотип, name, sphere, city, contact
3. Кнопка «Редактировать» → S-4 (блогер) или S-5 (рекламодатель)

---

### Вид АДМИНИСТРАЦИИ

| ID | Название | Файл | Как попадают |
|---|---|---|---|
| S-16 | Ожидают оплаты | `screens/lots/AdminPanel.tsx` (компонент AdminPaymentSection) | Таб «payment» / deeplink |
| S-17 | К выплате | `screens/lots/AdminPanel.tsx` (компонент AdminPayoutSection) | Таб «payout» / deeplink |
| S-18 | Споры | `screens/lots/AdminPanel.tsx` (компонент AdminDisputesSection) | Таб «disputes» / deeplink |
| S-19 | Поддержка (админ) | `screens/support/AdminSupportPanel.tsx` | Таб «support» / deeplink |
| S-20 | Пользователи — Рекламодатели | `screens/lots/AdminUsersPanel.tsx` (role=company) | Таб «companies» |
| S-21 | Пользователи — Блогеры | `screens/lots/AdminUsersPanel.tsx` (role=blogger) | Таб «bloggers» |
| S-22 | Настройки платформы | `screens/PlatformSettings.tsx` | Таб «settings» |

---

#### S-16 — Ожидают оплаты

**Блоки:** список AwaitingPaymentCard

**AwaitingPaymentCard:**
- Аватар-компания (44×44, градиент) + название лота + StatusPill «Ждёт оплаты» (amber)
- KvRow: Рекламодатель | Бюджет · дедлайн | Контакт (с кнопкой «копировать» → тост)
- Кнопки: «Связаться» (Telegram) + «Активировать лот» (loading-state)

**Состояния:** загрузка | ошибка | пусто («Нет лотов, ожидающих оплаты»)

---

#### S-17 — К выплате

**Блоки:** список AwaitingPayoutCard

**AwaitingPayoutCard:**
- Аватар + название лота + StatusPill «К выплате»
- PayoutBloggerRow на каждый принятый отклик:
  - Аватар блогера + имя + @username + кнопка контакта
  - Адрес выплаты (username или другой контакт)
  - Статус: «Выплачено» / «Ожидание выплаты»
  - Сумма выплаты

---

#### S-18 — Споры

**Блоки:**
- Тоггл: «Открытые» / «Разрешённые»
- Список DisputeCard

**DisputeCard:**
- Аватар-компания + название лота + бейдж «Спор»
- Строка рекламодателя: аватар + имя + @username + кнопка контакта
- Строка блогера: аватар + имя + @username + кнопка контакта
- Бюджет + дедлайн лота
- Причина спора (форматированный label) + цитата описания
- (Если открытый спор) SelectChip решения: в пользу рекламодателя | блогера | частичный возврат | отмена
- Textarea «Текст решения» (optional)
- Кнопка «Разрешить спор» + ошибка

**Индикатор:** badge на вкладке disputes показывает количество открытых споров

---

#### S-19 — Поддержка (Администрация)

**Навигация внутри:**
1. UsersView: список пользователей с открытыми тикетами → клик → TicketsView
2. TicketsView: список тикетов выбранного пользователя → клик → SupportThread (S-13, admin-режим)

**UsersView — строка пользователя:**
- Иконка роли (Building2 / User) + имя + кол-во открытых тикетов

**TicketsView:**
- «← Назад» + имя пользователя
- Список AdminSupportTicketListItemDto (TicketCard)

**Индикатор:** синяя точка на вкладке support — если есть непрочитанные сообщения

---

#### S-20/S-21 — Пользователи (Рекламодатели / Блогеры)

**Блоки:**
- Поиск (TextField)
- Фильтры-чипы
- Список UserCard

**UserCard:**
- Аватар (40×40) + имя + @username + role-badge
- Статистика: лоты создано / откликов / отзывов
- Клик → модалка с полным профилем и опциями редактирования

---

#### S-22 — Настройки платформы

**Блоки:**
- Тоггл «Фильтр по бюджету в поисках» (Switch)
  - Вкл: «блогеры видят поле минимального бюджета»
  - Выкл: «лоты матчатся без учёта бюджета»

---

## 3. Перечень модалок / попапов / шторок / диалогов / тостов

| ID | Название | Что открывает | Тип |
|---|---|---|---|
| M-1 | Профиль блогера | ResponseCard (кнопка «Профиль») | Полноэкранный оверлей |
| M-2 | Отзывы | M-1 (клик по rating-чипу) | Sheet / модалка |
| M-3 | Форма спора | ResponseCard (кнопка «Открыть спор») | Sheet / модалка |
| M-4 | Форма отзыва | LotDetail (лот completed, ResponseCard) | Inline / модалка |
| M-5 | Редактирование сохранённого поиска | SavedSearchCard (кнопка «Редактировать») | Modal |
| M-6 | Подтверждение удаления лота | CompanyHome (DeleteLotButton) | Inline-диалог |
| M-7 | Подтверждение удаления поиска | SavedSearchCard (кнопка «Удалить») | Inline-диалог |
| M-8 | Тост «Скопировано» | Кнопка копирования @username или контакта | Toast |
| M-9 | Тост «Скопировано» (контакт) | BloggerProfileModal (кнопка контакта без username) | Toast |
| M-10 | Тост экспорта / результата | (возможные будущие или admin-действия) | Toast |
| M-11 | Баннер заполненности профиля | BloggerHome (если completion < 80%) | Встроенный баннер |
| M-12 | StatusBanner спора/ожидания | LotDetail (если status = disputed / awaiting_decision) | Встроенный баннер |
| M-13 | Превью вложений / медиа | AttachmentItem (изображение в чате) | Inline-изображение |
| M-14 | Профиль пользователя (Админ) | AdminUsersPanel (клик по UserCard) | Модалка |

---

#### M-1 — BloggerProfileModal

**Файл:** `components/BloggerProfileModal.tsx`
**Открывается:** Кнопка «Профиль» на ResponseCard (S-14, ветка рекламодателя)
**Тип:** Полноэкранный скролл-оверлей (20 px padding)

**Содержимое (сверху вниз):**
1. Аватар (96×96) + displayName + city + Tier-бейдж + Rating-чип (кликабелен → M-2)
2. Категории + Bio (если есть)
3. Соцсети: иконка платформы + кол-во подписчиков + ссылка
4. Аудитория: пол, возраст, гео, язык (если есть)
5. Статистика: Reach stories/reels/posts, ER %; скриншот stats (image)
6. Форматы сотрудничества (пилюли)
7. Прайс (InfoSection с KvRow по форматам)
8. Опыт: brandsWorkedWith, bestCaseUrl (ссылка)
9. Дополнительно: barter, travel, preferredAdvertiserCategories
10. (Только Админ) Приватные данные: phone, email, birthDate, termsAcceptedAt, marketingOptIn

**Кнопки:**
- «Написать» / «Скопировать контакт» (внизу) — если telegramUsername: Telegram-ссылка; иначе копирование → M-9
- Disabled, если контакт отсутствует

---

#### M-2 — ReviewsModal (Отзывы)

**Файл:** `components/ReviewsModal.tsx`
**Открывается:** Клик по Rating-чипу в M-1
**Тип:** Модалка / Sheet

**Содержимое:**
- Заголовок «Отзывы»
- Список ReviewDto:
  - Имя автора + 5 звёзд (заполнены/пусты, золотой цвет)
  - Текст отзыва (optional)
  - Дата «12 дек. 2024»

**Состояния:** загрузка (Spinner) | ошибка (AlertTriangle) | пусто («Отзывов пока нет»)

---

#### M-3 — DisputeFormModal (Форма спора)

**Файл:** `components/DisputeForm.tsx`
**Открывается:** Кнопка «Открыть спор» на ResponseCard (S-14, accepted + lot in_progress/awaiting_payout)
**Тип:** Sheet / модалка

**Содержимое:**
1. SelectChip — причина спора (DISPUTE_REASONS, фильтр по роли):
   - Рекламодатель: not_delivered | poor_quality | no_contact | terms_violation | other
   - Блогер: no_payment | no_contact | terms_violation | other
2. Textarea описание спора (макс. 1000 символов, счётчик)
3. Ошибка (если есть)

**Кнопки:**
- **MainButton:** «Отправить» (активна: причина выбрана + описание заполнено)
- Dev-дублёр (isMockEnv): кнопка «Отправить» в вёрстке

---

#### M-4 — ReviewFormModal (Форма отзыва)

**Файл:** `components/ReviewForm.tsx`
**Открывается:** Секция отзыва в ResponseCard (S-14), когда лот completed и отзыв ещё не оставлен
**Тип:** Inline-блок / может быть модалкой

**Содержимое:**
1. 5 кликабельных звёзд (1–5, подсветка при hover/select)
2. Textarea комментарий (макс. 500 символов, счётчик, optional)
3. Ошибка (если есть)

**Кнопки:**
- Кнопка «Отправить отзыв» (активна: rating > 0)

---

#### M-5 — Редактирование сохранённого поиска

**Файл:** `screens/lots/SavedSearches.tsx` (встроенный Modal)
**Открывается:** Кнопка «Редактировать» на SavedSearchCard (S-8)
**Тип:** Modal (overlay)

**Содержимое:**
- TextField: имя поиска
- MultiSelectChip: категории
- MultiSelectChip: платформы
- BudgetRow: минимальный бюджет (optional)

**Кнопки:**
- «Отмена» → закрыть без сохранения
- «Сохранить» → API update → обновить список

---

#### M-6 — Подтверждение удаления лота

**Файл:** `screens/lots/CompanyHome.tsx` (DeleteLotButton, inline)
**Открывается:** Кнопка удаления на LotCard (S-9)
**Тип:** Inline-диалог (разворачивается в карточке)

**Содержимое:**
- «Удалить лот? Действие необратимо.»

**Кнопки:**
- «Отмена» → сворачивает диалог
- «Удалить» → API delete → убирает из списка

---

#### M-7 — Подтверждение удаления сохранённого поиска

**Файл:** `screens/lots/SavedSearches.tsx` (inline)
**Открывается:** Кнопка «Удалить» на SavedSearchCard (S-8)
**Тип:** Inline-диалог

**Содержимое:**
- «Удалить?»

**Кнопки:**
- «Отмена» | «Удалить» → API delete → убирает из списка

---

#### M-8 / M-9 — Тост «Скопировано»

**Тип:** Toast / краткое уведомление
**Появляется:**
- M-8: Кнопка копирования @username в ResponseCard (S-14) или AwaitingPaymentCard (S-16)
- M-9: Кнопка контакта в BloggerProfileModal (M-1), когда нет username

**Содержимое:** «Скопировано» (краткий текст; визуально — inline label или TG-нативный алерт)

---

#### M-11 — Баннер заполненности профиля

**Файл:** `screens/lots/BloggerHome.tsx` (inline-баннер)
**Показывается:** Если completion < 80% на ленте блогера (S-6)
**Тип:** Встроенный баннер (синий фон)

**Содержимое:**
- «Профиль заполнен на N%»
- «Больше данных — больше шансов»

**Кнопка:** «Заполнить» → BloggerEditProfile (S-4)

---

#### M-12 — StatusBanner (спор / ожидание решения)

**Файл:** `components/LotDetailShared.tsx` (StatusBanner)
**Показывается:** В LotDetail (S-14), если lot.status = disputed | awaiting_decision | завершён | …
**Тип:** Встроенный баннер (цвет = тон статуса)

**Содержимое:**
- Иконка + текст статуса (например, «Спор открыт — ожидайте решения администрации»)

**Кнопки:** нет (информационный)

---

#### M-13 — Превью вложений / медиа

**Файл:** `components/MessageBubble.tsx` (AttachmentItem)
**Показывается:** Изображения в сообщениях чата (S-13)
**Тип:** Inline-изображение с возможностью открыть в браузере

**Содержимое:** img-тег с downloadUrl; не-изображения — ссылка с именем файла

---

#### M-14 — Профиль пользователя (Админ)

**Файл:** `screens/lots/AdminUsersPanel.tsx`
**Открывается:** Клик по UserCard в S-20 / S-21
**Тип:** Модалка

**Содержимое:** Полный профиль пользователя (аналог M-1 с расширенными данными) + опции администрирования

---

## 4. Переиспользуемые компоненты

### Карточки и списки

| Компонент | Файл | Где используется |
|---|---|---|
| LotCard | `screens/lots/LotCard.tsx` | BloggerHome (S-6), CompanyHome (S-9) |
| ResponseItemCard | `screens/lots/MyResponses.tsx` | MyResponses (S-7) |
| ResponseCard | `screens/lots/LotDetail.tsx` | LotDetail (S-14), ветка рекламодателя |
| TicketCard | `screens/support/SupportList.tsx` | S-11, S-19 |
| AwaitingPaymentCard | `screens/lots/AdminPanel.tsx` | S-16 |
| AwaitingPayoutCard | `screens/lots/AdminPanel.tsx` | S-17 |
| DisputeCard | `screens/lots/AdminPanel.tsx` | S-18 |
| UserCard | `screens/lots/AdminUsersPanel.tsx` | S-20, S-21 |
| OptionCard | `screens/RoleSelect.tsx`, `screens/ViewSelector.tsx` | S-1, S-2 |

### Навигация

| Компонент | Файл | Описание |
|---|---|---|
| BottomTabBar | `components/BottomTabBar.tsx` | Нижняя навигация; поддерживает badge (число) и dot (точка); FAB-слот по центру (position: absolute, top: −30 px) |
| ScreenHeader | `components/ScreenHeader.tsx` | Заголовок + subtitle + bell (уведомления, синяя точка если hasUnread) + аватар-кнопка |

### Чипы и фильтры

| Компонент | Файл | Описание |
|---|---|---|
| SelectChip | `components/SelectChip.tsx` | Чип выбора (selected = синий фон + галочка; unselected = surface); поддерживает count |
| MultiSelectChip | в формах | Группа SelectChip для множественного выбора |
| StatusPill | `components/StatusPill.tsx` | Цветная пилюля статуса; тоны: green / amber / info / neutral / red |
| Tier-бейдж | `components/TierBadge.tsx` (вероятно) | Отображает tier блогера (Nano/Micro/Macro/Mega) |
| Rating-чип | `components/RatingChip.tsx` (вероятно) | Средний рейтинг + кол-во отзывов; кликабелен → M-2 |

### Иконки соцсетей

| Компонент | Библиотека | Где используется |
|---|---|---|
| Бренд-иконки платформ | `simple-icons` (npm) | LinkedAccount в BloggerProfileModal (M-1), BloggerEditProfile (S-4), LotCard (S-6, S-9) |

Иконки рендерятся с брендовыми SVG-цветами (hex из `simple-icons`). Размер — обычно 16–20 px.

### Форм-контролы

| Компонент | Файл | Где используется |
|---|---|---|
| TextField | `components/FormControls.tsx` | Все формы |
| FormTextarea | `components/FormControls.tsx` | Описание, сообщения |
| BudgetRow | `components/FormControls.tsx` | Прайс (S-4), бюджет (S-10), сохранённый поиск (M-5) |
| DateRow | `components/FormControls.tsx` | Дедлайн лота (S-10) |
| Stepper | `components/FormControls.tsx` | slotsNeeded (S-10) |
| UploadZone | `components/FormControls.tsx` | Вложения (S-10, S-12), statsScreenshot (S-4) |
| FormSection | `components/FormControls.tsx` | Группировка полей в формах |

### Чат / поддержка

| Компонент | Файл | Описание |
|---|---|---|
| MessageComposer | `components/MessageComposer.tsx` | Textarea + кнопка скрепки + кнопка отправки + ряд вложений; используется в S-13 |
| MessageBubble | `components/MessageBubble.tsx` | Пузырь сообщения (я / не-я); используется в S-13 |

### Нативная кнопка Telegram

| Компонент | Файл | Описание |
|---|---|---|
| useMainButton | `useMainButton.ts` | Хук, монтирующий Telegram-нативный MainButton внизу viewport. В production управляет только через Telegram SDK. В isMockEnv — ноп; формы показывают дублёр-кнопку в вёрстке |

**Где используется MainButton:**
- S-3, S-4, S-5 — сохранение форм профиля
- S-10, S-12 — создание лота / тикета
- S-13 — «Отправить» в чате (скрыта при closed-тикете)
- S-14 (ветка блогера) — «Откликнуться»
- M-3 — «Отправить» (форма спора)
- AdminSupportPanel (S-19) — «Отправить» в чате

### Общие layout-компоненты

| Компонент | Файл | Описание |
|---|---|---|
| InfoSection | `components/LotDetailShared.tsx` | Секция с заголовком (синяя точка + 13 px bold) и карточкой; используется в LotDetail (S-14) |
| StatusBanner | `components/LotDetailShared.tsx` | Баннер с иконкой и текстом; тоны = PillTone; используется в S-14 |
| BreakdownBox | `components/BreakdownBox.tsx` | Таблица «строки + итого»; surface-2 фон |
| Button | `components/Button.tsx` | fill (синий) / ghost (outline) × default / sm |

---

## 5. Заметки для дизайнеров

### Тема (светлая / тёмная)

Тема определяется через Telegram `themeParams` + `bindCssVars`. CSS-переменные переопределяются в `data-theme="dark"` через `nm-tokens.css`.

### Ключевые CSS-токены цвета (`nm-tokens.css`)

| Токен | Светлая | Назначение |
|---|---|---|
| `--nm-blue` | #2F7CF6 | Основной бренд-цвет, акценты, активные чипы |
| `--nm-blue-strong` | #2563EB | Hover/pressed состояния |
| `--nm-blue-soft` | #E9F1FF | Фон баннера, мягкие акценты |
| `--nm-blue-line` | #CFE0FB | Граница активных чипов |
| `--nm-grad` | 135° #4E93FF→#2563EB | Градиент FAB, аватаров, MainButton дублёра |
| `--nm-bg` | #F2F3F6 | Фон страницы |
| `--nm-surface` | #FFFFFF | Карточки, поля ввода |
| `--nm-surface-2` | #F2F3F6 | Альтернативная поверхность |
| `--nm-ink` | #14161B | Основной текст |
| `--nm-ink-2` | #5C6272 | Вторичный текст, лейблы |
| `--nm-ink-3` | #737A8A | Третичный / disabled |
| `--nm-line` | #ECEEF2 | Разделители, границы |
| `--nm-green` / `--nm-green-bg` | #1FA971 / #E4F7EE | Статус «принят», «активен» |
| `--nm-amber` / `--nm-amber-bg` | #DD8A0B / #FBEFD6 | Статус «ждёт оплаты», «оспорен» |
| `--nm-info` / `--nm-info-bg` | #2F7CF6 / #E6F0FF | Статус «на рассмотрении», «к выплате» |
| `--nm-neutral` / `--nm-neutral-bg` | #7D838F / #EEF0F3 | Статус «отклонён», «завершён» |
| `--nm-red` / `--nm-red-bg` | #FF4D67 / rgba(255,77,103,0.10) | Ошибки, статус «Спор» |
| `--nm-ava-a` / `--nm-ava-b` | #8E7BF5 / #6A55E6 | Градиент placeholder-аватаров |

### Ключевые CSS-токены радиусов

| Токен | Значение | Назначение |
|---|---|---|
| `--nm-r-card` | 18 px | Карточки (LotCard, ResponseCard, InfoSection) |
| `--nm-r-field` | 13 px | Поля ввода, BreakdownBox |
| `--nm-r-tile` | 17 px | Логотип компании (квадратный тайл) |
| `--nm-r-pill` | 20 px | Чипы SelectChip, пилюли |
| `--nm-r-badge` | 9 px | StatusPill, бейджи |

### Ключевые CSS-токены теней

| Токен | Значение | Назначение |
|---|---|---|
| `--nm-sh-card` | 0 2px 10px rgba(22,30,55,.04) | Карточки |
| `--nm-sh-hero` | 0 14px 30px rgba(37,99,235,.32) | Hero-элементы |
| `--nm-sh-fab` | 0 9px 20px rgba(37,99,235,.42) | FAB BottomTabBar |
| `--nm-sh-btn` | 0 6px 14px rgba(47,124,246,.26) | Кнопки fill |

### Главная кнопка (MainButton)

**ВАЖНО:** Primary-действия (откликнуться, сохранить, отправить) реализованы через **нативный Telegram MainButton** — он рендерится самим Telegram ВНЕ вёрстки экрана, внизу viewport. В макетах экранов его **не нужно рисовать в body** — достаточно обозначить надпись кнопки.

В браузерном окружении (`isMockEnv = true`) рядом с формой отображается dev-дублёр — обычная кнопка в вёрстке. Она нужна только для разработки.

### Safe-area / высота

Приложение занимает **полную высоту Telegram viewport** (`100dvh`). BottomTabBar учитывает `safe-area-inset-bottom`. LotDetail и SupportThread — полноэкранные скролл-контейнеры.

### Иконки соцсетей

Иконки брендов платформ (Instagram, TikTok, Twitter/X, YouTube и др.) берутся из библиотеки `simple-icons` (SVG). Цвета — официальные бренд-цвета (`#hex`) из той же библиотеки. Размер — 16–20 px. Используются в: профиль блогера (M-1, S-4, S-15), строки аккаунтов в карточках лотов.

### Типографика

- Размеры: 10 px (метка времени) → 12 px → 12.5 px → 13 px (лейблы, badge-текст) → 14 px (тело) → 15 px (поля) → 16 px (Stepper) → 21 px (заголовок ScreenHeader)
- Основной шрифт: системный (inherit от Telegram)
- Насыщенность: 400 (тело) / 500 (подзаголовки) / 600–700 (bold)

### Цветовой тон статусов (краткая шпаргалка)

| Статус | Тон | Пример |
|---|---|---|
| Активен / К выплате / На рассмотрении | info (синий) | StatusPill, TicketCard |
| Принят / В работе | green | ResponseCard |
| Ждёт оплаты / Оспорен (response) | amber | LotCard, ResponseCard |
| Отклонён / Завершён | neutral | ResponseCard, LotCard |
| Спор (лот) / Ошибка | red | StatusBanner в LotDetail |
