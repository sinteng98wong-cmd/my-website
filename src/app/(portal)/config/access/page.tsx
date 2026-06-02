import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ALL_MODULES, CONFIGURABLE_ROLES, DEFAULT_MODULE_ACCESS } from "@/lib/access-config";
import { AccessConfigClient } from "./AccessConfigClient";

export default async function AccessConfigPage() {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "SUPER_ADMIN") redirect("/dashboard");

  const [moduleConfigs, clinicConfigs, clinics] = await Promise.all([
    prisma.roleModuleConfig.findMany(),
    prisma.roleClinicConfig.findMany(),
    prisma.clinic.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Build module matrix: role → module → enabled
  const moduleMatrix: Record<string, Record<string, boolean>> = {};
  for (const role of CONFIGURABLE_ROLES) {
    moduleMatrix[role] = {};
    const dbConfigs = moduleConfigs.filter(c => c.role === role);

    for (const mod of ALL_MODULES) {
      if (dbConfigs.length > 0) {
        // Use DB config
        const dbEntry = dbConfigs.find(c => c.module === mod.key);
        // actions is a JSON array; module is "accessible" if it contains "view"
        const actions: string[] = dbEntry ? (() => { try { return JSON.parse(dbEntry.actions); } catch { return []; } })() : [];
        moduleMatrix[role][mod.key] = actions.includes("view");
      } else {
        // Use defaults
        moduleMatrix[role][mod.key] = (DEFAULT_MODULE_ACCESS[role] ?? []).includes(mod.key as any);
      }
    }
  }

  // Build clinic matrix: role → clinicId → enabled
  const clinicMatrix: Record<string, Record<string, boolean>> = {};
  for (const role of CONFIGURABLE_ROLES) {
    clinicMatrix[role] = {};
    const dbConfigs = clinicConfigs.filter(c => c.role === role);
    for (const clinic of clinics) {
      if (dbConfigs.length > 0) {
        const dbEntry = dbConfigs.find(c => c.clinicId === clinic.id);
        clinicMatrix[role][clinic.id] = dbEntry ? dbEntry.enabled : true;
      } else {
        clinicMatrix[role][clinic.id] = true; // default: all clinics
      }
    }
  }

  return (
    <AccessConfigClient
      modules={[...ALL_MODULES]}
      roles={[...CONFIGURABLE_ROLES]}
      clinics={clinics}
      moduleMatrix={moduleMatrix}
      clinicMatrix={clinicMatrix}
    />
  );
}
