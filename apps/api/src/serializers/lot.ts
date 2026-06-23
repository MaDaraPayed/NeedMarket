import type { Lot, LotAttachmentDto, ReviewGiven, ReviewReceived } from '@needmarket/shared';
import type { Db, LotRecord, LotAttachmentRecord } from '../types';
import { fetchRatingMap } from './rating';

type CompanyBrief = { id: string; userId: string; name: string; logoFileId: string | null };

// mediaUrl для картинок — inline (/media/:fileId, для <img src>).
// mediaUrl для документов — /media/:fileId?name=&type= → Content-Disposition: attachment.
// downloadUrl — всегда с ?name=&type= (картинки + документы).
export function toAttachmentDto(a: LotAttachmentRecord): LotAttachmentDto {
  const isImage = a.contentType.startsWith('image/');

  const mediaUrl = isImage
    ? `/media/${a.fileId}`
    : `/media/${a.fileId}?name=${encodeURIComponent(a.fileName ?? 'document')}&type=${encodeURIComponent(a.contentType)}`;

  const downloadName = a.fileName ?? (isImage ? imageFileName(a.contentType) : 'document');
  const downloadUrl = `/media/${a.fileId}?name=${encodeURIComponent(downloadName)}&type=${encodeURIComponent(a.contentType)}`;

  return {
    id: a.id,
    mediaUrl,
    downloadUrl,
    contentType: a.contentType,
    fileName: a.fileName,
    position: a.position,
  };
}

function imageFileName(contentType: string): string {
  const ext = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : 'png';
  return `image.${ext}`;
}

export function toLotDto(
  lot: LotRecord,
  company: CompanyBrief,
  hasResponded?: boolean,
  attachments?: LotAttachmentRecord[],
  acceptedCount = 0,
  companyRating?: { ratingAvg: number | null; ratingCount: number },
  reviewsGiven?: ReviewGiven[],
  reviewsReceived?: ReviewReceived[],
  myDisputeStatus?: 'open' | 'resolved' | null,
): Lot {
  return {
    id: lot.id,
    companyId: lot.companyId,
    title: lot.title,
    description: lot.description,
    categories: lot.categories as Lot['categories'],
    platforms: lot.platforms,
    budget: lot.budget,
    deadline: lot.deadline.toISOString(),
    requirements: lot.requirements,
    status: lot.status,
    slotsNeeded: lot.slotsNeeded,
    createdAt: lot.createdAt.toISOString(),
    company: {
      name: company.name,
      logoUrl: company.logoFileId ? `/media/${company.logoFileId}` : null,
      userId: company.userId,
      ratingAvg: companyRating?.ratingAvg ?? null,
      ratingCount: companyRating?.ratingCount ?? 0,
    },
    acceptedCount,
    hasResponded,
    attachments: attachments ? attachments.map(toAttachmentDto) : undefined,
    reviewsGiven,
    reviewsReceived,
    myDisputeStatus,
  };
}

