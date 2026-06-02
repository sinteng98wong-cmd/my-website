import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectivePairing } from "@/lib/pairing";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const clinicId = sp.get("clinicId");
  const dateStr = sp.get("date");
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 422 });

  const dentists = await prisma.staffProfile.findMany({
    where: { clinicId, user: { role: "DOCTOR", active: true } },
    select: { id: true, user: { select: { id: true, name: true } } },
  });

  const out = [];
  for (const d of dentists) {
    const def = await prisma.dentistNursePairing.findFirst({
      where: { clinicId, dentistProfileId: d.id, isDefault: true, date: null },
      include: { nurse: { select: { id: true, user: { select: { id: true, name: true } } } } },
    });

    let dateOverride = undefined;
    if (dateStr) {
      const eff = await getEffectivePairing(d.id, clinicId, new Date(dateStr));
      if (eff && !eff.isDefault) {
        const nurse = await prisma.staffProfile.findUnique({ where: { id: eff.nurseProfileId }, select: { id: true, user: { select: { name: true } } } });
        dateOverride = { nurse, date: eff.date, shiftTemplateId: eff.shiftTemplateId, pairingId: eff.id };
      }
    }

    out.push({
      dentist: { id: d.user.id, name: d.user.name, profileId: d.id },
      defaultNurse: def ? { id: def.nurse.user.id, name: def.nurse.user.name, profileId: def.nurse.id, pairingId: def.id, since: def.createdAt } : null,
      dateOverride,
    });
  }

  return NextResponse.json(out);
}
