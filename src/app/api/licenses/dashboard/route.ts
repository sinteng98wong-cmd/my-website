import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { daysUntilExpiry } from "@/lib/license";

const ALLOWED = ["SUPER_ADMIN", "CLINIC_MANAGER"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const clinicId = searchParams.get("clinicId");

  const where = {
    status: { not: "ARCHIVED" as const },
    ...(clinicId ? { OR: [{ clinicId }, { staffProfile: { clinicId } }] } : {}),
  };

  const [all, active, expiringSoon, expired, upcoming] = await Promise.all([
    prisma.license.count({ where }),
    prisma.license.count({ where: { ...where, status: "ACTIVE" } }),
    prisma.license.count({ where: { ...where, status: "EXPIRING_SOON" } }),
    prisma.license.count({ where: { ...where, status: "EXPIRED" } }),
    prisma.license.findMany({
      where: {
        status: { not: "ARCHIVED" },
        expiryDate: { lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
        ...(clinicId ? { OR: [{ clinicId }, { staffProfile: { clinicId } }] } : {}),
      },
      include: {
        licenseType:  { select: { name: true } },
        clinic:       { select: { name: true } },
        staffProfile: { select: { user: { select: { name: true } } } },
      },
      orderBy: { expiryDate: "asc" },
      take: 50,
    }),
  ]);

  const [clinicAll, clinicActive, clinicExpiring, clinicExpired, doctorAll, doctorActive, doctorExpiring, doctorExpired] =
    await Promise.all([
      prisma.license.count({ where: { ...where, scope: "CLINIC" } }),
      prisma.license.count({ where: { ...where, scope: "CLINIC", status: "ACTIVE" } }),
      prisma.license.count({ where: { ...where, scope: "CLINIC", status: "EXPIRING_SOON" } }),
      prisma.license.count({ where: { ...where, scope: "CLINIC", status: "EXPIRED" } }),
      prisma.license.count({ where: { ...where, scope: "DOCTOR" } }),
      prisma.license.count({ where: { ...where, scope: "DOCTOR", status: "ACTIVE" } }),
      prisma.license.count({ where: { ...where, scope: "DOCTOR", status: "EXPIRING_SOON" } }),
      prisma.license.count({ where: { ...where, scope: "DOCTOR", status: "EXPIRED" } }),
    ]);

  return NextResponse.json({
    total: all,
    active,
    expiringSoon,
    expired,
    byScope: {
      clinic: { total: clinicAll, active: clinicActive, expiringSoon: clinicExpiring, expired: clinicExpired },
      doctor: { total: doctorAll, active: doctorActive, expiringSoon: doctorExpiring, expired: doctorExpired },
    },
    upcoming: upcoming.map((l) => ({
      licenseId:      l.id,
      typeName:       l.licenseType.name,
      scope:          l.scope,
      entityName:     l.scope === "CLINIC" ? (l.clinic?.name ?? "") : (l.staffProfile?.user.name ?? ""),
      expiryDate:     l.expiryDate,
      daysRemaining:  daysUntilExpiry(l.expiryDate),
      status:         l.status,
      licenseNo:      l.licenseNo,
    })),
  });
}
