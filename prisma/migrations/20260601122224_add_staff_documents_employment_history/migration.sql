/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Clinic` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[employeeId]` on the table `StaffProfile` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReferralType" AS ENUM ('PATIENT', 'INTERNAL_DOCTOR', 'INTERNAL_CLINIC', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ReferralCommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "ReferralCommissionType" AS ENUM ('FLAT', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "InvoiceSource" AS ENUM ('INTERNAL', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'PARTIAL', 'RECEIVED', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'LOCUM', 'INTERN');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'PROBATION', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED');

-- CreateEnum
CREATE TYPE "HrLeaveType" AS ENUM ('ANNUAL', 'MEDICAL', 'EMERGENCY', 'MATERNITY', 'PATERNITY', 'UNPAID', 'REPLACEMENT', 'HOSPITALISATION', 'COMPASSIONATE');

-- CreateEnum
CREATE TYPE "HrLeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('MORNING', 'EVENING', 'NIGHT', 'FULL_DAY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'PUBLIC_HOLIDAY', 'OFF_DAY', 'REMOTE');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('MEDICAL', 'TRANSPORT', 'MEAL', 'ACCOMMODATION', 'TRAINING', 'UNIFORM', 'TELEPHONE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "AppraisalStatus" AS ENUM ('DRAFT', 'SELF_REVIEW', 'MANAGER_REVIEW', 'COMPLETED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "DisciplinaryType" AS ENUM ('VERBAL_WARNING', 'WRITTEN_WARNING', 'SHOW_CAUSE', 'SUSPENSION', 'DEMOTION', 'TERMINATION');

