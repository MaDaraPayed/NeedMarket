// Контракт сохранённых поисков блогера (подписки на лоты).
export interface SavedSearchDto {
  id: string;
  bloggerId: string;
  name: string | null;
  categories: string[];   // пусто = любая категория
  platforms: string[];    // пусто = любая площадка
  minBudget: number | null;
  isActive: boolean;
  createdAt: string; // ISO
}

// Тело POST /me/saved-searches.
export interface CreateSavedSearchInput {
  name?: string;
  categories: string[];
  platforms: string[];
  minBudget?: number;
}

// Тело PATCH /me/saved-searches/:id.
export interface UpdateSavedSearchInput {
  name?: string | null;
  categories?: string[];
  platforms?: string[];
  minBudget?: number | null;
  isActive?: boolean;
}
