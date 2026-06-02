import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MINIMUMS } from "@/lib/staff-alert";
import type { Role } from "@prisma/client";

const ROLES: Role[] = ["DOCTOR", "NURSE", "RECEPTIONIST", "STOREKEEPER"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const clinicId = req.nextUrl.searchParams.get("clinicId");
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 422 });

  const rows = await prisma.clinicStaffMinimum.findMany({ where: { clinicId } });
  const byRole = new Map(rows.map((r) => [r.role, r.minCount]));

  // Return a complete set, filling defaults where unset
  return NextResponse.json(ROLES.map((r) => ({
    role: r,
    minCount: byRole.has(r) ? byRole.get(r) : (DEFAULT_MINIMUMS[r] ?? 0),
    isDefault: !byRole.has(r),
  })));
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clinicId, role, minCount } = await req.json();
  if (!clinicId || !role || minCount === undefined) {
    return NextResponse.json({ error: "clinicId, role and minCount are required" }, { status: 422 });
  }

  const row = await prisma.clinicStaffMinimum.upsert({
    where: { clinicId_role: { clinicId, role } },
    update: { minCount: Number(minCount) },
    create: { clinicId, role, minCount: Number(minCount) },
  });
  return NextResponse.json(row);
}
