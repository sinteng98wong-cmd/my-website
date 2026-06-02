-- UserClinicModule was in the schema but the table was never created.
-- This migration creates it.

CREATE TABLE IF NOT EXISTS "UserClinicModule" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "clinicId"  TEXT         NOT NULL,
  "module"    TEXT         NOT NULL,
  "enabled"   BOOLEAN      NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserClinicModule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserClinicModule_userId_clinicId_module_key"
  ON "UserClinicModule"("userId", "clinicId", "module");

CREATE INDEX IF NOT EXISTS "UserClinicModule_userId_clinicId_idx"
  ON "UserClinicModule"("userId", "clinicId");

ALTER TABLE "UserClinicModule"
  ADD CONSTRAINT "UserClinicModule_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserClinicModule"
  ADD CONSTRAINT "UserClinicModule_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
