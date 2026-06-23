-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('not_delivered', 'poor_quality', 'no_contact', 'no_payment', 'terms_violation', 'other');

-- CreateEnum
CREATE TYPE "DisputeResolution" AS ENUM ('favor_company', 'favor_blogger', 'partial');

-- AlterEnum
ALTER TYPE "ResponseStatus" ADD VALUE 'disputed';

-- AlterTable
ALTER TABLE "SavedSearch" ALTER COLUMN "categories" DROP DEFAULT,
ALTER COLUMN "platforms" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "againstId" TEXT NOT NULL,
    "reason" "DisputeReason" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolution" "DisputeResolution",
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeAttachment" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_responseId_key" ON "Dispute"("responseId");

-- CreateIndex
CREATE INDEX "Dispute_lotId_idx" ON "Dispute"("lotId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "DisputeAttachment_disputeId_idx" ON "DisputeAttachment"("disputeId");

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeAttachment" ADD CONSTRAINT "DisputeAttachment_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
