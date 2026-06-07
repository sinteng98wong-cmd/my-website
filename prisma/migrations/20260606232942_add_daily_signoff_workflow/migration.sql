-- AlterTable
ALTER TABLE "LocumReconciliationStatement" ADD COLUMN     "cmApprovedAt" TIMESTAMP(3),
ADD COLUMN     "cmApprovedBy" TEXT,
ADD COLUMN     "doctorSignedAt" TIMESTAMP(3),
ADD COLUMN     "financeApprovedAt" TIMESTAMP(3),
ADD COLUMN     "financeApprovedBy" TEXT;

-- CreateTable
CREATE TABLE "DoctorDailySignoff" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "treatmentSnapshot" JSONB NOT NULL,

    CONSTRAINT "DoctorDailySignoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoctorDailySignoff_doctorId_idx" ON "DoctorDailySignoff"("doctorId");

-- CreateIndex
CREATE INDEX "DoctorDailySignoff_date_idx" ON "DoctorDailySignoff"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorDailySignoff_doctorId_clinicId_date_key" ON "DoctorDailySignoff"("doctorId", "clinicId", "date");

-- AddForeignKey
ALTER TABLE "DoctorDailySignoff" ADD CONSTRAINT "DoctorDailySignoff_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorDailySignoff" ADD CONSTRAINT "DoctorDailySignoff_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
