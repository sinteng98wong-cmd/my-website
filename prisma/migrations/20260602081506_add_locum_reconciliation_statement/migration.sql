-- CreateTable
CREATE TABLE "LocumReconciliationStatement" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "splitRate" DECIMAL(5,2) NOT NULL,
    "payload" JSONB NOT NULL,
    "finalPayout" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocumReconciliationStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocumReconciliationStatement_doctorId_idx" ON "LocumReconciliationStatement"("doctorId");

-- CreateIndex
CREATE INDEX "LocumReconciliationStatement_month_idx" ON "LocumReconciliationStatement"("month");

-- CreateIndex
CREATE UNIQUE INDEX "LocumReconciliationStatement_doctorId_month_key" ON "LocumReconciliationStatement"("doctorId", "month");

-- AddForeignKey
ALTER TABLE "LocumReconciliationStatement" ADD CONSTRAINT "LocumReconciliationStatement_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
