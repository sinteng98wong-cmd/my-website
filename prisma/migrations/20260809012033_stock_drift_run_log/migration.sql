-- CreateEnum
CREATE TYPE "DriftRunStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "DriftRunTrigger" AS ENUM ('CRON', 'MANUAL');

-- CreateTable
CREATE TABLE "StockDriftRun" (
    "id" TEXT NOT NULL,
    "trigger" "DriftRunTrigger" NOT NULL DEFAULT 'CRON',
    "status" "DriftRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "positions" INTEGER NOT NULL DEFAULT 0,
    "movements" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "infoCount" INTEGER NOT NULL DEFAULT 0,
    "clean" BOOLEAN NOT NULL DEFAULT false,
    "findings" JSONB NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "alertSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockDriftRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockDriftRun_startedAt_idx" ON "StockDriftRun"("startedAt");

-- CreateIndex
CREATE INDEX "StockDriftRun_status_idx" ON "StockDriftRun"("status");
