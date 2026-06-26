import ExcelJS from 'exceljs';
import type { AdminUserCardDto } from '@needmarket/shared';
import {
  AUDIENCE_GENDER_LABELS,
  COLLAB_FORMAT_LABELS,
  BLOGGER_TIER_LABELS,
  type AudienceGender,
  type CollabFormat,
  type BloggerTier,
} from '@needmarket/shared';

const KNOWN_PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Telegram', 'Threads', 'Facebook'] as const;

function boolRu(v: boolean | undefined): string {
  return v ? 'Да' : 'Нет';
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function platformUrl(card: AdminUserCardDto, platform: string): string {
  const acc = (card.linkedAccounts ?? []).find((a) => a.platform === platform);
  return acc?.url ?? '';
}

function platformFollowers(card: AdminUserCardDto, platform: string): number | null {
  const acc = (card.linkedAccounts ?? []).find((a) => a.platform === platform);
  return acc?.followers ?? null;
}

function maxFollowers(card: AdminUserCardDto): number | null {
  const accs = card.linkedAccounts ?? [];
  const nums = accs.map((a) => a.followers).filter((f): f is number => typeof f === 'number');
  return nums.length > 0 ? Math.max(...nums) : null;
}

function otherPlatforms(card: AdminUserCardDto): string {
  const other = (card.linkedAccounts ?? [])
    .filter((a) => !KNOWN_PLATFORMS.includes(a.platform as typeof KNOWN_PLATFORMS[number]) || a.platform === 'Другое')
    .map((a) => `${a.platform}: ${a.url}`)
    .join('; ');
  return other;
}

// Строит workbook и возвращает Buffer с xlsx-содержимым.
export async function buildBloggersXlsx(bloggers: AdminUserCardDto[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NeedMarket';
  wb.created = new Date();

  const ws = wb.addWorksheet('Блогеры');

  ws.columns = [
    { header: 'ФИО',                                key: 'name',                  width: 28 },
    { header: 'Город',                              key: 'city',                  width: 18 },
    { header: 'Дата рождения',                      key: 'birthDate',             width: 16 },
    { header: 'Телефон',                            key: 'phone',                 width: 18 },
    { header: 'Email',                              key: 'email',                 width: 26 },
    { header: 'Telegram',                           key: 'telegram',              width: 18 },
    { header: 'Тир',                                key: 'tier',                  width: 12 },
    { header: 'Категории',                          key: 'categories',            width: 28 },
    { header: 'Описание блога',                     key: 'bio',                   width: 40 },
    { header: 'Пол аудитории',                      key: 'audienceGender',        width: 26 },
    { header: 'Возраст аудитории',                  key: 'audienceAge',           width: 18 },
    { header: 'География аудитории',                key: 'audienceGeo',           width: 22 },
    { header: 'Язык аудитории',                     key: 'audienceLanguage',      width: 16 },
    { header: 'Охват Stories',                      key: 'reachStories',          width: 14 },
    { header: 'Охват Reels',                        key: 'reachReels',            width: 14 },
    { header: 'Охват постов',                       key: 'reachPosts',            width: 14 },
    { header: 'ER %',                               key: 'engagementRate',        width: 10 },
    { header: 'Instagram (ссылка)',                 key: 'instagramUrl',          width: 32 },
    { header: 'Instagram подписчики',               key: 'instagramFollowers',    width: 22 },
    { header: 'TikTok',                             key: 'tiktokUrl',             width: 32 },
    { header: 'YouTube',                            key: 'youtubeUrl',            width: 32 },
    { header: 'Telegram-канал',                     key: 'telegramChannelUrl',    width: 32 },
    { header: 'Threads',                            key: 'threadsUrl',            width: 32 },
    { header: 'Facebook',                           key: 'facebookUrl',           width: 32 },
    { header: 'Другие площадки',                   key: 'otherPlatforms',        width: 40 },
    { header: 'Подписчики (макс.)',                 key: 'maxFollowers',          width: 18 },
    { header: 'Форматы',                            key: 'formats',               width: 40 },
    { header: 'Цена Stories',                       key: 'priceStories',          width: 14 },
    { header: 'Цена серия Stories',                 key: 'priceStoriesSeries',    width: 18 },
    { header: 'Цена Reels',                         key: 'priceReels',            width: 14 },
    { header: 'Цена пост',                          key: 'pricePost',             width: 14 },
    { header: 'Цена мероприятие',                   key: 'priceEvent',            width: 16 },
    { header: 'Цена UGC',                           key: 'priceUgc',              width: 14 },
    { header: 'Средняя цена за 3 мес',             key: 'avgPrice3m',            width: 20 },
    { header: 'Бренды',                             key: 'brandsWorkedWith',      width: 36 },
    { header: 'Лучший кейс (ссылка)',               key: 'bestCaseUrl',           width: 32 },
    { header: 'Бартер',                             key: 'barterAvailable',       width: 10 },
    { header: 'Выезд',                              key: 'travelAvailable',       width: 10 },
    { header: 'Предпочтительные категории рекламодателей', key: 'preferredCategories', width: 42 },
    { header: 'Рейтинг',                            key: 'ratingAvg',             width: 10 },
    { header: 'Кол-во отзывов',                     key: 'ratingCount',           width: 14 },
    { header: 'Получать рекламные предложения',     key: 'marketingOptIn',        width: 32 },
    { header: 'Условия приняты',                    key: 'termsAcceptedAt',       width: 20 },
    { header: 'Дата регистрации',                   key: 'createdAt',             width: 20 },
  ];

  // Жирный заголовок + заморозка строки.
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // Формат дат для ячеек с датами.
  const DATE_COLS = ['birthDate', 'termsAcceptedAt', 'createdAt'];
  for (const col of ws.columns) {
    if (DATE_COLS.includes(col.key as string)) {
      col.numFmt = 'dd.mm.yyyy';
    }
  }

  for (const b of bloggers) {
    const tierLabel = b.tier ? BLOGGER_TIER_LABELS[b.tier as BloggerTier] ?? b.tier : '';
    const genderLabel = b.audienceGender
      ? (AUDIENCE_GENDER_LABELS[b.audienceGender as AudienceGender] ?? b.audienceGender)
      : '';
    const formatsLabel = (b.formats ?? [])
      .map((f) => COLLAB_FORMAT_LABELS[f as CollabFormat] ?? f)
      .join(', ');

    const row = ws.addRow({
      name:                   b.name ?? '',
      city:                   b.city ?? '',
      birthDate:              parseDate(b.birthDate),
      phone:                  b.phone ?? '',
      email:                  b.email ?? '',
      telegram:               b.telegramUsername ?? '',
      tier:                   tierLabel,
      categories:             (b.categories ?? []).join(', '),
      bio:                    b.bio ?? '',
      audienceGender:         genderLabel,
      audienceAge:            b.audienceAge ?? '',
      audienceGeo:            b.audienceGeo ?? '',
      audienceLanguage:       b.audienceLanguage ?? '',
      reachStories:           b.reachStories ?? null,
      reachReels:             b.reachReels ?? null,
      reachPosts:             b.reachPosts ?? null,
      engagementRate:         b.engagementRate ?? null,
      instagramUrl:           platformUrl(b, 'Instagram'),
      instagramFollowers:     platformFollowers(b, 'Instagram'),
      tiktokUrl:              platformUrl(b, 'TikTok'),
      youtubeUrl:             platformUrl(b, 'YouTube'),
      telegramChannelUrl:     platformUrl(b, 'Telegram'),
      threadsUrl:             platformUrl(b, 'Threads'),
      facebookUrl:            platformUrl(b, 'Facebook'),
      otherPlatforms:         otherPlatforms(b),
      maxFollowers:           maxFollowers(b),
      formats:                formatsLabel,
      priceStories:           b.priceStories ?? null,
      priceStoriesSeries:     b.priceStoriesSeries ?? null,
      priceReels:             b.priceReels ?? null,
      pricePost:              b.pricePost ?? null,
      priceEvent:             b.priceEvent ?? null,
      priceUgc:               b.priceUgc ?? null,
      avgPrice3m:             b.avgPrice3m ?? null,
      brandsWorkedWith:       b.brandsWorkedWith ?? '',
      bestCaseUrl:            b.bestCaseUrl ?? '',
      barterAvailable:        boolRu(b.barterAvailable),
      travelAvailable:        boolRu(b.travelAvailable),
      preferredCategories:    (b.preferredAdvertiserCategories ?? []).join(', '),
      ratingAvg:              b.ratingAvg ?? null,
      ratingCount:            b.ratingCount ?? 0,
      marketingOptIn:         boolRu(b.marketingOptIn),
      termsAcceptedAt:        parseDate(b.termsAcceptedAt),
      createdAt:              parseDate(b.createdAt),
    });

    // Числовой формат для денег (без знаков после запятой).
    const PRICE_COLS = [
      'priceStories', 'priceStoriesSeries', 'priceReels', 'pricePost',
      'priceEvent', 'priceUgc', 'avgPrice3m',
      'reachStories', 'reachReels', 'reachPosts',
      'instagramFollowers', 'maxFollowers', 'ratingCount',
    ];
    for (const col of ws.columns) {
      if (PRICE_COLS.includes(col.key as string)) {
        const cell = row.getCell(col.key as string);
        if (cell.value != null) cell.numFmt = '#,##0';
      }
    }
    // ER % — один знак.
    const erCell = row.getCell('engagementRate');
    if (erCell.value != null) erCell.numFmt = '0.0';
    // Рейтинг — один знак.
    const ratingCell = row.getCell('ratingAvg');
    if (ratingCell.value != null) ratingCell.numFmt = '0.0';
  }

  const raw = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
}
