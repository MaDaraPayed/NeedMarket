// Контракт отзыва между фронтом и бэком.

// Один отзыв в публичном списке отзывов о пользователе.
export interface ReviewDto {
  id: string;
  rating: number;       // 1..5
  comment: string | null;
  createdAt: string;    // ISO
  authorName: string;   // displayName блогера или название компании
}

// Тело POST /lots/:id/reviews.
export interface CreateReviewInput {
  rating: number;
  comment?: string;
  targetId?: string; // обязателен для компании-владельца, игнорируется для блогера
}

// Отзыв, данный текущим пользователем на этом лоте (для обогащения GET /lots/:id).
export interface ReviewGiven {
  id: string;
  targetId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

// Отзыв, полученный текущим пользователем на этом лоте (для обогащения GET /lots/:id).
export interface ReviewReceived {
  id: string;
  authorId: string;
  authorName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}
