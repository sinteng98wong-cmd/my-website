-- Add sourceMonth to MethodSettlementEntry (null = current month; YYYY-MM = carry-forward from prior month)
ALTER TABLE "MethodSettlementEntry" ADD COLUMN "sourceMonth" TEXT;

-- Drop old unique index
DROP INDEX "MethodSettlementEntry_reconId_method_key";

-- Add new unique index including sourceMonth (NULL-safe: each NULL is treated as distinct, so use NULLS NOT DISTINCT)
CREATE UNIQUE INDEX "MethodSettlementEntry_reconId_method_sourceMonth_key" ON "MethodSettlementEntry"("reconId", "method", "sourceMonth") NULLS NOT DISTINCT;
