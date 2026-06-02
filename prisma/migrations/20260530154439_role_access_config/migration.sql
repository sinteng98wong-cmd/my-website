-- CreateTable
CREATE TABLE "RoleModuleConfig" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "RoleModuleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleClinicConfig" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleClinicConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoleModuleConfig_role_module_key" ON "RoleModuleConfig"("role", "module");

-- CreateIndex
CREATE UNIQUE INDEX "RoleClinicConfig_role_clinicId_key" ON "RoleClinicConfig"("role", "clinicId");

-- AddForeignKey
ALTER TABLE "RoleClinicConfig" ADD CONSTRAINT "RoleClinicConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
