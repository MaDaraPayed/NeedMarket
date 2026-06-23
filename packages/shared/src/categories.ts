// Единый фиксированный список категорий — ИСТОЧНИК ИСТИНЫ для всего монорепо.
// Используется в профиле блогера и (позже) в лотах/фильтрах. Раньше дублировался
// в apps/api/src/categories.ts и apps/miniapp/src/categories.ts — теперь только здесь.
export const CATEGORIES = [
  'Бьюти',
  'Лайфстайл',
  'Еда',
  'Услуги',
  'Тех',
  'Игры',
  'Спорт',
  'Образование',
] as const;

export type Category = (typeof CATEGORIES)[number];
