// Типы и лейблы, специфичные для профиля блогера.

export type AudienceGender = 'mostly_female' | 'mostly_male' | 'mixed';

export const AUDIENCE_GENDER_LABELS: Record<AudienceGender, string> = {
  mostly_female: 'Преимущественно женская',
  mostly_male: 'Преимущественно мужская',
  mixed: 'Смешанная',
};

export type CollabFormat =
  | 'stories'
  | 'stories_series'
  | 'reels'
  | 'posts'
  | 'video_reviews'
  | 'interviews'
  | 'live_streams'
  | 'brand_ambassador'
  | 'events'
  | 'ugc';

export const COLLAB_FORMAT_LABELS: Record<CollabFormat, string> = {
  stories: 'Stories',
  stories_series: 'Серия Stories',
  reels: 'Reels',
  posts: 'Посты',
  video_reviews: 'Видеообзоры',
  interviews: 'Интервью',
  live_streams: 'Прямые эфиры',
  brand_ambassador: 'Амбассадорство',
  events: 'Мероприятия',
  ugc: 'UGC',
};

export const FORMATS: Array<{ value: CollabFormat; label: string }> = (
  Object.keys(COLLAB_FORMAT_LABELS) as CollabFormat[]
).map((v) => ({ value: v, label: COLLAB_FORMAT_LABELS[v] }));

// Тир блогера — вычисляемый, не хранится в БД.
export type BloggerTier = 'micro' | 'medium' | 'large';

export const BLOGGER_TIER_LABELS: Record<BloggerTier, string> = {
  micro: 'Микро',
  medium: 'Средний',
  large: 'Крупный',
};

export const TIER_THRESHOLDS = { medium: 50_000, large: 200_000 } as const;

// Порог micro: < 50 000; medium: 50 000–199 999; large: ≥ 200 000.
export function deriveTier(maxFollowers: number | null | undefined): BloggerTier | undefined {
  if (maxFollowers == null) return undefined;
  if (maxFollowers >= TIER_THRESHOLDS.large) return 'large';
  if (maxFollowers >= TIER_THRESHOLDS.medium) return 'medium';
  return 'micro';
}
