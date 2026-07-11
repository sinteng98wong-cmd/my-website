-- CreateEnum
CREATE TYPE "LocumPayoutStatus" AS ENUM ('ENTITLED', 'LOCKED_PENDING_COMPLETION', 'PENDING_RELEASE', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "LocumTreatmentCategory" AS ENUM ('ONE_OFF', 'MULTI_STAGE', 'ORTHO_BONDING', 'ORTHO_DEBONDING', 'ALIGNER');

-- CreateTable
CREATE TABLE "LocumPayoutLine" (
    "id" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "category" "LocumTreatmentCategory" NOT NULL,
    "billedAmount" DECIMAL(10,2) NOT NULL,
    "collectedAmount" DECIMAL(10,2) NOT NULL,
    "labFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "labFeeConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sst" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "doctorSplit" DECIMAL(5,2) NOT NULL,
    "netPool" DECIMAL(10,2) NOT NULL,
    "entitledAmount" DECIMAL(10,2) NOT NULL,
    "releasedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "orthoPaymentTrackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "LocumPayoutStatus" NOT NULL DEFAULT 'ENTITLED',
    "forceReleasedBy" TEXT,
    "forceReleasedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "counterVerifiedAt" TIMESTAMP(3),
    "counterVerifiedBy" TEXT,
    "doctorVerifiedAt" TIMESTAMP(3),
    "doctorVerifiedBy" TEXT,
    "labFeeLoggedAt" TIMESTAMP(3),
    "labFeeLoggedBy" TEXT,
    "completionMarkedAt" TIMESTAMP(3),
    "completionMarkedBy" TEXT,
    "pendingReleaseAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "treatmentPlanId" TEXT,
    "treatmentStageId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocumPayoutLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocumPayoutLine_doctorProfileId_month_idx" ON "LocumPayoutLine"("doctorProfileId", "month");

-- CreateIndex
CREATE INDEX "LocumPayoutLine_status_idx" ON "LocumPayoutLine"("status");

-- CreateIndex
CREATE INDEX "LocumPayoutLine_clinicId_month_idx" ON "LocumPayoutLine"("clinicId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "LocumPayoutLine_treatmentId_doctorProfileId_key" ON "LocumPayoutLine"("treatmentId", "doctorProfileId");

-- AddForeignKey
ALTER TABLE "LocumPayoutLine" ADD CONSTRAINT "LocumPayoutLine_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocumPayoutLine" ADD CONSTRAINT "LocumPayoutLine_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocumPayoutLine" ADD CONSTRAINT "LocumPayoutLine_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocumPayoutLine" ADD CONSTRAINT "LocumPayoutLine_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "TreatmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
