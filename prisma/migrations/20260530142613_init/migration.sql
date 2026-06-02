-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'FINANCE', 'CLINIC_MANAGER', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'STOREKEEPER');

-- CreateEnum
CREATE TYPE "DoctorType" AS ENUM ('LOCUM', 'PERMANENT');

-- CreateEnum
CREATE TYPE "CommissionMethod" AS ENUM ('INDIVIDUAL', 'POOL_DIVIDE');

-- CreateEnum
CREATE TYPE "TierType" AS ENUM ('PROGRESSIVE', 'FLAT');

-- CreateEnum
CREATE TYPE "LabJobStatus" AS ENUM ('ORDERED', 'SENT_TO_LAB', 'RECEIVED', 'FITTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH_CURRENT', 'CASH_NEXT', 'CREDIT_CARD', 'FPX', 'EWALLET', 'ATOME', 'PANEL');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('DRAFT', 'PENDING_LOCK', 'LOCKED', 'REVERSED');

-- CreateEnum
CREATE TYPE "DOStatus" AS ENUM ('PENDING', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'INVOICED');

-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('OPEN', 'SUBMITTED', 'DELIVERED', 'INVOICED');

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "sstRegistered" BOOLEAN NOT NULL DEFAULT false,
    "eInvoiceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "panelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sstOnForeigner" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "isHQ" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanelProvider" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PanelProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserClinic" (
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,

    CONSTRAINT "UserClinic_pkey" PRIMARY KEY ("userId","clinicId")
);

