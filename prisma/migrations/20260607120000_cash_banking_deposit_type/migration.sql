-- Add depositType to CashBanking (ONLINE_TRANSFER | CASH_DEPOSIT_MACHINE)
ALTER TABLE "CashBanking" ADD COLUMN "depositType" TEXT NOT NULL DEFAULT 'ONLINE_TRANSFER';

-- Remove free-text bankName — bank info is now sourced from the Clinic record
ALTER TABLE "CashBanking" DROP COLUMN IF EXISTS "bankName";
