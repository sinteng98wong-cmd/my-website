import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { records } = await req.json() as { records: { staffProfileId: string; clinicId: string; date: string; status: string; checkIn?: string; checkOut?: string; lateMinutes?: number; overtimeMinutes?: number; notes?: string }[] };
  if (!Array.isArray(records) || !records.length) return NextResponse.json({ error: "records array is required" }, { status: 422 });

  let created = 0;
  for (const r of records) {
    await prisma.attendanceRecord.upsert({
      where: { staffProfileId_date: { staffProfileId: r.staffProfileId, date: new Date(r.date) } },
      create: {
        staffProfileId: r.staffProfileId, clinicId: r.clinicId, date: new Date(r.date),
        status: r.status as any, checkIn: r.checkIn ? new Date(r.checkIn) : undefined,
        checkOut: r.checkOut ? new Date(r.checkOut) : undefined,
        lateMinutes: r.lateMinutes, overtimeMinutes: r.overtimeMinutes, notes: r.notes, recordedById: userId,
      },
      update: {
        status: r.status as any, checkIn: r.checkIn ? new Date(r.checkIn) : undefined,
        checkOut: r.checkOut ? new Date(r.checkOut) : undefined,
        lateMinutes: r.lateMinutes, overtimeMinutes: r.overtimeMinutes, notes: r.notes, recordedById: userId,
      },
    });
    created++;
  }
  return NextResponse.json({ processed: created });
}
