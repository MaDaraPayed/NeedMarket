-- Add awaiting_decision to LotStatus: lot enters this state after favor_company resolution.
-- Company must explicitly choose continue or reject before any other actions are allowed.
ALTER TYPE "LotStatus" ADD VALUE 'awaiting_decision';

-- Track whether company still needs to make a decision after favor_company resolution.
ALTER TABLE "Dispute" ADD COLUMN "awaitingCompanyDecision" BOOLEAN NOT NULL DEFAULT false;
