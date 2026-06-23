-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- AlterTable
ALTER TABLE "Lot" ADD COLUMN     "chosenResponseId" TEXT;

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "bloggerId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ResponseStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Response_lotId_idx" ON "Response"("lotId");

-- CreateIndex
CREATE INDEX "Response_bloggerId_idx" ON "Response"("bloggerId");

-- CreateIndex
CREATE UNIQUE INDEX "Response_lotId_bloggerId_key" ON "Response"("lotId", "bloggerId");

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_bloggerId_fkey" FOREIGN KEY ("bloggerId") REFERENCES "BloggerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
