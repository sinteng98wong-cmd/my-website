import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const clinicId = sp.get("clinicId");
  const month = sp.get("month"); // YYYY-MM
  const staffProfileId = sp.get("staffProfileId");
  if (!clinicId || !month) return NextResponse.json({ error: "clinicId and month required" }, { status: 422 });

  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end   = new Date(Date.UTC(y, m, 1));

  const schedules = await prisma.staffSchedule.findMany({
    where: { clinicId, date: { gte: start, lt: end }, ...(staffProfileId ? { staffProfileId } : {}) },
    include: {
      staffProfile: { select: { id: true, user: { select: { name: true, role: true } } } },
      shiftTemplate: { select: { id: true, name: true, startTime: true, endTime: true, shiftType: true } },
    },
    orderBy: [{ date: "asc" }],
  });

  // Approved leaves in window (to overlay leave state)
  const leaves = await prisma.leaveApplication.findMany({
    where: { clinicId, status: "APPROVED", startDate: { lt: end }, endDate: { gte: start } },
    select: { staffProfileId: true, leaveType: true, startDate: true, endDate: true },
  });

  return NextResponse.json(schedules.map((s) => {
    const onLeave = leaves.find((l) => l.staffProfileId === s.staffProfileId && l.startDate <= s.date && l.endDate >= s.date);
    return {
      id: s.id,
      staffProfileId: s.staffProfileId,
      staffName: s.staffProfile.user.name,
      role: s.staffProfile.user.role,
      date: s.date,
      shiftTemplate: s.shiftTemplate,
      startTime: s.startTime,
      endTime: s.endTime,
      isOff: s.isOff,
      isPublicHoliday: s.isPublicHoliday,
      notes: s.notes,
      onLeave: onLeave ? onLeave.leaveType : null,
    };
  }));
}
