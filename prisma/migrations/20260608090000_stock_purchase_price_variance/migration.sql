-- H-5: Purchase Price Variance
--
-- A supplier invoice price correction is split between the inventory still on
-- hand (REVALUATION) and the portion that has already left inventory
-- (PURCHASE_PRICE_VARIANCE), so no part of the correction is silently dropped.
--
-- Value-only movement: quantity is always zero and direction is NONE, matching
-- the existing REVALUATION convention.

ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE_PRICE_VARIANCE';
