-- CreateEnum
CREATE TYPE "ReconStatus" AS ENUM ('OPEN', 'LOCKED');

-- CreateTable
CREATE TABLE "MonthlyRecon" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "ReconStatus" NOT NULL DEFAULT 'OPEN',
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyRecon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MethodSettlementEntry" (
    "id" TEXT NOT NULL,
    "reconId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "confirmedAmount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MethodSettlementEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanelRemittance" (
    "id" TEXT NOT NULL,
    "reconId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "panelProviderId" TEXT NOT NULL,
    "remittanceRef" TEXT,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanelRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanelRemittanceItem" (
    "id" TEXT NOT NULL,
    "remittanceId" TEXT NOT NULL,
    "invoicePaymentId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(10,2) NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'AUTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PanelRemittanceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyRecon_clinicId_idx" ON "MonthlyRecon"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyRecon_clinicId_month_key" ON "MonthlyRecon"("clinicId", "month");

-- CreateIndex
CREATE INDEX "MethodSettlementEntry_reconId_idx" ON "MethodSettlementEntry"("reconId");

-- CreateIndex
CREATE UNIQUE INDEX "MethodSettlementEntry_reconId_method_key" ON "MethodSettlementEntry"("reconId", "method");

-- CreateIndex
CREATE INDEX "PanelRemittance_reconId_idx" ON "PanelRemittance"("reconId");

-- CreateIndex
CREATE INDEX "PanelRemittance_clinicId_idx" ON "PanelRemittance"("clinicId");

-- CreateIndex
CREATE INDEX "PanelRemittanceItem_invoicePaymentId_idx" ON "PanelRemittanceItem"("invoicePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PanelRemittanceItem_remittanceId_invoicePaymentId_key" ON "PanelRemittanceItem"("remittanceId", "invoicePaymentId");

-- AddForeignKey
ALTER TABLE "MonthlyRecon" ADD CONSTRAINT "MonthlyRecon_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyRecon" ADD CONSTRAINT "MonthlyRecon_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MethodSettlementEntry" ADD CONSTRAINT "MethodSettlementEntry_reconId_fkey" FOREIGN KEY ("reconId") REFERENCES "MonthlyRecon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MethodSettlementEntry" ADD CONSTRAINT "MethodSettlementEntry_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelRemittance" ADD CONSTRAINT "PanelRemittance_reconId_fkey" FOREIGN KEY ("reconId") REFERENCES "MonthlyRecon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelRemittance" ADD CONSTRAINT "PanelRemittance_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelRemittance" ADD CONSTRAINT "PanelRemittance_panelProviderId_fkey" FOREIGN KEY ("panelProviderId") REFERENCES "PanelProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelRemittance" ADD CONSTRAINT "PanelRemittance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelRemittanceItem" ADD CONSTRAINT "PanelRemittanceItem_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "PanelRemittance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelRemittanceItem" ADD CONSTRAINT "PanelRemittanceItem_invoicePaymentId_fkey" FOREIGN KEY ("invoicePaymentId") REFERENCES "InvoicePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