-- CreateTable
CREATE TABLE "DoctorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "DoctorType" NOT NULL,
    "defaultRate" DECIMAL(5,2) NOT NULL,
    "dayRate" DECIMAL(10,2),
    "hourRate" DECIMAL(10,2),
    "rateType" TEXT,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorTreatmentRate" (
    "id" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "treatmentTypeId" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorTreatmentRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocumEngagement" (
    "id" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "sessionsWorked" INTEGER NOT NULL,
    "guaranteedFloor" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocumEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "isFullTime" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "totalWorkDays" INTEGER NOT NULL,
    "attendedDays" DECIMAL(4,1) NOT NULL,
    "mcDays" DECIMAL(3,1) NOT NULL DEFAULT 0,
    "elDays" DECIMAL(3,1) NOT NULL DEFAULT 0,
    "unpaidDays" DECIMAL(3,1) NOT NULL DEFAULT 0,
    "timeSlipDays" DECIMAL(3,1) NOT NULL DEFAULT 0,
    "alDays" DECIMAL(3,1) NOT NULL DEFAULT 0,
    "lateCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "method" "CommissionMethod" NOT NULL DEFAULT 'INDIVIDUAL',
    "tierType" "TierType" NOT NULL DEFAULT 'PROGRESSIVE',
    "forfeitThreshold" INTEGER NOT NULL DEFAULT 5,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionTier" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "roleTarget" TEXT,
    "tierOrder" INTEGER NOT NULL,
    "floorAmount" DECIMAL(10,2) NOT NULL,
    "ceilAmount" DECIMAL(10,2),
    "rate" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "CommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icNumber" TEXT,
    "passportNo" TEXT,
    "isForeigner" BOOLEAN NOT NULL DEFAULT false,
    "homeClinicId" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultPrice" DECIMAL(10,2) NOT NULL,
    "sstApplicable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TreatmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "visitRef" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Treatment" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "treatmentTypeId" TEXT NOT NULL,
    "doctorId" TEXT,
    "billedAmount" DECIMAL(10,2) NOT NULL,
    "collectedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "doctorSplit" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "labFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sst" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "labJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Treatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabJob" (
    "id" TEXT NOT NULL,
    "labJobRef" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "LabJobStatus" NOT NULL DEFAULT 'ORDERED',
    "estimatedFee" DECIMAL(10,2) NOT NULL,
    "invoiceDate" TIMESTAMP(3),
    "invoiceNumber" TEXT,
    "invoiceAmount" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabVendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,

    CONSTRAINT "LabVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceRef" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "sst" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "panelProviderId" TEXT,
    "collectedAt" TIMESTAMP(3),
    "eInvoiceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorCommission" (
    "id" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "txAmount" DECIMAL(10,2) NOT NULL,
    "labFee" DECIMAL(10,2) NOT NULL,
    "doctorSplit" DECIMAL(5,2) NOT NULL,
    "doctorRate" DECIMAL(5,2) NOT NULL,
    "commission" DECIMAL(10,2) NOT NULL,
    "guaranteedFloor" DECIMAL(10,2),
    "finalPayout" DECIMAL(10,2) NOT NULL,
    "isTopUp" BOOLEAN NOT NULL DEFAULT false,
    "status" "CommissionStatus" NOT NULL DEFAULT 'DRAFT',
    "reversalRef" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffCommission" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "totalSales" DECIMAL(10,2) NOT NULL,
    "grossCommission" DECIMAL(10,2) NOT NULL,
    "attendedDays" DECIMAL(4,1) NOT NULL,
    "totalWorkDays" INTEGER NOT NULL,
    "proRatedComm" DECIMAL(10,2) NOT NULL,
    "forfeited" BOOLEAN NOT NULL DEFAULT false,
    "forfeitReason" TEXT,
    "status" "CommissionStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unit',

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicStock" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "parLevel" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" TEXT NOT NULL,
    "doRef" TEXT NOT NULL,
    "fromClinicId" TEXT NOT NULL,
    "toClinicId" TEXT NOT NULL,
    "status" "DOStatus" NOT NULL DEFAULT 'PENDING',
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "stockInvoiceId" TEXT,

    CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DOLine" (
    "id" TEXT NOT NULL,
    "doId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "DOLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockInvoice" (
    "id" TEXT NOT NULL,
    "invoiceRef" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "sst" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "eInvoiceRef" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolOrder" (
    "id" TEXT NOT NULL,
    "poRef" TEXT NOT NULL,
    "initiatingClinicId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "moqTarget" DECIMAL(10,2) NOT NULL,
    "status" "PoolStatus" NOT NULL DEFAULT 'OPEN',
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoolOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolOrderLine" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "totalQty" INTEGER NOT NULL,

    CONSTRAINT "PoolOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolParticipant" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PoolParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyLedger" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "patientCount" INTEGER NOT NULL,
    "professionalFee" DECIMAL(10,2) NOT NULL,
    "productSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sst" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalSales" DECIMAL(10,2) NOT NULL,
    "cashCurrent" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cashNext" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "creditCard" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fpx" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ewallet" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "atome" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "panelCollections" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "nurseId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_userId_key" ON "DoctorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_staffProfileId_month_key" ON "Attendance"("staffProfileId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_patientRef_key" ON "Patient"("patientRef");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentType_code_key" ON "TreatmentType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_visitRef_key" ON "Visit"("visitRef");

-- CreateIndex
CREATE UNIQUE INDEX "LabJob_labJobRef_key" ON "LabJob"("labJobRef");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceRef_key" ON "Invoice"("invoiceRef");

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_sku_key" ON "StockItem"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicStock_clinicId_itemId_key" ON "ClinicStock"("clinicId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_doRef_key" ON "DeliveryOrder"("doRef");

-- CreateIndex
CREATE UNIQUE INDEX "StockInvoice_invoiceRef_key" ON "StockInvoice"("invoiceRef");

-- CreateIndex
CREATE UNIQUE INDEX "PoolOrder_poRef_key" ON "PoolOrder"("poRef");

-- CreateIndex
CREATE UNIQUE INDEX "PoolParticipant_poolId_clinicId_key" ON "PoolParticipant"("poolId", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyLedger_clinicId_date_key" ON "DailyLedger"("clinicId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_clinicId_doctorId_date_startTime_key" ON "Schedule"("clinicId", "doctorId", "date", "startTime");

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelProvider" ADD CONSTRAINT "PanelProvider_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClinic" ADD CONSTRAINT "UserClinic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClinic" ADD CONSTRAINT "UserClinic_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorTreatmentRate" ADD CONSTRAINT "DoctorTreatmentRate_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorTreatmentRate" ADD CONSTRAINT "DoctorTreatmentRate_treatmentTypeId_fkey" FOREIGN KEY ("treatmentTypeId") REFERENCES "TreatmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocumEngagement" ADD CONSTRAINT "LocumEngagement_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionConfig" ADD CONSTRAINT "CommissionConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionTier" ADD CONSTRAINT "CommissionTier_configId_fkey" FOREIGN KEY ("configId") REFERENCES "CommissionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_homeClinicId_fkey" FOREIGN KEY ("homeClinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_treatmentTypeId_fkey" FOREIGN KEY ("treatmentTypeId") REFERENCES "TreatmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_labJobId_fkey" FOREIGN KEY ("labJobId") REFERENCES "LabJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabJob" ADD CONSTRAINT "LabJob_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabJob" ADD CONSTRAINT "LabJob_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "LabVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_panelProviderId_fkey" FOREIGN KEY ("panelProviderId") REFERENCES "PanelProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorCommission" ADD CONSTRAINT "DoctorCommission_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCommission" ADD CONSTRAINT "StaffCommission_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicStock" ADD CONSTRAINT "ClinicStock_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicStock" ADD CONSTRAINT "ClinicStock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_fromClinicId_fkey" FOREIGN KEY ("fromClinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_toClinicId_fkey" FOREIGN KEY ("toClinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_stockInvoiceId_fkey" FOREIGN KEY ("stockInvoiceId") REFERENCES "StockInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DOLine" ADD CONSTRAINT "DOLine_doId_fkey" FOREIGN KEY ("doId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DOLine" ADD CONSTRAINT "DOLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockInvoice" ADD CONSTRAINT "StockInvoice_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolOrder" ADD CONSTRAINT "PoolOrder_initiatingClinicId_fkey" FOREIGN KEY ("initiatingClinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolOrderLine" ADD CONSTRAINT "PoolOrderLine_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "PoolOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolOrderLine" ADD CONSTRAINT "PoolOrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolParticipant" ADD CONSTRAINT "PoolParticipant_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "PoolOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolParticipant" ADD CONSTRAINT "PoolParticipant_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLedger" ADD CONSTRAINT "DailyLedger_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
