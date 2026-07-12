-- CreateTable
CREATE TABLE "PayoutScanRate" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rate" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutScanRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutScanRate_clinicId_idx" ON "PayoutScanRate"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutScanRate_clinicId_code_key" ON "PayoutScanRate"("clinicId", "code");

-- AddForeignKey
ALTER TABLE "PayoutScanRate" ADD CONSTRAINT "PayoutScanRate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
