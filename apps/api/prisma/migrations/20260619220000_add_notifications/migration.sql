-- AlterTable: add notificationsEnabled to User (default true, so existing rows safe)
ALTER TABLE "User" ADD COLUMN "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: notification log for dedup
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientTgId" BIGINT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "lotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_recipientTgId_idx" ON "Notification"("recipientTgId");
