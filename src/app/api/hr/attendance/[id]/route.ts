import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes((session.user as any).role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: any = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.checkIn !== undefined) data.checkIn = body.checkIn ? new Date(body.checkIn) : null;
  if (body.checkOut !== undefined) data.checkOut = body.checkOut ? new Date(body.checkOut) : null;
  if (body.lateMinutes !== undefined) data.lateMinutes = body.lateMinutes;
  if (body.overtimeMinutes !== undefined) data.overtimeMinutes = body.overtimeMinutes;
  if (body.notes !== undefined) data.notes = body.notes;

  const updated = await prisma.attendanceRecord.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}
