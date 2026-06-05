/*
  Warnings:

  - You are about to drop the column `isSstApplicable` on the `PanelProvider` table. All the data in the column will be lost.
  - You are about to drop the column `serviceChargeRate` on the `PanelProvider` table. All the data in the column will be lost.
  - You are about to drop the `AccountingLedgerEntry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AccountingMonthLock` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PaymentMethodConfig` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `Entity` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EInvoiceBatchType" AS ENUM ('CONSOLIDATED', 'PANEL_CONSOLIDATED');

-- CreateEnum
CREATE TYPE "EInvoiceBatchStatus" AS ENUM ('PENDING', 'SUBMITTED', 'VALID', 'PARTIAL', 'INVALID');

-- CreateEnum
CREATE TYPE "PVStatus" AS ENUM ('DRAFT', 'PENDING_DIRECTOR', 'PENDING_PIC', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "SupplierInvoiceType" AS ENUM ('GENERAL', 'LAB', 'MATERIALS', 'INTERBRANCH');

-- DropForeignKey
ALTER TABLE "AccountingLedgerEntry" DROP CONSTRAINT "AccountingLedgerEntry_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "AccountingLedgerEntry" DROP CONSTRAINT "AccountingLedgerEntry_createdById_fkey";

-- DropForeignKey
ALTER TABLE "AccountingLedgerEntry" DROP CONSTRAINT "AccountingLedgerEntry_lockedById_fkey";

-- DropForeignKey
ALTER TABLE "AccountingLedgerEntry" DROP CONSTRAINT "AccountingLedgerEntry_panelProviderId_fkey";

-- DropForeignKey
ALTER TABLE "AccountingLedgerEntry" DROP CONSTRAINT "AccountingLedgerEntry_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "AccountingMonthLock" DROP CONSTRAINT "AccountingMonthLock_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "AccountingMonthLock" DROP CONSTRAINT "AccountingMonthLock_lockedById_fkey";

-- DropForeignKey
ALTER TABLE "PaymentMethodConfig" DROP CONSTRAINT "PaymentMethodConfig_clinicId_fkey";

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankAccountNo" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "directorId" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "picId" TEXT,
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "pvGroupTag" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "Entity" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankAccountNo" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'Malaysia',
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "directorIcNo" TEXT,
ADD COLUMN     "directorName" TEXT,
ADD COLUMN     "eInvoiceEffectiveDate" TIMESTAMP(3),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "financialYearStartMonth" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "incorporationDate" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "myInvoisClientId" TEXT,
ADD COLUMN     "myInvoisClientSecret" TEXT,
ADD COLUMN     "myInvoisEnvironment" TEXT NOT NULL DEFAULT 'SANDBOX',
ADD COLUMN     "name" TEXT,
ADD COLUMN     "oldRegistrationNo" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "pvMode" TEXT NOT NULL DEFAULT 'PER_CLINIC',
ADD COLUMN     "registrationNo" TEXT,
ADD COLUMN     "sstEffectiveDate" TIMESTAMP(3),
ADD COLUMN     "sstFilingFrequency" TEXT NOT NULL DEFAULT 'BI_MONTHLY',
ADD COLUMN     "sstRegistrationNo" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "tin" TEXT,
ADD COLUMN     "tradingName" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "consolidatedBatchId" TEXT,
ADD COLUMN     "eInvoiceCancelReason" TEXT,
ADD COLUMN     "eInvoiceCancelledAt" TIMESTAMP(3),
ADD COLUMN     "eInvoiceLongId" TEXT,
ADD COLUMN     "eInvoiceQrUrl" TEXT,
ADD COLUMN     "eInvoiceStatus" TEXT,
ADD COLUMN     "eInvoiceSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "eInvoiceType" TEXT,
ADD COLUMN     "eInvoiceUUID" TEXT,
ADD COLUMN     "eInvoiceValidatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PanelProvider" DROP COLUMN "isSstApplicable",
DROP COLUMN "serviceChargeRate",
ADD COLUMN     "registrationNo" TEXT,
ADD COLUMN     "tin" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "accountName" TEXT,
ADD COLUMN     "accountNo" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "registrationNo" TEXT;

-- DropTable
DROP TABLE "AccountingLedgerEntry";

-- DropTable
DROP TABLE "AccountingMonthLock";

-- DropTable
DROP TABLE "PaymentMethodConfig";

-- CreateTable
CREATE TABLE "EInvoiceBatch" (
    "id" TEXT NOT NULL,
    "batchRef" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "batchType" "EInvoiceBatchType" NOT NULL,
    "panelProviderId" TEXT,
    "month" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "totalSst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "invoiceCount" INTEGER NOT NULL DEFAULT 0,
    "status" "EInvoiceBatchStatus" NOT NULL DEFAULT 'PENDING',
    "myInvoisUUID" TEXT,
    "myInvoisLongId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "rawRequest" JSONB,
    "rawResponse" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EInvoiceBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EInvoiceCreditNote" (
    "id" TEXT NOT NULL,
    "cnRef" TEXT NOT NULL,
    "originalInvoiceId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "myInvoisUUID" TEXT,
    "myInvoisLongId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "rawRequest" JSONB,
    "rawResponse" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EInvoiceCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EInvoiceDebitNote" (
    "id" TEXT NOT NULL,
    "dnRef" TEXT NOT NULL,
    "originalInvoiceId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "myInvoisUUID" TEXT,
    "myInvoisLongId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "rawRequest" JSONB,
    "rawResponse" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EInvoiceDebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentVoucher" (
    "id" TEXT NOT NULL,
    "pvRef" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "supplierId" TEXT,
    "fromClinicId" TEXT,
    "status" "PVStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "bankName" TEXT,
    "accountNo" TEXT,
    "accountName" TEXT,
    "paymentRef" TEXT,
    "paymentDate" TIMESTAMP(3),
    "notes" TEXT,
    "preparedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "directorId" TEXT,
    "directorApprovedById" TEXT,
    "directorApprovedAt" TIMESTAMP(3),
    "directorNote" TEXT,
    "picId" TEXT,
    "picApprovedById" TEXT,
    "picApprovedAt" TIMESTAMP(3),
    "picNote" TEXT,
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "pvId" TEXT NOT NULL,
    "invoiceType" "SupplierInvoiceType" NOT NULL DEFAULT 'GENERAL',
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "categoryId" TEXT,
    "attachmentUrl" TEXT,
    "attachmentName" TEXT,
    "labJobId" TEXT,
    "stockInvoiceId" TEXT,
    "poolOrderId" TEXT,
    "fromClinicId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EInvoiceBatch_batchRef_key" ON "EInvoiceBatch"("batchRef");

-- CreateIndex
CREATE INDEX "EInvoiceBatch_clinicId_month_idx" ON "EInvoiceBatch"("clinicId", "month");

-- CreateIndex
CREATE INDEX "EInvoiceBatch_entityId_month_idx" ON "EInvoiceBatch"("entityId", "month");

-- CreateIndex
CREATE INDEX "EInvoiceBatch_status_idx" ON "EInvoiceBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EInvoiceCreditNote_cnRef_key" ON "EInvoiceCreditNote"("cnRef");

-- CreateIndex
CREATE INDEX "EInvoiceCreditNote_originalInvoiceId_idx" ON "EInvoiceCreditNote"("originalInvoiceId");

-- CreateIndex
CREATE INDEX "EInvoiceCreditNote_clinicId_idx" ON "EInvoiceCreditNote"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "EInvoiceDebitNote_dnRef_key" ON "EInvoiceDebitNote"("dnRef");

-- CreateIndex
CREATE INDEX "EInvoiceDebitNote_originalInvoiceId_idx" ON "EInvoiceDebitNote"("originalInvoiceId");

-- CreateIndex
CREATE INDEX "EInvoiceDebitNote_clinicId_idx" ON "EInvoiceDebitNote"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "ExpenseCategory_isActive_idx" ON "ExpenseCategory"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentVoucher_pvRef_key" ON "PaymentVoucher"("pvRef");

-- CreateIndex
CREATE INDEX "PaymentVoucher_clinicId_status_idx" ON "PaymentVoucher"("clinicId", "status");

-- CreateIndex
CREATE INDEX "PaymentVoucher_supplierId_idx" ON "PaymentVoucher"("supplierId");

-- CreateIndex
CREATE INDEX "PaymentVoucher_status_idx" ON "PaymentVoucher"("status");

-- CreateIndex
CREATE INDEX "SupplierInvoice_pvId_idx" ON "SupplierInvoice"("pvId");

-- CreateIndex
CREATE INDEX "SupplierInvoice_labJobId_idx" ON "SupplierInvoice"("labJobId");

-- CreateIndex
CREATE INDEX "SupplierInvoice_stockInvoiceId_idx" ON "SupplierInvoice"("stockInvoiceId");

-- CreateIndex
CREATE INDEX "Clinic_entityId_idx" ON "Clinic"("entityId");

-- CreateIndex
CREATE INDEX "Entity_isActive_idx" ON "Entity"("isActive");

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_picId_fkey" FOREIGN KEY ("picId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_consolidatedBatchId_fkey" FOREIGN KEY ("consolidatedBatchId") REFERENCES "EInvoiceBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceBatch" ADD CONSTRAINT "EInvoiceBatch_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceBatch" ADD CONSTRAINT "EInvoiceBatch_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceBatch" ADD CONSTRAINT "EInvoiceBatch_panelProviderId_fkey" FOREIGN KEY ("panelProviderId") REFERENCES "PanelProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceBatch" ADD CONSTRAINT "EInvoiceBatch_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceCreditNote" ADD CONSTRAINT "EInvoiceCreditNote_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceCreditNote" ADD CONSTRAINT "EInvoiceCreditNote_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceCreditNote" ADD CONSTRAINT "EInvoiceCreditNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceDebitNote" ADD CONSTRAINT "EInvoiceDebitNote_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceDebitNote" ADD CONSTRAINT "EInvoiceDebitNote_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceDebitNote" ADD CONSTRAINT "EInvoiceDebitNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucher" ADD CONSTRAINT "PaymentVoucher_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucher" ADD CONSTRAINT "PaymentVoucher_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucher" ADD CONSTRAINT "PaymentVoucher_fromClinicId_fkey" FOREIGN KEY ("fromClinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucher" ADD CONSTRAINT "PaymentVoucher_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucher" ADD CONSTRAINT "PaymentVoucher_directorApprovedById_fkey" FOREIGN KEY ("directorApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucher" ADD CONSTRAINT "PaymentVoucher_picApprovedById_fkey" FOREIGN KEY ("picApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucher" ADD CONSTRAINT "PaymentVoucher_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentVoucher" ADD CONSTRAINT "PaymentVoucher_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_pvId_fkey" FOREIGN KEY ("pvId") REFERENCES "PaymentVoucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_labJobId_fkey" FOREIGN KEY ("labJobId") REFERENCES "LabJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_stockInvoiceId_fkey" FOREIGN KEY ("stockInvoiceId") REFERENCES "StockInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_poolOrderId_fkey" FOREIGN KEY ("poolOrderId") REFERENCES "PoolOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_fromClinicId_fkey" FOREIGN KEY ("fromClinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
