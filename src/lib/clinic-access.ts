/**
 * Clinic-level authorization for the Stock / Inventory module.
 *
 * The rules mirror what the Delivery Order routes already do:
 *
 *   • SUPER_ADMIN and FINANCE carry group-wide scope (same as getUserClinics()
 *     and rbac's `clinic:all`), so they see and act across every branch.
 *   • Everyone else is limited to the clinics they are linked to through
 *     UserClinic — for reads and for writes alike.
 *   • A clinicId supplied by the caller is always *intersected* with that
 *     scope. It narrows what a user can see; it can never widen it.
 *
 * The resolver is pure so the rules can be unit tested without a database.
 */
import { prisma } from "./prisma";

/** Roles whose scope spans every clinic. */
export const GLOBAL_CLINIC_ROLES = ["SUPER_ADMIN", "FINANCE"];

/** Roles allowed into the inventory module at all. */
export const INVENTORY_ROLES = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "STOREKEEPER"];

/**
 * Supplier master data is group-level, so it carries no clinic scope — but the
 * two supplier APIs (/api/suppliers and /api/inventory/suppliers) must apply
 * the same policy. Storekeepers read suppliers to raise orders; only Finance
 * and Super Admin maintain them; only Super Admin deactivates one.
 */
export const SUPPLIER_READ_ROLES   = INVENTORY_ROLES;
export const SUPPLIER_WRITE_ROLES  = ["SUPER_ADMIN", "FINANCE"];
export const SUPPLIER_DELETE_ROLES = ["SUPER_ADMIN"];

export function hasGlobalClinicScope(role: string): boolean {
  return GLOBAL_CLINIC_ROLES.includes(role);
}

export type AccessGuard = { ok: true } | { ok: false; status: number; error: string };

/**
 * `clinicIds: null` means "every clinic" (group-wide role, no filter asked
 * for). Otherwise it is the exact list a query may read.
 */
export type ClinicScope =
  | { ok: true; clinicIds: string[] | null }
  | { ok: false; status: number; error: string };

const denyScope = (status: number, error: string): ClinicScope => ({ ok: false, status, error });

/**
 * Resolve the clinics a request may touch.
 *
 * A requested clinicId is honoured only when it falls inside the caller's own
 * scope, which is what stops `?clinicId=<other branch>` from being used to
 * read another branch's data.
 */
export function resolveClinicScope(
  role: string,
  userClinicIds: string[],
  requestedClinicId?: string | null
): ClinicScope {
  if (hasGlobalClinicScope(role)) {
    return { ok: true, clinicIds: requestedClinicId ? [requestedClinicId] : null };
  }

  if (userClinicIds.length === 0)
    return denyScope(403, "Forbidden: you are not assigned to any clinic");

  if (requestedClinicId) {
    if (!userClinicIds.includes(requestedClinicId))
      return denyScope(403, "Forbidden: you are not authorized for that clinic");
    return { ok: true, clinicIds: [requestedClinicId] };
  }

  return { ok: true, clinicIds: userClinicIds };
}

/** Write-side check: may this caller act on this specific clinic? */
export function checkClinicAccess(role: string, userClinicIds: string[], clinicId: string): AccessGuard {
  if (hasGlobalClinicScope(role)) return { ok: true };
  if (!clinicId) return { ok: false, status: 422, error: "clinicId is required" };
  if (!userClinicIds.includes(clinicId))
    return { ok: false, status: 403, error: "Forbidden: you are not authorized for that clinic" };
  return { ok: true };
}

/**
 * Turn a resolved scope into a Prisma `where` fragment for a clinicId column.
 * `null` (group-wide, unfiltered) yields no constraint.
 */
export function clinicWhere(clinicIds: string[] | null): Record<string, unknown> {
  return clinicIds === null ? {} : { clinicId: { in: clinicIds } };
}

// ── Database-backed helpers ─────────────────────────────────────────────────

/** Clinic ids this user is linked to through UserClinic. */
export async function getUserClinicIds(userId: string): Promise<string[]> {
  if (!userId) return [];
  const links = await prisma.userClinic.findMany({
    where: { userId },
    select: { clinicId: true },
    distinct: ["clinicId"],
  });
  return links.map((l) => l.clinicId);
}

/** Resolve a request's clinic scope, reading the user's links as needed. */
export async function clinicScopeFor(
  role: string,
  userId: string,
  requestedClinicId?: string | null
): Promise<ClinicScope> {
  const userClinicIds = hasGlobalClinicScope(role) ? [] : await getUserClinicIds(userId);
  return resolveClinicScope(role, userClinicIds, requestedClinicId);
}

/** Write-side check against the database. */
export async function assertClinicAccess(role: string, userId: string, clinicId: string): Promise<AccessGuard> {
  const userClinicIds = hasGlobalClinicScope(role) ? [] : await getUserClinicIds(userId);
  return checkClinicAccess(role, userClinicIds, clinicId);
}
