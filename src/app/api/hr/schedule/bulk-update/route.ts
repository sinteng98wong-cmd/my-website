import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { clinicId, staffProfileId, updates } = await req.json();
  if (!clinicId || !staffProfileId || !Array.isArray(updates)) {
    return NextResponse.json({ error: "clinicId, staffProfileId and updates[] required" }, { status: 422 });
  }

  let upserted = 0;
  for (const u of updates) {
    if (!u.date) continue;
    const date = new Date(u.date);
    const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    await prisma.staffSchedule.upsert({
      where: { staffProfileId_clinicId_date: { staffProfileId, clinicId, date: day } },
      update: {
        ...(u.shiftTemplateId !== undefined ? { shiftTemplateId: u.shiftTemplateId || null } : {}),
        ...(u.isOff !== undefined ? { isOff: u.isOff } : {}),
        ...(u.notes !== undefined ? { notes: u.notes || null } : {}),
      },
      create: {
        staffProfileId, clinicId, date: day,
        shiftTemplateId: u.shiftTemplateId || null,
        isOff: u.isOff ?? false,
        notes: u.notes || null,
      },
    });
    upserted++;
  }

  return NextResponse.json({ upserted });
}
