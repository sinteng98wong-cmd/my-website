import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStaffingStatus } from "@/lib/staff-alert";
import { getDayPairings } from "@/lib/pairing";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const clinicId = sp.get("clinicId");
  const dateStr = sp.get("date");
  if (!clinicId || !dateStr) return NextResponse.json({ error: "clinicId and date required" }, { status: 422 });

  const date = new Date(dateStr);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);

  const [schedules, shifts, pairings, staffingStatus, leaves] = await Promise.all([
    prisma.staffSchedule.findMany({
      where: { clinicId, date: { gte: start, lt: end } },
      include: { staffProfile: { select: { id: true, user: { select: { name: true, role: true } } } }, shiftTemplate: true },
    }),
    prisma.shiftTemplate.findMany({ where: { clinicId, isActive: true }, orderBy: { order: "asc" } }),
    getDayPairings(clinicId, date),
    getStaffingStatus(clinicId, date),
    prisma.leaveApplication.findMany({
      where: { clinicId, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } },
      select: { staffProfileId: true, leaveType: true },
    }),
  ]);

  const leaveByStaff = new Map(leaves.map((l) => [l.staffProfileId, l.leaveType]));
  // dentistProfileId -> nurse name (resolve nurse names)
  const nurseIds = [...pairings.values()].map((p) => p.nurseProfileId);
  const nurses = await prisma.staffProfile.findMany({ where: { id: { in: nurseIds } }, select: { id: true, user: { select: { name: true, role: true } } } });
  const nurseName = new Map(nurses.map((n) => [n.id, n.user.name]));

  function staffEntry(s: typeof schedules[number]) {
    const isDentist = s.staffProfile.user.role === "DOCTOR";
    const pairing = isDentist ? pairings.get(s.staffProfileId) : undefined;
    return {
      staffProfileId: s.staffProfileId,
      staffName: s.staffProfile.user.name,
      role: s.staffProfile.user.role,
      isOff: s.isOff,
      isPublicHoliday: s.isPublicHoliday,
      notes: s.notes,
      onLeave: leaveByStaff.get(s.staffProfileId) ?? null,
      pairedWith: pairing ? { staffName: nurseName.get(pairing.nurseProfileId) ?? "—", role: "NURSE" } : undefined,
    };
  }

  // group by shift template
  const byShift = shifts.map((sh) => ({
    shiftTemplate: { id: sh.id, name: sh.name, startTime: sh.startTime, endTime: sh.endTime },
    staff: schedules.filter((s) => s.shiftTemplateId === sh.id).map(staffEntry),
  }));
  // schedules with no shift template (e.g. public holiday) → "Unassigned"
  const noShift = schedules.filter((s) => !s.shiftTemplateId);
  if (noShift.length) {
    byShift.push({ shiftTemplate: { id: "none", name: "Unassigned / PH", startTime: "", endTime: "" }, staff: noShift.map(staffEntry) });
  }

  return NextResponse.json({
    shifts: byShift,
    pairings: [...pairings.values()],
    understaffed: staffingStatus.some((s) => s.isLow),
    staffingStatus,
  });
}
