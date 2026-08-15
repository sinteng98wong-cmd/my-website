/** POST /api/stock-takes/[id]/submit — hand the count to the PIC for review. */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, assertClinicAccess } from "@/lib/clinic-access";
import { checkSubmittable, checkTransition, totalsOf } from "@/lib/stock-take";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const take = await prisma.stockTake.findUnique({ where: { id: params.id }, include: { lines: true } });
  if (!take) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await assertClinicAccess(role, userId, take.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const transition = checkTransition(take.status, "SUBMITTED");
  if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: transition.status });

  const lines = take.lines.map((l) => ({
    id: l.id, systemQty: l.systemQty, physicalQty: l.physicalQty,
    avgUnitCost: Number(l.avgUnitCost), reason: l.reason,
  }));

  const submittable = checkSubmittable(lines);
  if (!submittable.ok) return NextResponse.json({ error: submittable.error }, { status: submittable.status });

  const totals = totalsOf(lines);
  const updated = await prisma.stockTake.update({
    where: { id: take.id },
    data: {
      status: "SUBMITTED",
      submittedById: userId,
      submittedAt: new Date(),
      totalVarianceQty: totals.varianceQty,
      totalVarianceValue: totals.varianceValue.toFixed(2),
    },
  });

  return NextResponse.json({ ok: true, status: updated.status, ...totals });
}
