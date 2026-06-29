-- CreateTable
CREATE TABLE "PublicationRating" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicationRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationThreadMessage" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "fromAdmin" BOOLEAN NOT NULL,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationThreadMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationThreadAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,

    CONSTRAINT "PublicationThreadAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationThreadState" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "lastReadByUserAt" TIMESTAMP(3),
    "lastReadByAdminAt" TIMESTAMP(3),

    CONSTRAINT "PublicationThreadState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationComment" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicationRating_publicationId_idx" ON "PublicationRating"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationRating_publicationId_userId_key" ON "PublicationRating"("publicationId", "userId");

-- CreateIndex
CREATE INDEX "PublicationThreadMessage_publicationId_userId_idx" ON "PublicationThreadMessage"("publicationId", "userId");

-- CreateIndex
CREATE INDEX "PublicationThreadAttachment_messageId_idx" ON "PublicationThreadAttachment"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationThreadState_publicationId_userId_key" ON "PublicationThreadState"("publicationId", "userId");

-- CreateIndex
CREATE INDEX "PublicationComment_publicationId_idx" ON "PublicationComment"("publicationId");

-- AddForeignKey
ALTER TABLE "PublicationRating" ADD CONSTRAINT "PublicationRating_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationThreadMessage" ADD CONSTRAINT "PublicationThreadMessage_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationThreadAttachment" ADD CONSTRAINT "PublicationThreadAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "PublicationThreadMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationThreadState" ADD CONSTRAINT "PublicationThreadState_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationComment" ADD CONSTRAINT "PublicationComment_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
