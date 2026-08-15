-- AlterTable
ALTER TABLE "POLine" ADD COLUMN     "postedQty" INTEGER NOT NULL DEFAULT 0;

-- Backfill: lines on POs that already committed stock carry the quantity that
-- was posted at the time, so the next receipt posts only the difference
-- instead of re-posting goods that are already on the shelf.
UPDATE "POLine" l
SET "postedQty" = COALESCE(l."receivedQty", l."quantity")
FROM "PurchaseOrder" po
WHERE po."id" = l."poId"
  AND po."status" IN ('PARTIAL', 'RECEIVED', 'INVOICED');
