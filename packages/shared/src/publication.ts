// Публикации от администраторов — контракт между бэком и фронтом.

export type PublicationStatus = 'draft' | 'published';
export type PublicationReplyMode = 'off' | 'private' | 'public';
export type PublicationMediaKind = 'image' | 'video';

// RU-лейблы статуса публикации.
export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  draft: 'Черновик',
  published: 'Опубликовано',
};

// RU-лейблы режима ответов.
export const PUBLICATION_REPLY_MODE_LABELS: Record<PublicationReplyMode, string> = {
  off: 'Отключены',
  private: 'Приватные',
  public: 'Публичные',
};

// Метаданные вложения публикации (для отображения через /media).
export interface PublicationAttachmentDto {
  id: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  kind: PublicationMediaKind;
}

// Агрегат оценок публикации.
export interface PublicationRatingAggregateDto {
  avgRating: number | null;
  ratingCount: number;
  myRating: number | null; // оценка текущего пользователя (null если не ставил)
}

// Вложение к сообщению приватного треда.
export interface PublicationThreadAttachmentDto {
  id: string;
  fileId: string;
  fileName: string;
  mimeType: string;
}

// Сообщение приватного треда (пользователь↔админ).
export interface PublicationThreadMessageDto {
  id: string;
  fromAdmin: boolean;
  body: string | null;
  attachments: PublicationThreadAttachmentDto[];
  createdAt: string; // ISO
}

// Тред публикации для пользователя (GET /publications/:id/thread).
export interface PublicationThreadDto {
  messages: PublicationThreadMessageDto[];
  hasUnread: boolean; // есть ли непрочитанные от администратора
  lastMessageAt: string | null; // ISO
}

// Краткий тред для списка тредов у администратора.
export interface AdminPublicationThreadListItemDto {
  userId: string;
  userName: string;
  userRole: string | null;
  messageCount: number;
  hasUnread: boolean; // есть ли непрочитанные от пользователя
  lastMessageAt: string; // ISO
}

// Полный тред для администратора (GET /admin/publications/:id/threads/:userId).
export interface AdminPublicationThreadDto {
  userId: string;
  userName: string;
  userRole: string | null;
  messages: PublicationThreadMessageDto[];
  hasUnread: boolean;
  lastMessageAt: string; // ISO
}

// Автор публичного комментария.
export interface PublicationCommentAuthorDto {
  userId: string;
  name: string;
  role: string | null;
}

// Публичный комментарий.
export interface PublicationCommentDto {
  id: string;
  author: PublicationCommentAuthorDto;
  body: string;
  createdAt: string; // ISO
}

// Сводка аудитории для списка публикаций (admin).
export interface PublicationAudienceSummaryDto {
  roles: string[];
  explicitUserCount: number;
}

// DTO публикации для пользовательской ленты (GET /publications).
export interface PublicationListItemDto {
  id: string;
  title: string | null;
  body: string;
  attachments: PublicationAttachmentDto[];
  ratingsEnabled: boolean;
  replyMode: PublicationReplyMode;
  publishedAt: string; // ISO (только published)
  hasRead: boolean;
  rating: PublicationRatingAggregateDto;
}

// Полный DTO публикации для пользователя (GET /publications/:id).
export interface PublicationDetailDto extends PublicationListItemDto {
  // идентично list item — тело и вложения уже включены
}

// DTO публикации для админского списка (GET /admin/publications).
export interface AdminPublicationListItemDto {
  id: string;
  title: string | null;
  status: PublicationStatus;
  audience: PublicationAudienceSummaryDto;
  ratingsEnabled: boolean;
  replyMode: PublicationReplyMode;
  attachmentCount: number;
  publishedAt: string | null; // ISO
  createdAt: string; // ISO
  rating: PublicationRatingAggregateDto;
  commentCount: number;
  threadCount: number;
}

// Полный DTO публикации для администратора (GET /admin/publications/:id).
export interface AdminPublicationDetailDto {
  id: string;
  title: string | null;
  body: string;
  status: PublicationStatus;
  audienceRoles: string[];
  audienceUserIds: string[];
  ratingsEnabled: boolean;
  replyMode: PublicationReplyMode;
  attachments: PublicationAttachmentDto[];
  publishedAt: string | null; // ISO
  createdAt: string; // ISO
  rating: PublicationRatingAggregateDto;
  commentCount: number;
  threadCount: number;
}

// Вложение в теле создания публикации.
export interface PublicationAttachmentInput {
  fileId: string;
  fileName: string;
  mimeType: string;
}

// Тело POST /admin/publications.
export interface CreatePublicationInput {
  title?: string;
  body: string;
  audienceRoles: string[];
  audienceUserIds?: string[];
  ratingsEnabled: boolean;
  replyMode: PublicationReplyMode;
  attachments?: PublicationAttachmentInput[];
  publish: boolean;
}

// Тело PATCH /admin/publications/:id.
export interface UpdatePublicationInput {
  title?: string | null;
  body?: string;
  audienceRoles?: string[];
  audienceUserIds?: string[];
  ratingsEnabled?: boolean;
  replyMode?: PublicationReplyMode;
  attachments?: PublicationAttachmentInput[];
  publish?: boolean;
}
