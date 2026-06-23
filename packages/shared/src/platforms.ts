// Единый фиксированный список площадок — ИСТОЧНИК ИСТИНЫ для всего монорепо.
// Используется в лотах (на каких площадках нужен блогер) и в фильтрах ленты.
export const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Telegram'] as const;

export type Platform = (typeof PLATFORMS)[number];