// Прикладываем компании + acceptedCount к списку лотов одним запросом каждый (без N+1).
// respondedIds — Set lotId, на которые текущий блогер уже откликнулся.
// withAttachments=true — один запрос на все вложения по lotId.in (режим детального просмотра).
// currentUserId — если задан, для completed-лотов добавляем reviewsGiven/reviewsReceived.
export async function toLotDtos(
  db: Db,
  lots: LotRecord[],
  respondedIds?: Set<string>,
  withAttachments?: boolean,
  currentUserId?: string,
): Promise<Lot[]> {
  if (lots.length === 0) return [];
  const lotIds = lots.map((l) => l.id);
  const companyIds = [...new Set(lots.map((l) => l.companyId))];
  const companies = await db.companyProfile.findMany({ where: { id: { in: companyIds } } });
  const byId = new Map(companies.map((c) => [c.id, c]));

  // Рейтинг компаний — batch groupBy по userId.
  const companyUserIds = companies.map((c) => c.userId);
  const companyRatingMap = await fetchRatingMap(db, companyUserIds);

  // Число занятых слотов на каждый лот: accepted + disputed считаются занятыми.
  const acceptedResponses = await db.response.findMany({
    where: { lotId: { in: lotIds }, status: { in: ['accepted', 'disputed'] } },
  });
  const acceptedByLot = new Map<string, number>();
  for (const r of acceptedResponses) {
    acceptedByLot.set(r.lotId, (acceptedByLot.get(r.lotId) ?? 0) + 1);
  }

  let attachmentsByLot: Map<string, LotAttachmentRecord[]> | undefined;
  if (withAttachments) {
    const all = await db.lotAttachment.findMany({
      where: { lotId: { in: lotIds } },
      orderBy: { position: 'asc' },
    });
    attachmentsByLot = new Map();
    for (const a of all) {
      const list = attachmentsByLot.get(a.lotId) ?? [];
      list.push(a);
      attachmentsByLot.set(a.lotId, list);
    }
  }

  // Review-обогащение: только в режиме детального просмотра с авторизованным пользователем.
  let reviewsGivenByLot: Map<string, ReviewGiven[]> | undefined;
  let reviewsReceivedByLot: Map<string, ReviewReceived[]> | undefined;
  if (withAttachments && currentUserId) {
    const completedLotIds = lots.filter((l) => l.status === 'completed').map((l) => l.id);
    if (completedLotIds.length > 0) {
      // Два batch-запроса: отзывы, ДАННЫЕ мной, и отзывы, ПОЛУЧЕННЫЕ мной.
      const [givenAll, receivedAll] = await Promise.all([
        db.review.findMany({
          where: { lotId: { in: completedLotIds }, authorId: currentUserId },
          orderBy: { createdAt: 'asc' },
        }),
        db.review.findMany({
          where: { lotId: { in: completedLotIds }, targetId: currentUserId },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

      // Имена авторов полученных отзывов — batch по authorId (= User.id = profile.userId).
      const authorUserIds = [...new Set(receivedAll.map((r) => r.authorId))];
      const authorNameMap = new Map<string, string>();
      if (authorUserIds.length > 0) {
        const [bloggerProfiles, companyProfiles] = await Promise.all([
          db.bloggerProfile.findMany({ where: { userId: { in: authorUserIds } } }),
          db.companyProfile.findMany({ where: { userId: { in: authorUserIds } } }),
        ]);
        for (const p of bloggerProfiles) authorNameMap.set(p.userId, p.displayName);
        for (const p of companyProfiles) if (!authorNameMap.has(p.userId)) authorNameMap.set(p.userId, p.name);
      }

      reviewsGivenByLot = new Map();
      for (const r of givenAll) {
        const list = reviewsGivenByLot.get(r.lotId) ?? [];
        list.push({ id: r.id, targetId: r.targetId, rating: r.rating, comment: r.comment, createdAt: r.createdAt.toISOString() });
        reviewsGivenByLot.set(r.lotId, list);
      }

      reviewsReceivedByLot = new Map();
      for (const r of receivedAll) {
        const list = reviewsReceivedByLot.get(r.lotId) ?? [];
        list.push({
          id: r.id,
          authorId: r.authorId,
          authorName: authorNameMap.get(r.authorId) ?? r.authorId,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt.toISOString(),
        });
        reviewsReceivedByLot.set(r.lotId, list);
      }
    }
  }

  // Dispute-обогащение: только в режиме детального просмотра с авторизованным пользователем.
  let myDisputeStatusByLot: Map<string, 'open' | 'resolved' | null> | undefined;
  if (withAttachments && currentUserId) {
    const disputes = await db.dispute.findMany({ where: { lotId: { in: lotIds } } });
    myDisputeStatusByLot = new Map();
    for (const lot of lots) {
      const mine = disputes.filter(
        (d) => d.lotId === lot.id && (d.raisedById === currentUserId || d.againstId === currentUserId),
      );
      let status: 'open' | 'resolved' | null = null;
      if (mine.some((d) => d.status === 'open')) status = 'open';
      else if (mine.some((d) => d.status === 'resolved')) status = 'resolved';
      myDisputeStatusByLot.set(lot.id, status);
    }
  }

  const out: Lot[] = [];
  for (const lot of lots) {
    const company = byId.get(lot.companyId);
    if (company) {
      const companyRating = companyRatingMap.get(company.userId);
      out.push(
        toLotDto(
          lot,
          company,
          respondedIds ? respondedIds.has(lot.id) : undefined,
          attachmentsByLot ? (attachmentsByLot.get(lot.id) ?? []) : undefined,
          acceptedByLot.get(lot.id) ?? 0,
          companyRating,
          reviewsGivenByLot?.get(lot.id),
          reviewsReceivedByLot?.get(lot.id),
          myDisputeStatusByLot?.get(lot.id),
        ),
      );
    }
  }
  return out;
}
