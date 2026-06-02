import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER", "STOREKEEPER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clinicId = req.nextUrl.searchParams.get("clinicId") ?? undefined;

  // Prisma doesn't support field-to-field comparisons in where, so filter in JS
  const filtered = await prisma.clinicStock.findMany({
    where: clinicId ? { clinicId } : {},
    include: {
      item: { select: { id: true, name: true, sku: true, category: true, unit: true } },
      clinic: { select: { id: true, name: true } },
    },
    orderBy: [{ clinic: { name: "asc" } }, { item: { name: "asc" } }],
  });

  const result = filtered
    .filter((cs) => cs.quantity <= cs.parLevel)
    .map((cs) => ({
      id: cs.id,
      clinic: cs.clinic,
      item: cs.item,
      quantity: cs.quantity,
      parLevel: cs.parLevel,
      shortage: Math.max(0, cs.parLevel - cs.quantity),
    }));

  return NextResponse.json(result);
}
