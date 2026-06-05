/*
  Warnings:

  - A unique constraint covering the columns `[treatmentId,doctorId]` on the table `DoctorCommission` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "PanelProvider" ADD COLUMN     "isSstApplicable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceChargeRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

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

-- CreateTable
CREATE TABLE "AccountingLedgerEntry" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "subType" TEXT,
    "panelProviderId" TEXT,
    "invoiceMonth" TEXT NOT NULL,
    "settlementMonth" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "sstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "serviceCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netReceived" DECIMAL(12,2) NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingMonthLock" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedById" TEXT NOT NULL,

    CONSTRAINT "AccountingMonthLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentMethodConfig_clinicId_idx" ON "PaymentMethodConfig"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethodConfig_clinicId_method_subType_key" ON "PaymentMethodConfig"("clinicId", "method", "subType");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingLedgerEntry_ref_key" ON "AccountingLedgerEntry"("ref");

-- CreateIndex
CREATE INDEX "AccountingLedgerEntry_clinicId_settlementMonth_idx" ON "AccountingLedgerEntry"("clinicId", "settlementMonth");

-- CreateIndex
CREATE INDEX "AccountingLedgerEntry_clinicId_invoiceMonth_idx" ON "AccountingLedgerEntry"("clinicId", "invoiceMonth");

-- CreateIndex
CREATE INDEX "AccountingLedgerEntry_tag_idx" ON "AccountingLedgerEntry"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingMonthLock_clinicId_month_key" ON "AccountingMonthLock"("clinicId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorCommission_treatmentId_doctorId_key" ON "DoctorCommission"("treatmentId", "doctorId");

-- AddForeignKey
ALTER TABLE "PaymentMethodConfig" ADD CONSTRAINT "PaymentMethodConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingLedgerEntry" ADD CONSTRAINT "AccountingLedgerEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingLedgerEntry" ADD CONSTRAINT "AccountingLedgerEntry_panelProviderId_fkey" FOREIGN KEY ("panelProviderId") REFERENCES "PanelProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingLedgerEntry" ADD CONSTRAINT "AccountingLedgerEntry_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingLedgerEntry" ADD CONSTRAINT "AccountingLedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingLedgerEntry" ADD CONSTRAINT "AccountingLedgerEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingMonthLock" ADD CONSTRAINT "AccountingMonthLock_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingMonthLock" ADD CONSTRAINT "AccountingMonthLock_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
