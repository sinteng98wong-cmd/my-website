import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function canManage(session: any) {
  return ["SUPER_ADMIN", "CLINIC_MANAGER"].includes((session?.user as any)?.role);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!canManage(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const shift = await prisma.shiftTemplate.findUnique({ where: { id: params.id } });
  if (!shift) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const b = await req.json();
  if (b.startTime && b.endTime && b.startTime >= b.endTime && b.endTime !== "24:00") {
    return NextResponse.json({ error: "startTime must be before endTime" }, { status: 422 });
  }

  // Block editing time fields if used in FUTURE schedules; warn if only past
  const changesTimes = b.startTime !== undefined || b.endTime !== undefined || b.shiftType !== undefined;
  if (changesTimes) {
    const now = new Date();
    const futureCount = await prisma.staffSchedule.count({ where: { shiftTemplateId: params.id, date: { gte: now } } });
    if (futureCount > 0 && !b.force) {
      return NextResponse.json(
        { error: `This shift is used by ${futureCount} upcoming schedule(s). Pass force:true to edit anyway.`, futureCount, requiresForce: true },
        { status: 400 }
      );
    }
  }

  if (b.isDefault) {
    await prisma.shiftTemplate.updateMany({ where: { clinicId: shift.clinicId, id: { not: params.id } }, data: { isDefault: false } });
  }

  const data: Record<string, any> = {};
  for (const k of ["name", "shiftType", "startTime", "endTime", "breakMins", "isDefault", "isActive", "order"]) {
    if (b[k] !== undefined) data[k] = b[k];
  }
  const updated = await prisma.shiftTemplate.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const count = await prisma.staffSchedule.count({ where: { shiftTemplateId: params.id } });
  if (count > 0) {
    return NextResponse.json({ error: `${count} schedule(s) use this shift. Deactivate it instead.`, count }, { status: 400 });
  }
  await prisma.shiftTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
