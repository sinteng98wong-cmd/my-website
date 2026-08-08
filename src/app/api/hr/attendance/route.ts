import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { guardLunchOt, guardMonthOpen } from "@/lib/payroll-config";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);

  const sp = req.nextUrl.searchParams;
  const where: any = {};

  if (sp.get("clinicId")) where.clinicId = sp.get("clinicId");
  if (sp.get("staffProfileId")) where.staffProfileId = sp.get("staffProfileId");

  if (sp.get("date")) {
    const d = new Date(sp.get("date")!);
    where.date = { gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()), lt: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) };
  } else if (sp.get("month")) {
    const [y, m] = sp.get("month")!.split("-").map(Number);
    where.date = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
  }

  if (!isManager) {
    const profile = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
    where.staffProfileId = profile?.id ?? "__none__";
  }

  const records = await prisma.attendanceRecord.findMany({
    where,
    include: {
      staffProfile: { select: { id: true, employeeId: true, user: { select: { name: true, role: true } } } },
    },
    orderBy: [{ date: "asc" }, { staffProfile: { user: { name: "asc" } } }],
  });
  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { staffProfileId, clinicId, date, status, checkIn, checkOut, lateMinutes, overtimeMinutes, lunchOtMinutes, notes } = body;
  if (!staffProfileId || !clinicId || !date) return NextResponse.json({ error: "staffProfileId, clinicId and date are required" }, { status: 422 });

  const monthGuard = await guardMonthOpen(clinicId, new Date(date), role);
  if (!monthGuard.ok) return NextResponse.json({ error: monthGuard.error }, { status: monthGuard.status });

  const otGuard = await guardLunchOt(clinicId, lunchOtMinutes);
  if (!otGuard.ok) return NextResponse.json({ error: otGuard.error }, { status: otGuard.status });

  const record = await prisma.attendanceRecord.upsert({
    where: { staffProfileId_date: { staffProfileId, date: new Date(date) } },
    create: {
      staffProfileId, clinicId, date: new Date(date),
      status: status || "PRESENT",
      checkIn: checkIn ? new Date(checkIn) : undefined,
      checkOut: checkOut ? new Date(checkOut) : undefined,
      lateMinutes, overtimeMinutes, lunchOtMinutes: lunchOtMinutes ?? 0, notes, recordedById: userId,
    },
    update: {
      status: status || "PRESENT",
      checkIn: checkIn ? new Date(checkIn) : undefined,
      checkOut: checkOut ? new Date(checkOut) : undefined,
      lateMinutes, overtimeMinutes,
      ...(lunchOtMinutes !== undefined ? { lunchOtMinutes: lunchOtMinutes ?? 0 } : {}),
      notes, recordedById: userId,
    },
  });
  return NextResponse.json(record, { status: 201 });
}
