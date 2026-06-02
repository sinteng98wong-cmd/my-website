-- Migration: audit-ledger-ratetype-enum
-- 1. Add audit fields to DailyLedger
-- 2. Convert DoctorProfile.rateType from String to RateType enum

-- ── DailyLedger audit fields ─────────────────────────────────────────────

ALTER TABLE "DailyLedger"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedBy" TEXT;

ALTER TABLE "DailyLedger"
  ADD CONSTRAINT "DailyLedger_updatedBy_fkey"
  FOREIGN KEY ("updatedBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── RateType enum ────────────────────────────────────────────────────────

CREATE TYPE "RateType" AS ENUM ('DAY', 'HOUR');

-- Add new enum column
ALTER TABLE "DoctorProfile" ADD COLUMN "rateType_new" "RateType";

-- Migrate existing string values
UPDATE "DoctorProfile"
SET "rateType_new" = CASE
  WHEN "rateType" = 'day'  THEN 'DAY'::"RateType"
  WHEN "rateType" = 'hour' THEN 'HOUR'::"RateType"
  ELSE NULL
END;

-- Drop old string column, rename new enum column
ALTER TABLE "DoctorProfile" DROP COLUMN "rateType";
ALTER TABLE "DoctorProfile" RENAME COLUMN "rateType_new" TO "rateType";
