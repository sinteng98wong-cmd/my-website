-- Migration 2 of 2: All table schema changes.
-- Enum values from migration 1 are now committed and safe to use.

-- ── PoolOrder: add new columns ────────────────────────────────────────────

ALTER TABLE "PoolOrder"
  ADD COLUMN IF NOT EXISTS "deliveryMode"       "PoolDeliveryMode" NOT NULL DEFAULT 'CENTRALISED',
  ADD COLUMN IF NOT EXISTS "deadlineNotifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notes"              TEXT,
  ADD COLUMN IF NOT EXISTS "raisedById"         TEXT,
  ADD COLUMN IF NOT EXISTS "approvedById"       TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveredAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reopenedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reopenedById"       TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "PoolOrder_status_idx"            ON "PoolOrder"("status");
CREATE INDEX IF NOT EXISTS "PoolOrder_initiatingClinicId_idx" ON "PoolOrder"("initiatingClinicId");

-- ── PoolOrderLine: add unitCost + index ───────────────────────────────────

ALTER TABLE "PoolOrderLine"
  ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "PoolOrderLine_poolId_idx" ON "PoolOrderLine"("poolId");

-- ── PoolParticipant: rename amount → requestedAmount, add columns ─────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'PoolParticipant' AND column_name = 'amount'
  ) THEN
    ALTER TABLE "PoolParticipant" RENAME COLUMN "amount" TO "requestedAmount";
  END IF;
END $$;

ALTER TABLE "PoolParticipant"
  ADD COLUMN IF NOT EXISTS "receivedAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "joinedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "joinedById"  TEXT;

CREATE INDEX IF NOT EXISTS "PoolParticipant_poolId_idx" ON "PoolParticipant"("poolId");

-- ── PoolParticipantLine: new table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PoolParticipantLine" (
  "id"            TEXT         NOT NULL,
  "participantId" TEXT         NOT NULL,
  "itemId"        TEXT         NOT NULL,
  "requestedQty"  INTEGER      NOT NULL,
  "approvedQty"   INTEGER,
  "unitCost"      DECIMAL(10,2) NOT NULL,
  CONSTRAINT "PoolParticipantLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PoolParticipantLine_participantId_idx" ON "PoolParticipantLine"("participantId");
CREATE INDEX IF NOT EXISTS "PoolParticipantLine_itemId_idx"        ON "PoolParticipantLine"("itemId");

ALTER TABLE "PoolParticipantLine"
  ADD CONSTRAINT "PoolParticipantLine_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "PoolParticipant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PoolParticipantLine_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "StockItem"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── DeliveryOrder: add new columns, change default ────────────────────────

ALTER TABLE "DeliveryOrder"
  ADD COLUMN IF NOT EXISTS "notes"         TEXT,
  ADD COLUMN IF NOT EXISTS "poolOrderId"   TEXT,
  ADD COLUMN IF NOT EXISTS "raisedById"    TEXT,
  ADD COLUMN IF NOT EXISTS "approvedById"  TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dispatchedAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Change status default from PENDING to DRAFT
ALTER TABLE "DeliveryOrder" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

CREATE INDEX IF NOT EXISTS "DeliveryOrder_fromClinicId_status_idx" ON "DeliveryOrder"("fromClinicId", "status");
CREATE INDEX IF NOT EXISTS "DeliveryOrder_toClinicId_status_idx"   ON "DeliveryOrder"("toClinicId",   "status");
CREATE INDEX IF NOT EXISTS "DeliveryOrder_poolOrderId_idx"          ON "DeliveryOrder"("poolOrderId");

-- ── DOLine: add receivedQty, notes, index ────────────────────────────────

ALTER TABLE "DOLine"
  ADD COLUMN IF NOT EXISTS "receivedQty" INTEGER,
  ADD COLUMN IF NOT EXISTS "notes"       TEXT;

CREATE INDEX IF NOT EXISTS "DOLine_doId_idx" ON "DOLine"("doId");

-- ── Foreign keys for new relation columns ────────────────────────────────

ALTER TABLE "PoolOrder"
  ADD CONSTRAINT "PoolOrder_raisedById_fkey"
    FOREIGN KEY ("raisedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "PoolOrder_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "PoolOrder_reopenedById_fkey"
    FOREIGN KEY ("reopenedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PoolParticipant"
  ADD CONSTRAINT "PoolParticipant_joinedById_fkey"
    FOREIGN KEY ("joinedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryOrder"
  ADD CONSTRAINT "DeliveryOrder_poolOrderId_fkey"
    FOREIGN KEY ("poolOrderId") REFERENCES "PoolOrder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryOrder_raisedById_fkey"
    FOREIGN KEY ("raisedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "DeliveryOrder_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
