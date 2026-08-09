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

  const scope = await clinicScopeFor(role, userId, clinicId);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const batches = await prisma.stockBatch.findMany({
    where: { ...clinicWhere(scope.clinicIds), remainingQty: { gt: 0 } },
    include: {
      item:     { select: { id: true, name: true, sku: true, unit: true, category: true } },
      supplier: { select: { id: true, name: true } },
    },
    orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
  });

  return NextResponse.json(batches);
}

/**
 * POST — retired.
 *
 * A batch must originate from a legitimate receipt (GRN), so that every batch
 * is explained by a stock movement in the ledger. The old endpoint created
 * batches against stock with no receipt behind them, which the ledger cannot
 * account for.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Standalone batch registration has been retired. Batches are created by receiving " +
        "goods against a Purchase Order, Delivery Order or Pool Order so that every batch is " +
        "backed by a stock movement.",
    },
    { status: 410 }
  );
}
