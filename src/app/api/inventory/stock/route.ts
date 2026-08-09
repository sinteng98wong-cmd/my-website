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
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clinicId = req.nextUrl.searchParams.get("clinicId");
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  // The requested clinic is intersected with the caller's own scope.
  const scope = await clinicScopeFor(role, userId, clinicId);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const stock = await prisma.clinicStock.findMany({
    where: clinicWhere(scope.clinicIds),
    select: { id: true, itemId: true, quantity: true, parLevel: true, avgUnitCost: true },
  });

  return NextResponse.json(stock);
}
