-- Migration: add-soft-delete
-- Adds deletedAt / deletedBy to Patient, Visit, Invoice for GDPR-safe soft delete.

-- Patient
ALTER TABLE "Patient"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedBy" TEXT;

ALTER TABLE "Patient"
  ADD CONSTRAINT "Patient_deletedBy_fkey"
  FOREIGN KEY ("deletedBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Patient_deletedAt_idx" ON "Patient"("deletedAt");

-- Visit
ALTER TABLE "Visit"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedBy" TEXT;

ALTER TABLE "Visit"
  ADD CONSTRAINT "Visit_deletedBy_fkey"
  FOREIGN KEY ("deletedBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Visit_deletedAt_idx" ON "Visit"("deletedAt");

-- Invoice
ALTER TABLE "Invoice"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedBy" TEXT;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_deletedBy_fkey"
  FOREIGN KEY ("deletedBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Invoice_deletedAt_idx" ON "Invoice"("deletedAt");
