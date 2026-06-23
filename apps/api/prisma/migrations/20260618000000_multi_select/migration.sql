-- AlterTable: drop single-select chosenResponseId, add multi-slot slotsNeeded
ALTER TABLE "Lot" DROP COLUMN IF EXISTS "chosenResponseId";

ALTER TABLE "Lot" ADD COLUMN "slotsNeeded" INTEGER NOT NULL DEFAULT 1;
