import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { clinicId, dentistProfileId, nurseProfileId, notes } = await req.json();
  if (!clinicId || !dentistProfileId || !nurseProfileId) {
    return NextResponse.json({ error: "clinicId, dentistProfileId, nurseProfileId required" }, { status: 422 });
  }

  const [dentist, nurse] = await Promise.all([
    prisma.staffProfile.findUnique({ where: { id: dentistProfileId }, select: { clinicId: true, user: { select: { role: true } } } }),
    prisma.staffProfile.findUnique({ where: { id: nurseProfileId }, select: { clinicId: true, user: { select: { role: true } } } }),
  ]);
  if (dentist?.user.role !== "DOCTOR") return NextResponse.json({ error: "Selected dentist is not a DOCTOR" }, { status: 422 });
  if (nurse?.user.role !== "NURSE")   return NextResponse.json({ error: "Selected nurse is not a NURSE" }, { status: 422 });

  // nurse not already default-paired with another dentist
  const clash = await prisma.dentistNursePairing.findFirst({
    where: { clinicId, nurseProfileId, isDefault: true, date: null, dentistProfileId: { not: dentistProfileId } },
  });
  if (clash) return NextResponse.json({ error: "This nurse is already the default pair for another dentist" }, { status: 422 });

  // upsert: one default per dentist
  const existing = await prisma.dentistNursePairing.findFirst({ where: { clinicId, dentistProfileId, isDefault: true, date: null } });
  const pairing = existing
    ? await prisma.dentistNursePairing.update({ where: { id: existing.id }, data: { nurseProfileId, notes: notes || null } })
    : await prisma.dentistNursePairing.create({ data: { clinicId, dentistProfileId, nurseProfileId, isDefault: true, notes: notes || null } });

  return NextResponse.json(pairing, { status: 201 });
}
