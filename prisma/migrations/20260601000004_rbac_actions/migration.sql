-- Replace boolean `enabled` with JSON `actions` array in RoleModuleConfig
ALTER TABLE "RoleModuleConfig" ADD COLUMN IF NOT EXISTS "actions" TEXT NOT NULL DEFAULT '[]';

-- Migrate existing data: enabled=true becomes a "view-only" placeholder;
-- the seed will repopulate with proper per-role action sets.
UPDATE "RoleModuleConfig" SET "actions" = '["view"]' WHERE "enabled" = true;

-- Drop the old column
ALTER TABLE "RoleModuleConfig" DROP COLUMN IF EXISTS "enabled";

-- Replace boolean `enabled` with JSON `actions` in UserClinicModule
-- The table was just created (migration 003) and is empty, so just swap the column.
ALTER TABLE "UserClinicModule" DROP COLUMN IF EXISTS "enabled";
ALTER TABLE "UserClinicModule" ADD COLUMN IF NOT EXISTS "actions" TEXT NOT NULL DEFAULT '[]';
