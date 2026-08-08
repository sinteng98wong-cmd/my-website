import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { guardLunchOt, guardMonthOpen } from "@/lib/payroll-config";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const record = await prisma.attendanceRecord.findUnique({ where: { id: params.id }, select: { clinicId: true, date: true } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  const monthGuard = await guardMonthOpen(record.clinicId, record.date, role);
  if (!monthGuard.ok) return NextResponse.json({ error: monthGuard.error }, { status: monthGuard.status });

  const otGuard = await guardLunchOt(record.clinicId, body.lunchOtMinutes);
  if (!otGuard.ok) return NextResponse.json({ error: otGuard.error }, { status: otGuard.status });

  const data: any = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.checkIn !== undefined) data.checkIn = body.checkIn ? new Date(body.checkIn) : null;
  if (body.checkOut !== undefined) data.checkOut = body.checkOut ? new Date(body.checkOut) : null;
  if (body.lateMinutes !== undefined) data.lateMinutes = body.lateMinutes;
  if (body.overtimeMinutes !== undefined) data.overtimeMinutes = body.overtimeMinutes;
  if (body.lunchOtMinutes !== undefined) data.lunchOtMinutes = body.lunchOtMinutes ?? 0;
  if (body.notes !== undefined) data.notes = body.notes;

  const updated = await prisma.attendanceRecord.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}
