-- CreateEnum
CREATE TYPE "StockTakeStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RECOUNT_REQUIRED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StockAdjustmentReason" AS ENUM ('STOCK_COUNT_VARIANCE', 'DAMAGED', 'EXPIRED', 'WASTAGE', 'FOUND_STOCK', 'DATA_CORRECTION', 'OTHER');

-- CreateTable
CREATE TABLE "StockTake" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "status" "StockTakeStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "postedAt" TIMESTAMP(3),
    "totalVarianceQty" INTEGER NOT NULL DEFAULT 0,
    "totalVarianceValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTakeLine" (
    "id" TEXT NOT NULL,
    "stockTakeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "physicalQty" INTEGER,
    "avgUnitCost" DECIMAL(12,4) NOT NULL,
    "reason" "StockAdjustmentReason",
    "note" TEXT,
    "countedById" TEXT,
    "countedAt" TIMESTAMP(3),
    "postedVarianceQty" INTEGER,
    "postedUnitCost" DECIMAL(12,4),
    "movementId" TEXT,

    CONSTRAINT "StockTakeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockTake_reference_key" ON "StockTake"("reference");

-- CreateIndex
CREATE INDEX "StockTake_clinicId_status_idx" ON "StockTake"("clinicId", "status");

-- CreateIndex
CREATE INDEX "StockTake_createdAt_idx" ON "StockTake"("createdAt");

-- CreateIndex
CREATE INDEX "StockTakeLine_stockTakeId_idx" ON "StockTakeLine"("stockTakeId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTakeLine_stockTakeId_itemId_key" ON "StockTakeLine"("stockTakeId", "itemId");

-- AddForeignKey
ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_stockTakeId_fkey" FOREIGN KEY ("stockTakeId") REFERENCES "StockTake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
