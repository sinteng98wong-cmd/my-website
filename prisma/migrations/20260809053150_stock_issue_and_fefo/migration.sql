-- CreateEnum
CREATE TYPE "StockIssueReason" AS ENUM ('CLINICAL_CONSUMPTION', 'GENERAL_USAGE', 'DAMAGED', 'WASTAGE', 'EXPIRED', 'OTHER');

-- CreateEnum
CREATE TYPE "StockIssueStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StockIssueSource" AS ENUM ('MANUAL', 'VISIT', 'TREATMENT');

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'WRITE_OFF_WASTAGE';

-- CreateTable
CREATE TABLE "StockIssue" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "status" "StockIssueStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" "StockIssueReason" NOT NULL,
    "notes" TEXT,
    "sourceKind" "StockIssueSource" NOT NULL DEFAULT 'MANUAL',
    "sourceRefId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "postedAt" TIMESTAMP(3),
    "totalQty" INTEGER NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockIssueLine" (
    "id" TEXT NOT NULL,
    "stockIssueId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batchId" TEXT,
    "note" TEXT,
    "unitCost" DECIMAL(12,4),
    "movementId" TEXT,

    CONSTRAINT "StockIssueLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockIssueAllocation" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "batchId" TEXT,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockIssueAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockIssue_reference_key" ON "StockIssue"("reference");

-- CreateIndex
CREATE INDEX "StockIssue_clinicId_status_idx" ON "StockIssue"("clinicId", "status");

-- CreateIndex
CREATE INDEX "StockIssue_createdAt_idx" ON "StockIssue"("createdAt");

-- CreateIndex
CREATE INDEX "StockIssue_sourceKind_sourceRefId_idx" ON "StockIssue"("sourceKind", "sourceRefId");

-- CreateIndex
CREATE INDEX "StockIssueLine_stockIssueId_idx" ON "StockIssueLine"("stockIssueId");

-- CreateIndex
CREATE INDEX "StockIssueLine_itemId_idx" ON "StockIssueLine"("itemId");

-- CreateIndex
CREATE INDEX "StockIssueAllocation_lineId_idx" ON "StockIssueAllocation"("lineId");

-- CreateIndex
CREATE INDEX "StockIssueAllocation_batchId_idx" ON "StockIssueAllocation"("batchId");

-- AddForeignKey
ALTER TABLE "StockIssue" ADD CONSTRAINT "StockIssue_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssue" ADD CONSTRAINT "StockIssue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssue" ADD CONSTRAINT "StockIssue_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssue" ADD CONSTRAINT "StockIssue_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueLine" ADD CONSTRAINT "StockIssueLine_stockIssueId_fkey" FOREIGN KEY ("stockIssueId") REFERENCES "StockIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueLine" ADD CONSTRAINT "StockIssueLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueLine" ADD CONSTRAINT "StockIssueLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueAllocation" ADD CONSTRAINT "StockIssueAllocation_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "StockIssueLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockIssueAllocation" ADD CONSTRAINT "StockIssueAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
