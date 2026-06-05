-- CreateEnum
CREATE TYPE "ConsentFormType" AS ENUM ('GENERAL', 'TREATMENT');

-- CreateEnum
CREATE TYPE "ConsentFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'YES_NO', 'CHECKBOX', 'MULTIPLE_CHOICE', 'DATE', 'SIGNATURE');

-- CreateEnum
CREATE TYPE "ConsentRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ConsentFormTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ConsentFormType" NOT NULL,
    "treatmentType" TEXT,
    "description" TEXT,
    "introText" TEXT,
    "consentText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentFormField" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "ConsentFieldType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "options" TEXT[],
    "placeholder" TEXT,
    "helpText" TEXT,
    "showIfFieldId" TEXT,
    "showIfValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentFormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRequest" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "treatmentPlanId" TEXT,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "ConsentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "responses" JSONB,
    "signatureUrl" TEXT,
    "signedByName" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedIp" TEXT,
    "signMethod" TEXT,
    "pdfUrl" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentFormTemplate_type_isActive_idx" ON "ConsentFormTemplate"("type", "isActive");

-- CreateIndex
CREATE INDEX "ConsentFormField_templateId_idx" ON "ConsentFormField"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRequest_token_key" ON "ConsentRequest"("token");

-- CreateIndex
CREATE INDEX "ConsentRequest_patientId_idx" ON "ConsentRequest"("patientId");

-- CreateIndex
CREATE INDEX "ConsentRequest_token_idx" ON "ConsentRequest"("token");

-- CreateIndex
CREATE INDEX "ConsentRequest_status_idx" ON "ConsentRequest"("status");

-- AddForeignKey
ALTER TABLE "ConsentFormField" ADD CONSTRAINT "ConsentFormField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ConsentFormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRequest" ADD CONSTRAINT "ConsentRequest_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ConsentFormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRequest" ADD CONSTRAINT "ConsentRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRequest" ADD CONSTRAINT "ConsentRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRequest" ADD CONSTRAINT "ConsentRequest_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
