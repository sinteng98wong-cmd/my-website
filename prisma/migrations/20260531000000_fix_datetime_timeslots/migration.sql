-- Migration: fix-datetime-timeslots
-- Converts Appointment.date + Appointment.startTime (string) → single startTime DateTime
-- Converts Schedule.startTime and Schedule.endTime (strings) → DateTime

-- ── Appointment ───────────────────────────────────────────────────────────

-- 1. Add new datetime column
ALTER TABLE "Appointment" ADD COLUMN "startTime_new" TIMESTAMP(3);

-- 2. Combine existing date + startTime string into a proper timestamp (MYT = UTC+8)
--    date is stored as UTC midnight; startTime is "HH:MM"
UPDATE "Appointment"
SET "startTime_new" = (
  (("date" AT TIME ZONE 'UTC')::date::text || ' ' || "startTime")::timestamp
  AT TIME ZONE 'Asia/Kuala_Lumpur'
);

-- 3. Set NOT NULL (all rows should now have a value)
ALTER TABLE "Appointment" ALTER COLUMN "startTime_new" SET NOT NULL;

-- 4. Drop old columns and rename new one
ALTER TABLE "Appointment" DROP COLUMN "startTime";
ALTER TABLE "Appointment" DROP COLUMN "date";
ALTER TABLE "Appointment" RENAME COLUMN "startTime_new" TO "startTime";

-- ── Schedule ──────────────────────────────────────────────────────────────

-- 1. Add new datetime columns
ALTER TABLE "Schedule" ADD COLUMN "startTime_new" TIMESTAMP(3);
ALTER TABLE "Schedule" ADD COLUMN "endTime_new"   TIMESTAMP(3);

-- 2. Combine date + time strings into timestamps
UPDATE "Schedule"
SET
  "startTime_new" = (
    (("date" AT TIME ZONE 'UTC')::date::text || ' ' || "startTime")::timestamp
    AT TIME ZONE 'Asia/Kuala_Lumpur'
  ),
  "endTime_new" = (
    (("date" AT TIME ZONE 'UTC')::date::text || ' ' || "endTime")::timestamp
    AT TIME ZONE 'Asia/Kuala_Lumpur'
  );

-- 3. Set NOT NULL
ALTER TABLE "Schedule" ALTER COLUMN "startTime_new" SET NOT NULL;
ALTER TABLE "Schedule" ALTER COLUMN "endTime_new"   SET NOT NULL;

-- 4. Drop old unique constraint (references old string startTime)
ALTER TABLE "Schedule" DROP CONSTRAINT IF EXISTS "Schedule_clinicId_doctorId_date_startTime_key";

-- 5. Drop old columns and rename new ones
ALTER TABLE "Schedule" DROP COLUMN "startTime";
ALTER TABLE "Schedule" DROP COLUMN "endTime";
ALTER TABLE "Schedule" RENAME COLUMN "startTime_new" TO "startTime";
ALTER TABLE "Schedule" RENAME COLUMN "endTime_new"   TO "endTime";

-- 6. Recreate unique constraint using new DateTime startTime
ALTER TABLE "Schedule"
  ADD CONSTRAINT "Schedule_clinicId_doctorId_startTime_key"
  UNIQUE ("clinicId", "doctorId", "startTime");
