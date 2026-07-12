-- DropForeignKey
ALTER TABLE "LabJob" DROP CONSTRAINT "LabJob_vendorId_fkey";

-- AlterTable
ALTER TABLE "LabJob" ALTER COLUMN "vendorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "LabJob" ADD CONSTRAINT "LabJob_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "LabVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
