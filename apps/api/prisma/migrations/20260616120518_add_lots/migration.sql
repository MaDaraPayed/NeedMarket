-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('draft', 'awaiting_payment', 'active', 'in_progress', 'completed', 'cancelled', 'disputed');

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "platforms" TEXT[],
    "budget" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "requirements" TEXT[],
    "status" "LotStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lot_status_createdAt_idx" ON "Lot"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Lot_category_idx" ON "Lot"("category");

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
