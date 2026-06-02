import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getModuleAccess } from "@/lib/module-access";
import { MODULES } from "@/lib/modules";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const userId   = (session.user as any)?.id as string;
  const baseRole = (session.user as any)?.role as string;

  if (baseRole === "SUPER_ADMIN") {
    // Super Admin: all modules true at every clinic
    const allModules = Object.fromEntries(MODULES.map(m => [m.key, true]));
    const clinics = await prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    return NextResponse.json(clinics.map(c => ({
      clinicId: c.id, clinicName: c.name,
      effectiveRole: "SUPER_ADMIN", isRoleOverridden: false,
      modules: allModules,
    })));
  }

  // Get clinics this user is assigned to
  const userClinics = await prisma.userClinic.findMany({
    where:   { userId },
    include: { clinic: { select: { id: true, name: true } } },
  });

  const result = await Promise.all(
    userClinics.map(async uc => {
      const access = await getModuleAccess(userId, uc.clinicId);
      const firstEntry        = Object.values(access)[0] as any;
      const effectiveRole     = firstEntry?.effectiveRole ?? baseRole;
      const isRoleOverridden  = !!uc.roleOverride;
      // canAccess = user has "view" action on this module
      const modules = Object.fromEntries(
        Object.entries(access).map(([k, v]) => [k, v.effectiveActions.includes("view")])
      );
      return {
        clinicId: uc.clinicId,
        clinicName: uc.clinic.name,
        effectiveRole,
        isRoleOverridden,
        modules,
      };
    })
  );

  return NextResponse.json(result);
}
