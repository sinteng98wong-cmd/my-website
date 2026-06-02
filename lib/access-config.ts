import { prisma } from "./prisma";

// ── Canonical module list ─────────────────────────────────────────────────
export const ALL_MODULES = [
  { key: "dashboard",  label: "Dashboard" },
  { key: "patients",   label: "Patients" },
  { key: "schedule",   label: "Schedule" },
  { key: "invoices",   label: "Invoices" },
  { key: "commission", label: "Commission" },
  { key: "staff",      label: "Staff" },
  { key: "leave",      label: "Leave" },
  { key: "ledger",     label: "Ledger" },
  { key: "reports",    label: "Reports" },
  { key: "lab",        label: "Lab Work" },
  { key: "stock",      label: "Stock" },
  { key: "users",      label: "Users" },
  { key: "config",     label: "Config" },
] as const;

export type ModuleKey = (typeof ALL_MODULES)[number]["key"];

// Roles that can be configured (Super Admin always has full access)
export const CONFIGURABLE_ROLES = [
  "CLINIC_MANAGER",
  "FINANCE",
  "DOCTOR",
  "NURSE",
  "RECEPTIONIST",
  "STOREKEEPER",
] as const;

export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

// ── Default module access (fallback when no DB config exists) ─────────────
export const DEFAULT_MODULE_ACCESS: Record<ConfigurableRole, ModuleKey[]> = {
  CLINIC_MANAGER: ["dashboard","patients","schedule","invoices","commission","staff","leave","ledger","reports","lab","stock"],
  FINANCE:        ["dashboard","commission","ledger","reports","lab"],
  DOCTOR:         ["dashboard","patients","schedule","commission","leave","lab"],
  NURSE:          ["dashboard","patients","schedule","leave"],
  RECEPTIONIST:   ["dashboard","patients","schedule","invoices","leave"],
  STOREKEEPER:    ["dashboard","stock","leave"],
};

// ── Load effective module access from DB (with fallback) ──────────────────
export async function getModuleAccessForRole(role: string): Promise<Set<ModuleKey>> {
  if (role === "SUPER_ADMIN") return new Set(ALL_MODULES.map(m => m.key));

  const configs = await prisma.roleModuleConfig.findMany({
    where: { role },
  });

  // If no DB config yet → use defaults
  if (configs.length === 0) {
    const defaults = DEFAULT_MODULE_ACCESS[role as ConfigurableRole] ?? [];
    return new Set(defaults);
  }

  return new Set(
    configs.filter(c => c.enabled).map(c => c.module as ModuleKey)
  );
}

// ── Load clinic access for role from DB (with fallback = all clinics) ─────
export async function getClinicAccessForRole(role: string, allClinicIds: string[]): Promise<string[]> {
  if (role === "SUPER_ADMIN" || role === "FINANCE") return allClinicIds;

  const configs = await prisma.roleClinicConfig.findMany({
    where: { role },
  });

  // If no DB config → allow all clinics
  if (configs.length === 0) return allClinicIds;

  return configs.filter(c => c.enabled).map(c => c.clinicId);
}
