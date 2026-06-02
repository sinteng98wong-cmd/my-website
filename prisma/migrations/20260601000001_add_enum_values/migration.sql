-- Migration 1 of 2: Add new enum values ONLY.
-- These must be committed before they can be used as column defaults
-- (PostgreSQL restriction: new enum values cannot be used in the same transaction).

-- Add DRAFT to DOStatus (before PENDING so it comes first logically)
ALTER TYPE "DOStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'PENDING';

-- Add new PoolStatus values
ALTER TYPE "PoolStatus" ADD VALUE IF NOT EXISTS 'CLOSED' AFTER 'OPEN';
ALTER TYPE "PoolStatus" ADD VALUE IF NOT EXISTS 'REOPENED' AFTER 'CLOSED';
ALTER TYPE "PoolStatus" ADD VALUE IF NOT EXISTS 'DISTRIBUTED' AFTER 'DELIVERED';

-- Create new PoolDeliveryMode enum
DO $$ BEGIN
  CREATE TYPE "PoolDeliveryMode" AS ENUM ('CENTRALISED', 'DIRECT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
