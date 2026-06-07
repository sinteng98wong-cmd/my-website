-- AlterTable
ALTER TABLE "TreatmentStage" ADD COLUMN     "templateId" TEXT;

-- CreateIndex
CREATE INDEX "TreatmentStage_templateId_idx" ON "TreatmentStage"("templateId");

-- AddForeignKey
ALTER TABLE "TreatmentStage" ADD CONSTRAINT "TreatmentStage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TreatmentStageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
