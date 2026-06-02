/*
  Warnings:

  - A unique constraint covering the columns `[salesReturnId]` on the table `PatientDeposit` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "DailyLedger" ADD COLUMN     "salesReturn" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PatientDeposit" ADD COLUMN     "refundCategory" TEXT,
ADD COLUMN     "salesReturnId" TEXT;

-- CreateTable
CREATE TABLE "SalesReturn" (
    "id" TEXT NOT NULL,
    "returnRef" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "originalInvoiceId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturn_returnRef_key" ON "SalesReturn"("returnRef");

-- CreateIndex
CREATE INDEX "SalesReturn_clinicId_idx" ON "SalesReturn"("clinicId");

-- CreateIndex
CREATE INDEX "SalesReturn_patientId_idx" ON "SalesReturn"("patientId");

-- CreateIndex
CREATE INDEX "SalesReturn_originalInvoiceId_idx" ON "SalesReturn"("originalInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientDeposit_salesReturnId_key" ON "PatientDeposit"("salesReturnId");

-- AddForeignKey
ALTER TABLE "PatientDeposit" ADD CONSTRAINT "PatientDeposit_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
