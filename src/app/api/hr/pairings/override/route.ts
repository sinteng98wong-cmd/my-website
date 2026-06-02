import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isNursePaired } from "@/lib/pairing";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { clinicId, dentistProfileId, nurseProfileId, date, shiftTemplateId, notes } = await req.json();
  if (!clinicId || !dentistProfileId || !nurseProfileId || !date) {
    return NextResponse.json({ error: "clinicId, dentistProfileId, nurseProfileId, date required" }, { status: 422 });
  }
  const day = new Date(date);

  const warnings: string[] = [];

  // nurse already paired that date/shift?
  if (await isNursePaired(nurseProfileId, clinicId, day, shiftTemplateId || undefined)) {
    warnings.push("This nurse is already paired with another dentist on that date.");
  }
  // nurse on leave?
  const onLeave = await prisma.leaveApplication.findFirst({
    where: { staffProfileId: nurseProfileId, status: "APPROVED", startDate: { lte: day }, endDate: { gte: day } },
  });
  if (onLeave) warnings.push("This nurse is on approved leave that day.");

  const pairing = await prisma.dentistNursePairing.create({
    data: {
      clinicId, dentistProfileId, nurseProfileId,
      date: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())),
      shiftTemplateId: shiftTemplateId || null,
      isDefault: false,
      notes: notes || null,
    },
  });

  return NextResponse.json({ pairing, warnings }, { status: 201 });
}
