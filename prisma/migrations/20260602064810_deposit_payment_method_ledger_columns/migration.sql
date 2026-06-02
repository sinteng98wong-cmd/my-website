-- AlterTable
ALTER TABLE "DailyLedger" ADD COLUMN     "depositRefund" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "depositTopup" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PatientDeposit" ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "reason" TEXT;