-- CreateEnum
CREATE TYPE "DisciplinaryStatus" AS ENUM ('OPEN', 'RESPONDED', 'RESOLVED', 'APPEALED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KpiStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- DropIndex
DROP INDEX "ToothRecord_patientId_toothCode_key";

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "ClinicStock" ADD COLUMN     "avgUnitCost" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "DOLine" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DailyLedger" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DeliveryOrder" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "deletedReason" TEXT,
ADD COLUMN     "externalReferrerEmail" TEXT,
ADD COLUMN     "externalReferrerName" TEXT,
ADD COLUMN     "externalReferrerPhone" TEXT,
ADD COLUMN     "externalReferrerType" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "medicalNotes" TEXT,
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "referralType" "ReferralType",
ADD COLUMN     "referredByClinicId" TEXT,
ADD COLUMN     "referredByDoctorId" TEXT,
ADD COLUMN     "referredByPatientId" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "status" "PatientStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "PoolOrder" ADD COLUMN     "supplierId" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PoolOrderLine" ADD COLUMN     "actualUnitCost" DECIMAL(10,2),
ADD COLUMN     "totalReceived" INTEGER,
ALTER COLUMN "unitCost" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bankAccountNo" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "basicSalary" DECIMAL(10,2),
ADD COLUMN     "city" TEXT,
ADD COLUMN     "confirmationDate" TIMESTAMP(3),
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "department" TEXT,
ADD COLUMN     "emergencyName" TEXT,
ADD COLUMN     "emergencyPhone" TEXT,
ADD COLUMN     "emergencyRelation" TEXT,
ADD COLUMN     "employeeId" TEXT,
ADD COLUMN     "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'PROBATION',
ADD COLUMN     "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
ADD COLUMN     "epfNo" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "icNo" TEXT,
ADD COLUMN     "incomeTaxNo" TEXT,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "joinDate" TIMESTAMP(3),
ADD COLUMN     "lastWorkingDate" TIMESTAMP(3),
ADD COLUMN     "noticePeriodDays" INTEGER,
ADD COLUMN     "passportNo" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "resignationDate" TIMESTAMP(3),
ADD COLUMN     "socsoNo" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "StockInvoice" ADD COLUMN     "purchaseOrderId" TEXT,
ADD COLUMN     "source" "InvoiceSource" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "UserClinicModule" ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "actions" DROP DEFAULT;

-- CreateTable
CREATE TABLE "PatientSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCommission" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "referralType" "ReferralType" NOT NULL,
    "doctorId" TEXT,
    "clinicId" TEXT,
    "externalName" TEXT,
    "externalPhone" TEXT,
    "externalEmail" TEXT,
    "commissionType" "ReferralCommissionType" NOT NULL,
    "rate" DECIMAL(10,2) NOT NULL,
    "basedOnInvoiceId" TEXT,
    "calculatedAmount" DECIMAL(10,2) NOT NULL,
    "status" "ReferralCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paymentRef" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCommissionConfig" (
    "id" TEXT NOT NULL,
    "referralType" "ReferralType" NOT NULL,
    "commissionType" "ReferralCommissionType" NOT NULL,
    "rate" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralCommissionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "StockCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "supplierId" TEXT,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL,
    "remainingQty" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "doLineId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poRef" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "POStatus" NOT NULL DEFAULT 'DRAFT',
    "expectedDate" TIMESTAMP(3),
    "notes" TEXT,
    "raisedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POLine" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "receivedQty" INTEGER,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "POLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftTemplate" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMins" INTEGER NOT NULL DEFAULT 30,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSchedule" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "shiftTemplateId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "isOff" BOOLEAN NOT NULL DEFAULT false,
    "isPublicHoliday" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DentistNursePairing" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "dentistProfileId" TEXT NOT NULL,
    "nurseProfileId" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "shiftTemplateId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DentistNursePairing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "leaveType" "HrLeaveType" NOT NULL,
    "entitled" DECIMAL(5,1) NOT NULL,
    "taken" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "pending" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "balance" DECIMAL(5,1) NOT NULL,
    "carriedOver" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "forfeited" DECIMAL(5,1) NOT NULL DEFAULT 0,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveApplication" (
    "id" TEXT NOT NULL,
    "leaveRef" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "leaveType" "HrLeaveType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" DECIMAL(5,1) NOT NULL,
    "reason" TEXT,
    "attachmentUrl" TEXT,
    "status" "HrLeaveStatus" NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,

    CONSTRAINT "LeaveApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveCoverRequest" (
    "id" TEXT NOT NULL,
    "leaveApplicationId" TEXT NOT NULL,
    "requestedStaffId" TEXT NOT NULL,
    "offeredByStaffId" TEXT,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveCoverRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "lateMinutes" INTEGER,
    "overtimeMinutes" INTEGER,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffClaim" (
    "id" TEXT NOT NULL,
    "claimRef" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "claimType" "ClaimType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "receiptUrl" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role",
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiMetric" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "target" DECIMAL(10,2),
    "weight" DECIMAL(5,2) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "KpiMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffKpi" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "KpiStatus" NOT NULL DEFAULT 'DRAFT',
    "overallScore" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffKpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiResult" (
    "id" TEXT NOT NULL,
    "staffKpiId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "actual" DECIMAL(10,2),
    "score" DECIMAL(5,2),
    "notes" TEXT,

    CONSTRAINT "KpiResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appraisal" (
    "id" TEXT NOT NULL,
    "appraisalRef" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "AppraisalStatus" NOT NULL DEFAULT 'DRAFT',
    "selfRating" DECIMAL(3,1),
    "selfComments" TEXT,
    "managerRating" DECIMAL(3,1),
    "managerComments" TEXT,
    "finalRating" DECIMAL(3,1),
    "strengths" TEXT,
    "improvements" TEXT,
    "goals" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appraisal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disciplinary" (
    "id" TEXT NOT NULL,
    "discRef" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "type" "DisciplinaryType" NOT NULL,
    "status" "DisciplinaryStatus" NOT NULL DEFAULT 'OPEN',
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "incidentDesc" TEXT NOT NULL,
    "actionTaken" TEXT,
    "staffResponse" TEXT,
    "responseDeadline" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "attachmentUrls" TEXT[],
    "isConfidential" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Disciplinary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Training" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "provider" TEXT,
    "type" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "cost" DECIMAL(10,2),
    "maxSlots" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffTraining" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'PLANNED',
    "completedAt" TIMESTAMP(3),
    "score" DECIMAL(5,2),
    "certificateUrl" TEXT,
    "notes" TEXT,

    CONSTRAINT "StaffTraining_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalGross" DECIMAL(12,2) NOT NULL,
    "totalNet" DECIMAL(12,2) NOT NULL,
    "totalEpf" DECIMAL(12,2) NOT NULL,
    "totalSocso" DECIMAL(12,2) NOT NULL,
    "totalTax" DECIMAL(12,2) NOT NULL,
    "runById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaySlip" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "basicSalary" DECIMAL(10,2) NOT NULL,
    "allowances" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "overtime" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "claims" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "grossSalary" DECIMAL(10,2) NOT NULL,
    "epfEmployee" DECIMAL(10,2) NOT NULL,
    "epfEmployer" DECIMAL(10,2) NOT NULL,
    "socsoEmployee" DECIMAL(10,2) NOT NULL,
    "socsoEmployer" DECIMAL(10,2) NOT NULL,
    "eisEmployee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "eisEmployer" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "incomeTax" DECIMAL(10,2) NOT NULL,
    "unpaidLeaveDeduction" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(10,2) NOT NULL,
    "daysWorked" INTEGER NOT NULL,
    "daysAbsent" INTEGER NOT NULL,
    "daysLeave" INTEGER NOT NULL,
    "daysPublicHoliday" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "slipUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaySlip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimLimit" (
    "id" TEXT NOT NULL,
    "claimType" "ClaimType" NOT NULL,
    "limitAmount" DECIMAL(10,2) NOT NULL,
    "period" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ClaimLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffDocument" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "expiryDate" TIMESTAMP(3),
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentHistory" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "EmploymentStatus" NOT NULL,
    "toStatus" "EmploymentStatus" NOT NULL,
    "reason" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmploymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicStaffMinimum" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "minCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ClinicStaffMinimum_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientSource_isActive_idx" ON "PatientSource"("isActive");

-- CreateIndex
CREATE INDEX "ReferralCommission_status_idx" ON "ReferralCommission"("status");

-- CreateIndex
CREATE INDEX "ReferralCommission_doctorId_idx" ON "ReferralCommission"("doctorId");

-- CreateIndex
CREATE INDEX "ReferralCommission_clinicId_idx" ON "ReferralCommission"("clinicId");

-- CreateIndex
CREATE INDEX "ReferralCommission_patientId_idx" ON "ReferralCommission"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCommissionConfig_referralType_key" ON "ReferralCommissionConfig"("referralType");

-- CreateIndex
CREATE UNIQUE INDEX "StockCategory_name_parentId_key" ON "StockCategory"("name", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE INDEX "StockBatch_clinicId_itemId_idx" ON "StockBatch"("clinicId", "itemId");

-- CreateIndex
CREATE INDEX "StockBatch_expiryDate_idx" ON "StockBatch"("expiryDate");

-- CreateIndex
CREATE INDEX "StockBatch_clinicId_expiryDate_idx" ON "StockBatch"("clinicId", "expiryDate");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_paidAt_idx" ON "SupplierPayment"("supplierId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poRef_key" ON "PurchaseOrder"("poRef");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_status_idx" ON "PurchaseOrder"("supplierId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_clinicId_status_idx" ON "PurchaseOrder"("clinicId", "status");

-- CreateIndex
CREATE INDEX "POLine_poId_idx" ON "POLine"("poId");

-- CreateIndex
CREATE INDEX "ShiftTemplate_clinicId_isActive_idx" ON "ShiftTemplate"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "StaffSchedule_clinicId_date_idx" ON "StaffSchedule"("clinicId", "date");

-- CreateIndex
CREATE INDEX "StaffSchedule_staffProfileId_date_idx" ON "StaffSchedule"("staffProfileId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSchedule_staffProfileId_clinicId_date_key" ON "StaffSchedule"("staffProfileId", "clinicId", "date");

-- CreateIndex
CREATE INDEX "DentistNursePairing_clinicId_date_idx" ON "DentistNursePairing"("clinicId", "date");

-- CreateIndex
CREATE INDEX "DentistNursePairing_dentistProfileId_idx" ON "DentistNursePairing"("dentistProfileId");

-- CreateIndex
CREATE INDEX "DentistNursePairing_nurseProfileId_idx" ON "DentistNursePairing"("nurseProfileId");

-- CreateIndex
CREATE INDEX "LeaveBalance_staffProfileId_year_idx" ON "LeaveBalance"("staffProfileId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_staffProfileId_year_leaveType_key" ON "LeaveBalance"("staffProfileId", "year", "leaveType");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveApplication_leaveRef_key" ON "LeaveApplication"("leaveRef");

-- CreateIndex
CREATE INDEX "LeaveApplication_staffProfileId_status_idx" ON "LeaveApplication"("staffProfileId", "status");

-- CreateIndex
CREATE INDEX "LeaveApplication_clinicId_startDate_endDate_idx" ON "LeaveApplication"("clinicId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "LeaveApplication_status_idx" ON "LeaveApplication"("status");

-- CreateIndex
CREATE INDEX "LeaveCoverRequest_leaveApplicationId_idx" ON "LeaveCoverRequest"("leaveApplicationId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_clinicId_date_idx" ON "AttendanceRecord"("clinicId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_staffProfileId_date_idx" ON "AttendanceRecord"("staffProfileId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_staffProfileId_date_key" ON "AttendanceRecord"("staffProfileId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StaffClaim_claimRef_key" ON "StaffClaim"("claimRef");

-- CreateIndex
CREATE INDEX "StaffClaim_staffProfileId_status_idx" ON "StaffClaim"("staffProfileId", "status");

-- CreateIndex
CREATE INDEX "StaffClaim_clinicId_status_idx" ON "StaffClaim"("clinicId", "status");

-- CreateIndex
CREATE INDEX "StaffClaim_claimType_idx" ON "StaffClaim"("claimType");

-- CreateIndex
CREATE INDEX "KpiMetric_templateId_idx" ON "KpiMetric"("templateId");

-- CreateIndex
CREATE INDEX "StaffKpi_staffProfileId_period_idx" ON "StaffKpi"("staffProfileId", "period");

-- CreateIndex
CREATE INDEX "KpiResult_staffKpiId_idx" ON "KpiResult"("staffKpiId");

-- CreateIndex
CREATE UNIQUE INDEX "Appraisal_appraisalRef_key" ON "Appraisal"("appraisalRef");

-- CreateIndex
CREATE INDEX "Appraisal_staffProfileId_idx" ON "Appraisal"("staffProfileId");

-- CreateIndex
CREATE INDEX "Appraisal_status_idx" ON "Appraisal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Disciplinary_discRef_key" ON "Disciplinary"("discRef");

-- CreateIndex
CREATE INDEX "Disciplinary_staffProfileId_idx" ON "Disciplinary"("staffProfileId");

-- CreateIndex
CREATE INDEX "Disciplinary_status_idx" ON "Disciplinary"("status");

-- CreateIndex
CREATE INDEX "StaffTraining_staffProfileId_idx" ON "StaffTraining"("staffProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffTraining_staffProfileId_trainingId_key" ON "StaffTraining"("staffProfileId", "trainingId");

-- CreateIndex
CREATE INDEX "PayrollRun_month_idx" ON "PayrollRun"("month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_clinicId_month_key" ON "PayrollRun"("clinicId", "month");

-- CreateIndex
CREATE INDEX "PaySlip_payrollRunId_idx" ON "PaySlip"("payrollRunId");

-- CreateIndex
CREATE INDEX "PaySlip_staffProfileId_idx" ON "PaySlip"("staffProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimLimit_claimType_key" ON "ClaimLimit"("claimType");

-- CreateIndex
CREATE INDEX "StaffDocument_staffProfileId_idx" ON "StaffDocument"("staffProfileId");

-- CreateIndex
CREATE INDEX "EmploymentHistory_staffProfileId_idx" ON "EmploymentHistory"("staffProfileId");

-- CreateIndex
CREATE INDEX "ClinicStaffMinimum_clinicId_idx" ON "ClinicStaffMinimum"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicStaffMinimum_clinicId_role_key" ON "ClinicStaffMinimum"("clinicId", "role");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_startTime_idx" ON "Appointment"("clinicId", "startTime");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_startTime_idx" ON "Appointment"("doctorId", "startTime");

-- CreateIndex
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "CashBanking_clinicId_bankInDate_idx" ON "CashBanking"("clinicId", "bankInDate");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_slug_key" ON "Clinic"("slug");

-- CreateIndex
CREATE INDEX "ClinicStock_clinicId_quantity_idx" ON "ClinicStock"("clinicId", "quantity");

-- CreateIndex
CREATE INDEX "DailyLedger_date_idx" ON "DailyLedger"("date");

-- CreateIndex
CREATE INDEX "DoctorCommission_doctorId_month_idx" ON "DoctorCommission"("doctorId", "month");

-- CreateIndex
CREATE INDEX "DoctorCommission_status_idx" ON "DoctorCommission"("status");

-- CreateIndex
CREATE INDEX "DoctorCommission_month_idx" ON "DoctorCommission"("month");

-- CreateIndex
CREATE INDEX "Invoice_visitId_idx" ON "Invoice"("visitId");

-- CreateIndex
CREATE INDEX "InvoicePayment_invoiceId_idx" ON "InvoicePayment"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoicePayment_method_idx" ON "InvoicePayment"("method");

-- CreateIndex
CREATE INDEX "LabJob_clinicId_status_idx" ON "LabJob"("clinicId", "status");

-- CreateIndex
CREATE INDEX "LabJob_vendorId_idx" ON "LabJob"("vendorId");

-- CreateIndex
CREATE INDEX "Patient_status_idx" ON "Patient"("status");

-- CreateIndex
CREATE INDEX "Patient_sourceId_idx" ON "Patient"("sourceId");

-- CreateIndex
CREATE INDEX "Patient_referralType_idx" ON "Patient"("referralType");

-- CreateIndex
CREATE INDEX "Patient_referredByDoctorId_idx" ON "Patient"("referredByDoctorId");

-- CreateIndex
CREATE INDEX "Patient_referredByClinicId_idx" ON "Patient"("referredByClinicId");

-- CreateIndex
CREATE INDEX "Patient_referredByPatientId_idx" ON "Patient"("referredByPatientId");

-- CreateIndex
CREATE INDEX "Schedule_clinicId_date_idx" ON "Schedule"("clinicId", "date");

-- CreateIndex
CREATE INDEX "Schedule_doctorId_date_idx" ON "Schedule"("doctorId", "date");

-- CreateIndex
CREATE INDEX "StaffCommission_staffProfileId_month_idx" ON "StaffCommission"("staffProfileId", "month");

-- CreateIndex
CREATE INDEX "StaffCommission_status_idx" ON "StaffCommission"("status");

-- CreateIndex
CREATE INDEX "StaffLeave_clinicId_status_idx" ON "StaffLeave"("clinicId", "status");

-- CreateIndex
CREATE INDEX "StaffLeave_staffId_idx" ON "StaffLeave"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_employeeId_key" ON "StaffProfile"("employeeId");

-- CreateIndex
CREATE INDEX "StockInvoice_month_idx" ON "StockInvoice"("month");

-- CreateIndex
CREATE INDEX "StockInvoice_supplierId_idx" ON "StockInvoice"("supplierId");

-- CreateIndex
CREATE INDEX "Treatment_visitId_idx" ON "Treatment"("visitId");

-- CreateIndex
CREATE INDEX "Treatment_doctorId_idx" ON "Treatment"("doctorId");

-- CreateIndex
CREATE INDEX "Visit_clinicId_visitDate_idx" ON "Visit"("clinicId", "visitDate");

-- CreateIndex
CREATE INDEX "Visit_patientId_idx" ON "Visit"("patientId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PatientSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_referredByPatientId_fkey" FOREIGN KEY ("referredByPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_referredByDoctorId_fkey" FOREIGN KEY ("referredByDoctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_referredByClinicId_fkey" FOREIGN KEY ("referredByClinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabVendor" ADD CONSTRAINT "LabVendor_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_basedOnInvoiceId_fkey" FOREIGN KEY ("basedOnInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCategory" ADD CONSTRAINT "StockCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StockCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StockCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockInvoice" ADD CONSTRAINT "StockInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockInvoice" ADD CONSTRAINT "StockInvoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolOrder" ADD CONSTRAINT "PoolOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POLine" ADD CONSTRAINT "POLine_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POLine" ADD CONSTRAINT "POLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftTemplate" ADD CONSTRAINT "ShiftTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSchedule" ADD CONSTRAINT "StaffSchedule_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSchedule" ADD CONSTRAINT "StaffSchedule_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSchedule" ADD CONSTRAINT "StaffSchedule_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentistNursePairing" ADD CONSTRAINT "DentistNursePairing_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentistNursePairing" ADD CONSTRAINT "DentistNursePairing_dentistProfileId_fkey" FOREIGN KEY ("dentistProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentistNursePairing" ADD CONSTRAINT "DentistNursePairing_nurseProfileId_fkey" FOREIGN KEY ("nurseProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApplication" ADD CONSTRAINT "LeaveApplication_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApplication" ADD CONSTRAINT "LeaveApplication_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApplication" ADD CONSTRAINT "LeaveApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveCoverRequest" ADD CONSTRAINT "LeaveCoverRequest_leaveApplicationId_fkey" FOREIGN KEY ("leaveApplicationId") REFERENCES "LeaveApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveCoverRequest" ADD CONSTRAINT "LeaveCoverRequest_requestedStaffId_fkey" FOREIGN KEY ("requestedStaffId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveCoverRequest" ADD CONSTRAINT "LeaveCoverRequest_offeredByStaffId_fkey" FOREIGN KEY ("offeredByStaffId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClaim" ADD CONSTRAINT "StaffClaim_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClaim" ADD CONSTRAINT "StaffClaim_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClaim" ADD CONSTRAINT "StaffClaim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiMetric" ADD CONSTRAINT "KpiMetric_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KpiTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffKpi" ADD CONSTRAINT "StaffKpi_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffKpi" ADD CONSTRAINT "StaffKpi_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KpiTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiResult" ADD CONSTRAINT "KpiResult_staffKpiId_fkey" FOREIGN KEY ("staffKpiId") REFERENCES "StaffKpi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiResult" ADD CONSTRAINT "KpiResult_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "KpiMetric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disciplinary" ADD CONSTRAINT "Disciplinary_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disciplinary" ADD CONSTRAINT "Disciplinary_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disciplinary" ADD CONSTRAINT "Disciplinary_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disciplinary" ADD CONSTRAINT "Disciplinary_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTraining" ADD CONSTRAINT "StaffTraining_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTraining" ADD CONSTRAINT "StaffTraining_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_runById_fkey" FOREIGN KEY ("runById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySlip" ADD CONSTRAINT "PaySlip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaySlip" ADD CONSTRAINT "PaySlip_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDocument" ADD CONSTRAINT "StaffDocument_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDocument" ADD CONSTRAINT "StaffDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicStaffMinimum" ADD CONSTRAINT "ClinicStaffMinimum_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
