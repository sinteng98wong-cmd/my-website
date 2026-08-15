-- Opening Balance
--
-- Establishes a clinic's first ledger position from a physical count entered
-- by the branch and approved by a reviewer. Purely additive: two tables and
-- two enum values. No existing data is touched.
--
-- Timestamped after 20260809090000_stock_period_lock so it applies last —
-- OPENING_BALANCE already exists on StockMovementType, but the new
-- StockSourceType value must be added before any row can reference it.

ALTER TYPE "StockSourceType" ADD VALUE 'OPENING_BALANCE';

CREATE TYPE "OpeningBalanceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

CREATE TABLE "OpeningBalance" (
  "id"            TEXT NOT NULL,
  "reference"     TEXT NOT NULL,
  "clinicId"      TEXT NOT NULL,
  "status"        "OpeningBalanceStatus" NOT NULL DEFAULT 'DRAFT',
  "notes"         TEXT,
  "createdById"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedById" TEXT,
  "submittedAt"   TIMESTAMP(3),
  "reviewedById"  TEXT,
  "reviewedAt"    TIMESTAMP(3),
  "reviewNote"    TEXT,
  "postedAt"      TIMESTAMP(3),
  "totalQuantity" INTEGER NOT NULL DEFAULT 0,
  "totalValue"    DECIMAL(14,2) NOT NULL DEFAULT 0,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpeningBalance_reference_key" ON "OpeningBalance"("reference");
CREATE INDEX "OpeningBalance_clinicId_status_idx" ON "OpeningBalance"("clinicId", "status");
CREATE INDEX "OpeningBalance_createdAt_idx" ON "OpeningBalance"("createdAt");

CREATE TABLE "OpeningBalanceLine" (
  "id"               TEXT NOT NULL,
  "openingBalanceId" TEXT NOT NULL,
  "itemId"           TEXT NOT NULL,
  "quantity"         INTEGER,
  "unitCost"         DECIMAL(12,4),
  "batchNumber"      TEXT,
  "expiryDate"       TIMESTAMP(3),
  "note"             TEXT,
  "postedQty"        INTEGER,
  "postedUnitCost"   DECIMAL(12,4),
  "movementId"       TEXT,
  CONSTRAINT "OpeningBalanceLine_pkey" PRIMARY KEY ("id")
);

-- One line per item per document; the branch cannot enter the same item twice.
CREATE UNIQUE INDEX "OpeningBalanceLine_openingBalanceId_itemId_key"
  ON "OpeningBalanceLine"("openingBalanceId", "itemId");
CREATE INDEX "OpeningBalanceLine_openingBalanceId_idx"
  ON "OpeningBalanceLine"("openingBalanceId");

ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OpeningBalanceLine" ADD CONSTRAINT "OpeningBalanceLine_openingBalanceId_fkey"
  FOREIGN KEY ("openingBalanceId") REFERENCES "OpeningBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpeningBalanceLine" ADD CONSTRAINT "OpeningBalanceLine_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
