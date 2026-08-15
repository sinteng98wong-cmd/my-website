import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, clinicScopeFor, clinicWhere } from "@/lib/clinic-access";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clinicId = req.nextUrl.searchParams.get("clinicId") ?? undefined;

  // An unfiltered request returns the caller's own clinics, not every clinic.
  const scope = await clinicScopeFor(role, userId, clinicId);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  // Prisma doesn't support field-to-field comparisons in where, so filter in JS
  const filtered = await prisma.clinicStock.findMany({
    where: clinicWhere(scope.clinicIds),
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
