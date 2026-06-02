import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLeaveBalance } from "@/lib/leave";
import type { HrLeaveType } from "@prisma/client";

const ALL_TYPES: HrLeaveType[] = [
  "ANNUAL", "MEDICAL", "EMERGENCY", "MATERNITY", "PATERNITY",
  "UNPAID", "REPLACEMENT", "HOSPITALISATION", "COMPASSIONATE",
];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id as string;

  const sp = req.nextUrl.searchParams;
  const year = Number(sp.get("year")) || new Date().getFullYear();
  let staffProfileId = sp.get("staffProfileId");

  // Resolve own profile if not specified
  const ownProfile = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!staffProfileId) staffProfileId = ownProfile?.id ?? null;
  if (!staffProfileId) return NextResponse.json({ error: "No staff profile" }, { status: 400 });

  // Access: managers, or own balances only
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);
  if (!isManager && staffProfileId !== ownProfile?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Ensure a balance exists for the common entitled types, then return all
  for (const t of ["ANNUAL", "MEDICAL", "EMERGENCY", "COMPASSIONATE"] as HrLeaveType[]) {
    await getLeaveBalance(staffProfileId, year, t);
  }

  const balances = await prisma.leaveBalance.findMany({
    where: { staffProfileId, year },
    orderBy: { leaveType: "asc" },
  });
  return NextResponse.json(balances);
}
