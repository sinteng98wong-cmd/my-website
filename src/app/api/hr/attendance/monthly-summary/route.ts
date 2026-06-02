import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes((session.user as any).role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const clinicId = sp.get("clinicId");
  const month = sp.get("month") ?? new Date().toISOString().slice(0, 7);
  const [y, m] = month.split("-").map(Number);

  const records = await prisma.attendanceRecord.findMany({
    where: {
      ...(clinicId ? { clinicId } : {}),
      date: { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) },
    },
    include: { staffProfile: { select: { id: true, employeeId: true, user: { select: { name: true, role: true } } } } },
  });

  // Group by staff
  const byStaff = new Map<string, any>();
  for (const r of records) {
    const sid = r.staffProfileId;
    if (!byStaff.has(sid)) {
      byStaff.set(sid, {
        staffProfileId: sid,
        employeeId: r.staffProfile.employeeId,
        name: r.staffProfile.user.name,
        role: r.staffProfile.user.role,
        present: 0, absent: 0, late: 0, halfDay: 0, onLeave: 0, publicHoliday: 0, overtimeMins: 0,
      });
    }
    const s = byStaff.get(sid);
    if (r.status === "PRESENT") s.present++;
    else if (r.status === "ABSENT") s.absent++;
    else if (r.status === "LATE") { s.late++; s.present++; }
    else if (r.status === "HALF_DAY") s.halfDay++;
    else if (r.status === "ON_LEAVE") s.onLeave++;
    else if (r.status === "PUBLIC_HOLIDAY") s.publicHoliday++;
    s.overtimeMins += r.overtimeMinutes ?? 0;
  }

  return NextResponse.json(Array.from(byStaff.values()));
}
