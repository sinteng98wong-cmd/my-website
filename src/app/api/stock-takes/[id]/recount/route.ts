/**
 * POST /api/stock-takes/[id]/recount — refresh the system snapshot.
 *
 * Used after stock has moved since the count. The take returns to DRAFT with
 * current system figures so the physical count can be redone against reality.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, assertClinicAccess } from "@/lib/clinic-access";
import { isEditable } from "@/lib/stock-take";
import { refreshStockTakeSnapshot } from "@/services/stock-take.service";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const take = await prisma.stockTake.findUnique({
    where: { id: params.id },
    select: { id: true, clinicId: true, status: true },
  });
  if (!take) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await assertClinicAccess(role, userId, take.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (!isEditable(take.status))
    return NextResponse.json({ error: `A ${take.status} stock take cannot be recounted` }, { status: 409 });

  await refreshStockTakeSnapshot(take.id);
  const updated = await prisma.stockTake.update({ where: { id: take.id }, data: { status: "DRAFT" } });

  return NextResponse.json({ ok: true, status: updated.status });
}
