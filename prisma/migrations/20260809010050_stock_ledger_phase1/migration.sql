-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING_BALANCE', 'RECEIPT_PO', 'RECEIPT_FOC', 'RECEIPT_POOL', 'RETURN_SUPPLIER', 'TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_VARIANCE_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'STOCK_TAKE_IN', 'STOCK_TAKE_OUT', 'CONSUMPTION', 'CONSUMPTION_REVERSAL', 'WRITE_OFF_EXPIRY', 'WRITE_OFF_DAMAGE', 'REVALUATION');

-- CreateEnum
CREATE TYPE "StockDirection" AS ENUM ('IN', 'OUT', 'NONE');

-- CreateEnum
CREATE TYPE "StockSourceType" AS ENUM ('PURCHASE_ORDER', 'DELIVERY_ORDER', 'POOL_ORDER', 'STOCK_ADJUSTMENT', 'STOCK_TAKE', 'STOCK_ISSUE', 'WRITE_OFF', 'STOCK_INVOICE', 'MIGRATION');

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "clinicId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "direction" "StockDirection" NOT NULL,
    "qtyIn" INTEGER NOT NULL DEFAULT 0,
    "qtyOut" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "valueDelta" DECIMAL(14,2) NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "valueAfter" DECIMAL(14,2) NOT NULL,
    "avgCostAfter" DECIMAL(12,4) NOT NULL,
    "sourceType" "StockSourceType" NOT NULL,
    "sourceId" TEXT,
    "sourceLineId" TEXT,
    "reference" TEXT NOT NULL,
    "postingKey" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "note" TEXT,
    "movementAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_seq_key" ON "StockMovement"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_postingKey_key" ON "StockMovement"("postingKey");

-- CreateIndex
CREATE INDEX "StockMovement_clinicId_itemId_seq_idx" ON "StockMovement"("clinicId", "itemId", "seq");

-- CreateIndex
CREATE INDEX "StockMovement_clinicId_period_idx" ON "StockMovement"("clinicId", "period");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_seq_idx" ON "StockMovement"("itemId", "seq");

-- CreateIndex
CREATE INDEX "StockMovement_batchId_idx" ON "StockMovement"("batchId");

-- CreateIndex
CREATE INDEX "StockMovement_sourceType_sourceId_idx" ON "StockMovement"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "StockMovement_type_idx" ON "StockMovement"("type");

-- CreateIndex
CREATE INDEX "StockMovement_reversalOfId_idx" ON "StockMovement"("reversalOfId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Ledger integrity constraints ─────────────────────────────────────────
-- Quantities are magnitudes; direction carries the sign.
ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_qty_nonnegative"
  CHECK ("qtyIn" >= 0 AND "qtyOut" >= 0);

-- Exactly one side moves, except a revaluation which moves value only.
ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_single_direction"
  CHECK (
    ("direction" = 'IN'   AND "qtyIn" > 0 AND "qtyOut" = 0) OR
    ("direction" = 'OUT'  AND "qtyOut" > 0 AND "qtyIn" = 0) OR
    ("direction" = 'NONE' AND "qtyIn" = 0 AND "qtyOut" = 0)
  );

-- Negative stock is blocked by policy; the ledger refuses to record it.
ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_balance_nonnegative"
  CHECK ("balanceAfter" >= 0);

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_period_format"
  CHECK ("period" ~ '^[0-9]{4}-[0-9]{2}$');

-- A movement can be reversed at most once.
CREATE UNIQUE INDEX "StockMovement_reversalOf_unique"
  ON "StockMovement" ("reversalOfId") WHERE "reversalOfId" IS NOT NULL;

-- ── Immutability ─────────────────────────────────────────────────────────
-- Historical movements are never edited. Corrections post a new compensating
-- movement linked through reversalOfId.
--
-- UPDATE is refused unconditionally. DELETE is refused unless the session
-- explicitly opts into maintenance mode, which exists only so automated test
-- teardown can purge its own fixtures — no application code ever sets it.
CREATE OR REPLACE FUNCTION "stock_movement_immutable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND coalesce(current_setting('dentalos.ledger_maintenance', true), 'off') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    'StockMovement is an immutable ledger: % is not permitted. Post a compensating movement instead.',
    TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "stock_movement_no_update"
  BEFORE UPDATE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION "stock_movement_immutable"();

CREATE TRIGGER "stock_movement_no_delete"
  BEFORE DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION "stock_movement_immutable"();
