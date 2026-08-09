/**
 * GET /api/inventory/expiring?clinicId=&days=
 *
 * Batches already expired or expiring within the window, with the value at
 * risk. Feeds the expiry write-off workflow.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, clinicScopeFor, clinicWhere } from "@/lib/clinic-access";
import { isExpired } from "@/lib/stock-issue";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const scope = await clinicScopeFor(role, userId, sp.get("clinicId"));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const days = Math.min(Number(sp.get("days")) || 90, 365);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + days);

  const batches = await prisma.stockBatch.findMany({
    where: {
      ...clinicWhere(scope.clinicIds),
      remainingQty: { gt: 0 },
      expiryDate: { not: null, lte: horizon },
    },
    include: {
      item:   { select: { id: true, sku: true, name: true, unit: true } },
      clinic: { select: { id: true, name: true } },
    },
    orderBy: [{ expiryDate: "asc" }],
    take: 500,
  });

  // Value at risk uses the clinic's current weighted-average cost.
  const keys = batches.map((b) => ({ clinicId: b.clinicId, itemId: b.itemId }));
  const stocks = keys.length
    ? await prisma.clinicStock.findMany({
        where: { OR: keys },
        select: { clinicId: true, itemId: true, avgUnitCost: true },
      })
    : [];
  const costOf = new Map(stocks.map((s) => [`${s.clinicId}:${s.itemId}`, Number(s.avgUnitCost ?? 0)]));

  const now = new Date();
  return NextResponse.json(
    batches.map((b) => {
      const cost = costOf.get(`${b.clinicId}:${b.itemId}`) ?? 0;
      return {
        id: b.id,
        clinic: b.clinic,
        item: b.item,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        remainingQty: b.remainingQty,
        avgUnitCost: cost,
        estimatedValue: Math.round(b.remainingQty * cost * 100) / 100,
        expired: isExpired(b, now),
      };
    })
  );
}
