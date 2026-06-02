-- CreateTable
CREATE TABLE "CashBanking" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "expectedCash" DECIMAL(10,2) NOT NULL,
    "bankInAmount" DECIMAL(10,2) NOT NULL,
    "variance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bankInDate" TIMESTAMP(3) NOT NULL,
    "referenceNo" TEXT,
    "bankName" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashBanking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccountCode" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT,
    "entryType" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "subCode" TEXT,
    "description" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LedgerAccountCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccountCode_clinicId_entryType_key" ON "LedgerAccountCode"("clinicId", "entryType");

-- AddForeignKey
ALTER TABLE "CashBanking" ADD CONSTRAINT "CashBanking_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccountCode" ADD CONSTRAINT "LedgerAccountCode_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
