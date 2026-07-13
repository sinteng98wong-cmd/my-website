import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createShift, ShiftConflictError } from "@/services/shift.service";

const ADMIN = ["SUPER_ADMIN", "CLINIC_MANAGER"];

/**
 * GET /api/shifts?weekStart=YYYY-MM-DD&role=DOCTOR|NURSE
 * Returns the week's shifts for that role across ALL branches (so the grid can
 * show cross-branch "pulls"), plus the roster of staff for that role.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const weekStart = req.nextUrl.searchParams.get("weekStart");
  const role = req.nextUrl.searchParams.get("role") === "NURSE" ? "NURSE" : "DOCTOR";
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart))
    return NextResponse.json({ error: "weekStart (YYYY-MM-DD) is required" }, { status: 422 });

  const start = new Date(`${weekStart}T00:00:00+08:00`);
  const end = new Date(start); end.setDate(end.getDate() + 7);

  const [shifts, staff] = await Promise.all([
    (prisma as any).shift.findMany({
      where: { startTime: { gte: start, lt: end }, user: { role } },
      include: { user: { select: { id: true, name: true, role: true } }, branch: { select: { id: true, name: true } } },
      orderBy: { startTime: "asc" },
    }),
    prisma.user.findMany({ where: { role: role as any, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({ shifts, staff });
}

/**
 * POST /api/shifts  — pull a staff member into a branch/day.
 * Body: { userId, branchId, startTime, endTime, status? }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!ADMIN.includes(role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => null) as any;
  if (!b?.userId || !b?.branchId || !b?.startTime || !b?.endTime)
    return NextResponse.json({ error: "userId, branchId, startTime and endTime are required" }, { status: 422 });

  try {
    const shift = await createShift({
      userId:    b.userId,
      branchId:  b.branchId,
      startTime: new Date(b.startTime),
      endTime:   new Date(b.endTime),
      status:    b.status,
    });
    return NextResponse.json(shift, { status: 201 });
  } catch (e) {
    if (e instanceof ShiftConflictError) return NextResponse.json({ error: e.message, conflict: true, branch: e.branchName }, { status: 409 });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
