import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

/** Returns the currently selected clinicId from cookie, or undefined (= all). */
export function getSelectedClinicId(): string | undefined {
  const val = cookies().get("selected_clinic")?.value;
  return val === "all" || !val ? undefined : val;
}

/**
 * Returns the effective role for the current user + selected clinic.
 * If the UserClinic row has a roleOverride, that takes precedence.
 * Otherwise falls back to User.role.
 */
export async function getEffectiveRole(): Promise<string> {
  const session  = await getServerSession(authOptions);
  const userId   = (session?.user as any)?.id;
  const baseRole = (session?.user as any)?.role ?? "RECEPTIONIST";
  const clinicId = getSelectedClinicId();

  if (!clinicId || !userId) return baseRole;

  const link = await prisma.userClinic.findUnique({
    where: { userId_clinicId: { userId, clinicId } },
    select: { roleOverride: true },
  });

  return link?.roleOverride ?? baseRole;
}

/** Returns clinics the current user's role is allowed to access. */
export async function getUserClinics() {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  const userId  = (session?.user as any)?.id;

  if (role === "SUPER_ADMIN" || role === "FINANCE") {
    return prisma.clinic.findMany({ orderBy: { name: "asc" } });
  }

  // Check role-level clinic config
  const roleClinicConfigs = await prisma.roleClinicConfig.findMany({
    where: { role, enabled: true },
    include: { clinic: true },
  });

  if (roleClinicConfigs.length > 0) {
    const userLinks = await prisma.userClinic.findMany({
      where: { userId },
      select: { clinicId: true },
      distinct: ["clinicId"],
    });
    const userClinicIds = new Set(userLinks.map(l => l.clinicId));
    const allowed = roleClinicConfigs.map(c => c.clinic).filter(c => userClinicIds.has(c.id));
    return allowed.length > 0 ? allowed : roleClinicConfigs.map(c => c.clinic);
  }

  // Fallback: user's own UserClinic assignments
  const links = await prisma.userClinic.findMany({
    where: { userId },
    include: { clinic: true },
    distinct: ["clinicId"],
  });
  return links.map(l => l.clinic);
}

/** Returns all UserClinic entries for a user including role overrides — used by Staff page. */
export async function getUserClinicRoles(userId: string) {
  return prisma.userClinic.findMany({
    where: { userId },
    include: { clinic: { select: { id: true, name: true } } },
  });
}
