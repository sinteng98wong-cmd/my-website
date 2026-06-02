/*
  Warnings:

  - You are about to drop the `StaffLeave` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "StaffLeave" DROP CONSTRAINT "StaffLeave_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "StaffLeave" DROP CONSTRAINT "StaffLeave_reviewedById_fkey";

-- DropForeignKey
ALTER TABLE "StaffLeave" DROP CONSTRAINT "StaffLeave_staffId_fkey";

-- DropTable
DROP TABLE "StaffLeave";

-- DropEnum
DROP TYPE "LeaveStatus";

-- DropEnum
DROP TYPE "LeaveType";
