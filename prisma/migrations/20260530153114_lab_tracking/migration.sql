/*
  Warnings:

  - Added the required column `clinicId` to the `LabJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `LabJob` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LabJob" ADD COLUMN     "clinicId" TEXT NOT NULL,
ADD COLUMN     "expectedDate" TIMESTAMP(3),
ADD COLUMN     "fittedDate" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paidDate" TIMESTAMP(3),
ADD COLUMN     "paidToVendor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receivedDate" TIMESTAMP(3),
ADD COLUMN     "sentDate" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "workDescription" TEXT;

-- AlterTable
ALTER TABLE "LabVendor" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT;

-- AddForeignKey
ALTER TABLE "LabJob" ADD CONSTRAINT "LabJob_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
