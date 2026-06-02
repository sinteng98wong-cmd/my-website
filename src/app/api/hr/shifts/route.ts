import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function canManage(session: any) {
  return ["SUPER_ADMIN", "CLINIC_MANAGER"].includes((session?.user as any)?.role);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!canManage(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const clinicId = req.nextUrl.searchParams.get("clinicId");
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 422 });

  const shifts = await prisma.shiftTemplate.findMany({ where: { clinicId }, orderBy: { order: "asc" } });
  return NextResponse.json(shifts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!canManage(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json();
  if (!b.clinicId || !b.name || !b.shiftType || !b.startTime || !b.endTime) {
    return NextResponse.json({ error: "clinicId, name, shiftType, startTime, endTime are required" }, { status: 422 });
  }
  if (b.startTime >= b.endTime && b.endTime !== "24:00") {
    return NextResponse.json({ error: "startTime must be before endTime" }, { status: 422 });
  }

  if (b.isDefault) {
    await prisma.shiftTemplate.updateMany({ where: { clinicId: b.clinicId }, data: { isDefault: false } });
  }

  const shift = await prisma.shiftTemplate.create({
    data: {
      clinicId: b.clinicId, name: b.name, shiftType: b.shiftType,
      startTime: b.startTime, endTime: b.endTime,
      breakMins: b.breakMins ?? 30, isDefault: !!b.isDefault, order: b.order ?? 0,
    },
  });
  return NextResponse.json(shift, { status: 201 });
}
