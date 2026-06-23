-- CreateTable
CREATE TABLE "LotAttachment" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "msgId" INTEGER,
    "contentType" TEXT NOT NULL,
    "fileName" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LotAttachment_lotId_idx" ON "LotAttachment"("lotId");

-- AddForeignKey
ALTER TABLE "LotAttachment" ADD CONSTRAINT "LotAttachment_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
