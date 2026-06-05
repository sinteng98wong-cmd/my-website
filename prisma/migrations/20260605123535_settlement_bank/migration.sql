-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "settlementBankId" TEXT;

-- CreateTable
CREATE TABLE "SettlementBank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settlementDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementBank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SettlementBank_isActive_idx" ON "SettlementBank"("isActive");

-- CreateIndex
CREATE INDEX "InvoicePayment_settlementBankId_idx" ON "InvoicePayment"("settlementBankId");

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_settlementBankId_fkey" FOREIGN KEY ("settlementBankId") REFERENCES "SettlementBank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
