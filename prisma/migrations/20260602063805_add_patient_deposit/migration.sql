-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'DEPOSIT';

-- CreateTable
CREATE TABLE "PatientDeposit" (
    "id" TEXT NOT NULL,
    "depositRef" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "type" TEXT NOT NULL,
    "invoiceId" TEXT,
    "visitId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientDeposit_depositRef_key" ON "PatientDeposit"("depositRef");

-- CreateIndex
CREATE INDEX "PatientDeposit_patientId_idx" ON "PatientDeposit"("patientId");

-- CreateIndex
CREATE INDEX "PatientDeposit_clinicId_idx" ON "PatientDeposit"("clinicId");

-- AddForeignKey
ALTER TABLE "PatientDeposit" ADD CONSTRAINT "PatientDeposit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDeposit" ADD CONSTRAINT "PatientDeposit_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDeposit" ADD CONSTRAINT "PatientDeposit_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDeposit" ADD CONSTRAINT "PatientDeposit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
