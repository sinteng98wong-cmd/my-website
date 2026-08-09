-- CreateTable
CREATE TABLE "DOLineBatch" (
    "id" TEXT NOT NULL,
    "doLineId" TEXT NOT NULL,
    "sourceBatchId" TEXT,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DOLineBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DOLineBatch_doLineId_idx" ON "DOLineBatch"("doLineId");

-- CreateIndex
CREATE INDEX "DOLineBatch_sourceBatchId_idx" ON "DOLineBatch"("sourceBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "StockInvoice_purchaseOrderId_key" ON "StockInvoice"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "DOLineBatch" ADD CONSTRAINT "DOLineBatch_doLineId_fkey" FOREIGN KEY ("doLineId") REFERENCES "DOLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DOLineBatch" ADD CONSTRAINT "DOLineBatch_sourceBatchId_fkey" FOREIGN KEY ("sourceBatchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

