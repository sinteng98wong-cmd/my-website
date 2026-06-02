import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** GET — all sources including inactive, with patient counts. SUPER_ADMIN only. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sources = await prisma.patientSource.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { patients: true } } },
  });

  return NextResponse.json(
    sources.map((s) => ({
      id: s.id, name: s.name, description: s.description,
      isActive: s.isActive, order: s.order,
      patientCount: s._count.patients,
    }))
  );
}
