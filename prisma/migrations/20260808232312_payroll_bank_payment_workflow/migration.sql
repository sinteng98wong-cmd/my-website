-- CreateEnum
CREATE TYPE "BankPaymentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "lunchOtMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PaySlip" ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "bankPaymentId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "releasedById" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" TEXT;

-- CreateTable
CREATE TABLE "PayrollBankPayment" (
    "id" TEXT NOT NULL,
    "paymentRef" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "status" "BankPaymentStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "bankName" TEXT,
    "accountNo" TEXT,
    "paymentDate" TIMESTAMP(3),
    "fileUrl" TEXT,
    "fileName" TEXT,
    "notes" TEXT,
    "preparedById" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNote" TEXT,
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollBankPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicPayrollConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "firstApproverId" TEXT,
    "secondApproverId" TEXT,
    "headNurseStaffProfileId" TEXT,
    "lunchOtAllowed" BOOLEAN NOT NULL DEFAULT false,
    "lunchOtMaxMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicPayrollConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceMonthSubmission" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "staffCount" INTEGER NOT NULL DEFAULT 0,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceMonthSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollBankPayment_paymentRef_key" ON "PayrollBankPayment"("paymentRef");

-- CreateIndex
CREATE INDEX "PayrollBankPayment_clinicId_status_idx" ON "PayrollBankPayment"("clinicId", "status");

-- CreateIndex
CREATE INDEX "PayrollBankPayment_payrollRunId_idx" ON "PayrollBankPayment"("payrollRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicPayrollConfig_clinicId_key" ON "ClinicPayrollConfig"("clinicId");

-- CreateIndex
CREATE INDEX "ClinicPayrollConfig_headNurseStaffProfileId_idx" ON "ClinicPayrollConfig"("headNurseStaffProfileId");

-- CreateIndex
CREATE INDEX "AttendanceMonthSubmission_month_idx" ON "AttendanceMonthSubmission"("month");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceMonthSubmission_clinicId_month_key" ON "AttendanceMonthSubmission"("clinicId", "month");

-- CreateIndex
CREATE INDEX "PaySlip_bankPaymentId_idx" ON "PaySlip"("bankPaymentId");

-- CreateIndex
CREATE INDEX "PaySlip_status_idx" ON "PaySlip"("status");

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySlip" ADD CONSTRAINT "PaySlip_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySlip" ADD CONSTRAINT "PaySlip_bankPaymentId_fkey" FOREIGN KEY ("bankPaymentId") REFERENCES "PayrollBankPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySlip" ADD CONSTRAINT "PaySlip_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBankPayment" ADD CONSTRAINT "PayrollBankPayment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBankPayment" ADD CONSTRAINT "PayrollBankPayment_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBankPayment" ADD CONSTRAINT "PayrollBankPayment_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBankPayment" ADD CONSTRAINT "PayrollBankPayment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBankPayment" ADD CONSTRAINT "PayrollBankPayment_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicPayrollConfig" ADD CONSTRAINT "ClinicPayrollConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicPayrollConfig" ADD CONSTRAINT "ClinicPayrollConfig_firstApproverId_fkey" FOREIGN KEY ("firstApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicPayrollConfig" ADD CONSTRAINT "ClinicPayrollConfig_secondApproverId_fkey" FOREIGN KEY ("secondApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicPayrollConfig" ADD CONSTRAINT "ClinicPayrollConfig_headNurseStaffProfileId_fkey" FOREIGN KEY ("headNurseStaffProfileId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMonthSubmission" ADD CONSTRAINT "AttendanceMonthSubmission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMonthSubmission" ADD CONSTRAINT "AttendanceMonthSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: the old whole-run "APPROVED" state becomes the HR payroll lock.
UPDATE "PayrollRun" SET "status" = 'LOCKED', "lockedById" = "approvedById", "lockedAt" = "approvedAt"
WHERE "status" = 'APPROVED';

-- Backfill: slips of already-paid runs are settled and were already handed out.
UPDATE "PaySlip" SET "status" = 'RELEASED', "paidAt" = r."paidAt", "releasedAt" = r."paidAt"
FROM "PayrollRun" r WHERE r."id" = "PaySlip"."payrollRunId" AND r."status" = 'PAID';
