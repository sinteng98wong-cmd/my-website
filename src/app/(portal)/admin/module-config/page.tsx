import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  MODULES, CONFIGURABLE_ROLES, DEFAULT_ROLE_ACTIONS,
  type ModuleKey, type ConfigurableRole, type ActionKey,
} from "@/lib/modules";
import { ModuleConfigGrid } from "./ModuleConfigGrid";
import { UserOverrideGrid } from "./UserOverrideGrid";
import { TabSwitcher } from "./TabSwitcher";

function parseActions(raw: string | null | undefined): ActionKey[] {
  try { const p = JSON.parse(raw ?? "[]"); return Array.isArray(p) ? p : []; } catch { return []; }
}

export default async function ModuleConfigPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if ((session.user as any)?.role !== "SUPER_ADMIN") redirect("/dashboard");

  const tab = searchParams.tab ?? "roles";

  const [configs, users, clinics] = await Promise.all([
    prisma.roleModuleConfig.findMany(),
    prisma.user.findMany({
      where:   { active: true, role: { not: "SUPER_ADMIN" } },
      select:  { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Build grid: module → role → ActionKey[]
  const grid: Record<string, Record<string, ActionKey[]>> = {};
  for (const mod of MODULES) {
    grid[mod.key] = {};
    for (const role of CONFIGURABLE_ROLES) {
      const row = configs.find(c => c.module === mod.key && c.role === role);
      grid[mod.key][role] = row
        ? parseActions(row.actions)
        : (DEFAULT_ROLE_ACTIONS[role]?.[mod.key] ?? []) as ActionKey[];
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Role &amp; Module Access</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Configure which actions each role can perform per module (Role Defaults),
          or set per-user per-clinic overrides (User Overrides).
        </p>
      </div>

      <TabSwitcher activeTab={tab} />

      <div className="mt-6">
        {tab === "roles" && (
          <ModuleConfigGrid
            modules={MODULES.map(m => m.key) as ModuleKey[]}
            roles={[...CONFIGURABLE_ROLES] as ConfigurableRole[]}
            initialGrid={grid}
          />
        )}
        {tab === "overrides" && (
          <UserOverrideGrid users={users} clinics={clinics} />
        )}
      </div>
    </div>
  );
}
