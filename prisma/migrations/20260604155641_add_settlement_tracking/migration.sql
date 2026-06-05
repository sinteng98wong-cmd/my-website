-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "expectedSettlementDate" TIMESTAMP(3),
ADD COLUMN     "settledAmount" DECIMAL(10,2),
ADD COLUMN     "settledDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PaymentMethodConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "subType" TEXT,
    "chargeRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "settlementDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethodConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentMethodConfig_clinicId_idx" ON "PaymentMethodConfig"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethodConfig_clinicId_method_subType_key" ON "PaymentMethodConfig"("clinicId", "method", "subType");

-- CreateIndex
CREATE INDEX "InvoicePayment_expectedSettlementDate_idx" ON "InvoicePayment"("expectedSettlementDate");

-- AddForeignKey
ALTER TABLE "PaymentMethodConfig" ADD CONSTRAINT "PaymentMethodConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
