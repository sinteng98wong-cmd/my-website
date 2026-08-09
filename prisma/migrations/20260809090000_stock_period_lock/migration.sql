-- Stock period locking
--
-- Closes a clinic's stock month at (clinicId, period), where period is
-- "YYYY-MM" in Malaysia time. Deliberately separate from MonthlyRecon, which
-- means "cash settlement reconciled" and closes on a different cadence under
-- different authority.
--
-- The row doubles as the audit record: locking stamps who and when, unlocking
-- keeps the row and records who, when and why.

CREATE TYPE "StockPeriodStatus" AS ENUM ('OPEN', 'LOCKED');

CREATE TABLE "StockPeriodLock" (
  "id"           TEXT NOT NULL,
  "clinicId"     TEXT NOT NULL,
  "period"       TEXT NOT NULL,
  "status"       "StockPeriodStatus" NOT NULL DEFAULT 'LOCKED',
  "notes"        TEXT,
  "lockedById"   TEXT NOT NULL,
  "lockedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unlockedById" TEXT,
  "unlockedAt"   TIMESTAMP(3),
  "unlockReason" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockPeriodLock_pkey" PRIMARY KEY ("id")
);

-- One lock row per clinic-month. This is also what makes the lock check a
-- single indexed lookup on the hot posting path.
CREATE UNIQUE INDEX "StockPeriodLock_clinicId_period_key"
  ON "StockPeriodLock"("clinicId", "period");
CREATE INDEX "StockPeriodLock_clinicId_idx" ON "StockPeriodLock"("clinicId");
CREATE INDEX "StockPeriodLock_status_idx"   ON "StockPeriodLock"("status");

ALTER TABLE "StockPeriodLock" ADD CONSTRAINT "StockPeriodLock_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockPeriodLock" ADD CONSTRAINT "StockPeriodLock_lockedById_fkey"
  FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockPeriodLock" ADD CONSTRAINT "StockPeriodLock_unlockedById_fkey"
  FOREIGN KEY ("unlockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
