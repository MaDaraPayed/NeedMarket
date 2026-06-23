-- Add dedupeKey to Notification for per-response dedup of dispute events.
-- When set, dedupeKey overrides lotId as the dedup dimension in trySend,
-- allowing two disputes on the same lot (different response pairs) to each notify.
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;

CREATE INDEX "Notification_dedupeKey_idx" ON "Notification"("dedupeKey");
