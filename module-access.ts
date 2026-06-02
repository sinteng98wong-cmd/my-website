/**
 * DentalOS — Module Access Logic (actions-based RBAC)
 *
 * Each module has a set of allowed actions: view | create | edit | delete | export | approve
 *
 * Resolution order:
 *   1. SUPER_ADMIN → all actions on all modules
 *   2. UserClinicModule row (per-user per-clinic override) → wins over role default
 *   3. RoleModuleConfig row (role-level default)
 *   4. DEFAULT_ROLE_ACTIONS (code-level fallback)
 *   5. No row → no access
 */

import { prisma } from "./prisma";
import { MODULES, DEFAULT_ROLE_ACTIONS, type ActionKey, type ModuleKey } from "./modules";

type Role = string;

function parseActions(raw: string | null | undefined): ActionKey[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getEffectiveRole(userId: string, clinicId: string): Promise<Role> {
  const [userClinic, user] = await Promise.all([
    prisma.userClinic.findUnique({
      where:  { userId_clinicId: { userId, clinicId } },
      select: { roleOverride: true },
    }),
    prisma.user.findUnique({
      where:  { id: userId },
      select: { role: true },
    }),
  ]);
  return (userClinic?.roleOverride ?? user?.role ?? "RECEPTIONIST") as Role;
}

/** Check whether a user can perform a specific action on a module at a clinic */
export async function canDoAction(
  userId: string,
  clinicId: string,
  module: ModuleKey,
  action: ActionKey
): Promise<boolean> {
  const actions = await getModuleActions(userId, clinicId, module);
  return actions.includes(action);
}

/** Shorthand: can the user VIEW a module (used for sidebar visibility) */
export async function canView(userId: string, clinicId: string, module: ModuleKey): Promise<boolean> {
  return canDoAction(userId, clinicId, module, "view");
}

/** Get the resolved action set for a single module */
export async function getModuleActions(
  userId: string,
  clinicId: string,
  module: ModuleKey
): Promise<ActionKey[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role === "SUPER_ADMIN") {
    // Super admin gets all actions on everything
    return ["view", "create", "edit", "delete", "export", "approve"];
  }

  const effectiveRole = await getEffectiveRole(userId, clinicId);

  // Check user-level override first
  const override = await prisma.userClinicModule.findUnique({
    where:  { userId_clinicId_module: { userId, clinicId, module } },
    select: { actions: true },
  });
  if (override) return parseActions(override.actions);

  // Fall back to role default from DB
  const roleConfig = await prisma.roleModuleConfig.findUnique({
    where:  { role_module: { role: effectiveRole, module } },
    select: { actions: true },
  });
  if (roleConfig) return parseActions(roleConfig.actions);

  // Fall back to code-level defaults
  return (DEFAULT_ROLE_ACTIONS[effectiveRole]?.[module] ?? []) as ActionKey[];
}

// ── Full access map (used by admin UI) ───────────────────────────────────

export type ModuleAccessEntry = {
  effectiveRole:   Role;
  roleActions:     ActionKey[];   // what the role config says
  overrideActions: ActionKey[] | null; // null = not overridden
  effectiveActions: ActionKey[];  // what actually applies
};

export async function getModuleAccess(
  userId: string,
  clinicId: string
): Promise<Record<ModuleKey, ModuleAccessEntry>> {
  const [user, userClinic, roleConfigs, userOverrides] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.userClinic.findUnique({
      where:  { userId_clinicId: { userId, clinicId } },
      select: { roleOverride: true },
    }),
    prisma.roleModuleConfig.findMany(),
    prisma.userClinicModule.findMany({ where: { userId, clinicId } }),
  ]);

  const baseRole      = (user?.role ?? "RECEPTIONIST") as Role;
  const effectiveRole = (userClinic?.roleOverride ?? baseRole) as Role;
  const isSuperAdmin  = baseRole === "SUPER_ADMIN";
  const allActions: ActionKey[] = ["view", "create", "edit", "delete", "export", "approve"];

  const result = {} as Record<ModuleKey, ModuleAccessEntry>;

  for (const mod of MODULES) {
    const key = mod.key as ModuleKey;

    const roleRow     = roleConfigs.find(c => c.role === effectiveRole && c.module === key);
    const overrideRow = userOverrides.find(o => o.module === key);

    const roleActions: ActionKey[] = isSuperAdmin
      ? allActions
      : roleRow
        ? parseActions(roleRow.actions)
        : (DEFAULT_ROLE_ACTIONS[effectiveRole]?.[key] ?? []) as ActionKey[];

    const overrideActions: ActionKey[] | null = overrideRow
      ? parseActions(overrideRow.actions)
      : null;

    const effectiveActions: ActionKey[] = isSuperAdmin
      ? allActions
      : overrideActions !== null
        ? overrideActions
        : roleActions;

    result[key] = { effectiveRole, roleActions, overrideActions, effectiveActions };
  }

  return result;
}
