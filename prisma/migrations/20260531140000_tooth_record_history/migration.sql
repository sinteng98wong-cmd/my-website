-- Migration: tooth-record-history
-- Converts ToothRecord from a "one row per tooth" model to a full history log.
-- Every write is now an INSERT; the current state is derived from the latest row per tooth.

-- 1. Drop old unique constraint
ALTER TABLE "ToothRecord" DROP CONSTRAINT IF EXISTS "ToothRecord_patientId_toothCode_key";

-- 2. Drop updatedAt column (history rows are immutable — no updates)
ALTER TABLE "ToothRecord" DROP COLUMN IF EXISTS "updatedAt";

-- 3. Add visitId foreign key column
ALTER TABLE "ToothRecord" ADD COLUMN "visitId" TEXT;

ALTER TABLE "ToothRecord"
  ADD CONSTRAINT "ToothRecord_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "Visit"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Add new indexes for history queries
CREATE INDEX IF NOT EXISTS "ToothRecord_patientId_toothCode_idx" ON "ToothRecord"("patientId", "toothCode");
CREATE INDEX IF NOT EXISTS "ToothRecord_patientId_idx"           ON "ToothRecord"("patientId");
CREATE INDEX IF NOT EXISTS "ToothRecord_visitId_idx"             ON "ToothRecord"("visitId");
