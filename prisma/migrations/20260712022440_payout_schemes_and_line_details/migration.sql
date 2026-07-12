-- AlterTable
ALTER TABLE "LocumPayoutLine" ADD COLUMN     "subType" TEXT,
ADD COLUMN     "toothCodes" TEXT;

-- CreateTable
CREATE TABLE "PayoutScheme" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT,
    "name" TEXT NOT NULL,
    "matchCodes" TEXT[],
    "subTypes" TEXT[],
    "paymentTracked" BOOLEAN NOT NULL DEFAULT false,
    "stages" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutScheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutScheme_clinicId_idx" ON "PayoutScheme"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutScheme_clinicId_name_key" ON "PayoutScheme"("clinicId", "name");

-- AddForeignKey
ALTER TABLE "PayoutScheme" ADD CONSTRAINT "PayoutScheme_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
