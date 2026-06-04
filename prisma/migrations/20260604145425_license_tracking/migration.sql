-- CreateEnum
CREATE TYPE "LicenseScope" AS ENUM ('CLINIC', 'DOCTOR');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "LicenseType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "scope" "LicenseScope" NOT NULL,
    "issuingBody" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "licenseTypeId" TEXT NOT NULL,
    "scope" "LicenseScope" NOT NULL,
    "clinicId" TEXT,
    "staffProfileId" TEXT,
    "licenseNo" TEXT,
    "issuedDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "documentUrl" TEXT,
    "documentName" TEXT,
    "notes" TEXT,
    "alert90Sent" BOOLEAN NOT NULL DEFAULT false,
    "alert60Sent" BOOLEAN NOT NULL DEFAULT false,
    "alert30Sent" BOOLEAN NOT NULL DEFAULT false,
    "alert7Sent" BOOLEAN NOT NULL DEFAULT false,
    "expiredAlertSent" BOOLEAN NOT NULL DEFAULT false,
    "previousLicenseId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LicenseType_scope_isActive_idx" ON "LicenseType"("scope", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "License_previousLicenseId_key" ON "License"("previousLicenseId");

-- CreateIndex
CREATE INDEX "License_clinicId_status_idx" ON "License"("clinicId", "status");

-- CreateIndex
CREATE INDEX "License_staffProfileId_status_idx" ON "License"("staffProfileId", "status");

-- CreateIndex
CREATE INDEX "License_expiryDate_idx" ON "License"("expiryDate");

-- CreateIndex
CREATE INDEX "License_status_idx" ON "License"("status");

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_licenseTypeId_fkey" FOREIGN KEY ("licenseTypeId") REFERENCES "LicenseType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_previousLicenseId_fkey" FOREIGN KEY ("previousLicenseId") REFERENCES "License"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
