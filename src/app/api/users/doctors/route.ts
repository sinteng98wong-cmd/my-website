import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** GET — list active doctors (for referral pickers). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const doctors = await prisma.user.findMany({
    where:   { role: "DOCTOR", active: true },
    select:  {
      id: true, name: true,
      userClinics: { select: { clinic: { select: { name: true } } }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    doctors.map((d) => ({ id: d.id, name: d.name, clinicName: d.userClinics[0]?.clinic.name ?? null }))
  );
}
