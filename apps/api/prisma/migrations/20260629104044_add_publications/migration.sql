-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "PublicationReplyMode" AS ENUM ('off', 'private', 'public');

-- CreateEnum
CREATE TYPE "PublicationMediaKind" AS ENUM ('image', 'video');

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "audienceRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audienceUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ratingsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "replyMode" "PublicationReplyMode" NOT NULL DEFAULT 'off',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationAttachment" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "kind" "PublicationMediaKind" NOT NULL,

    CONSTRAINT "PublicationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationRead" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Publication_status_idx" ON "Publication"("status");

-- CreateIndex
CREATE INDEX "Publication_publishedAt_idx" ON "Publication"("publishedAt");

-- CreateIndex
CREATE INDEX "PublicationAttachment_publicationId_idx" ON "PublicationAttachment"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationRead_publicationId_userId_key" ON "PublicationRead"("publicationId", "userId");

-- AddForeignKey
ALTER TABLE "PublicationAttachment" ADD CONSTRAINT "PublicationAttachment_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationRead" ADD CONSTRAINT "PublicationRead_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
