import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStaffingStatus } from "@/lib/staff-alert";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sched = await prisma.staffSchedule.findUnique({
    where: { id: params.id },
    include: { staffProfile: { select: { user: { select: { role: true } } } } },
  });
  if (!sched) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const b = await req.json();

  // If marking off, check the resulting staffing for that role/date
  if (b.isOff === true && !sched.isOff && !b.confirmed) {
    const status = await getStaffingStatus(sched.clinicId, sched.date);
    const roleStatus = status.find((s) => s.role === sched.staffProfile.user.role);
    if (roleStatus && roleStatus.minimum > 0 && roleStatus.present - 1 < roleStatus.minimum) {
      return NextResponse.json({
        requiresConfirmation: true,
        message: `Marking this staff off will drop ${roleStatus.role} below the minimum of ${roleStatus.minimum} on this day.`,
        staffingStatus: status,
      });
    }
  }

  const data: Record<string, any> = {};
  for (const k of ["shiftTemplateId", "startTime", "endTime", "isOff", "notes"]) {
    if (b[k] !== undefined) data[k] = b[k] === "" ? null : b[k];
  }
  const updated = await prisma.staffSchedule.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}
