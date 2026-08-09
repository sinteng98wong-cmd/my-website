import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertClinicAccess } from "@/lib/clinic-access";
import { checkSubmittable, checkTransition, totalsOf } from "@/lib/stock-opening";
import { itemsWithExistingMovements } from "@/services/stock-opening.service";

/** Branch submits the counted figures for review. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;

  const doc = await prisma.openingBalance.findUnique({
    where: { id: params.id },
    include: { lines: { include: { item: { select: { name: true } } } } },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await assertClinicAccess(role, userId, doc.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const transition = checkTransition(doc.status, "SUBMITTED");
  if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: transition.status });

  const lines = doc.lines.map((l) => ({
    itemId: l.itemId,
    quantity: l.quantity,
    unitCost: l.unitCost === null ? null : Number(l.unitCost),
  }));
  const names = new Map(doc.lines.map((l) => [l.itemId, l.item.name]));

  const guard = checkSubmittable(lines, names);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  // Surfaced at submission rather than only at approval, so the branch finds
  // out before a reviewer is asked to sign something that cannot post.
  const postable = lines.filter((l) => (l.quantity ?? 0) > 0);
  const clashes  = await itemsWithExistingMovements(doc.clinicId, postable.map((l) => l.itemId));
  if (clashes.length)
    return NextResponse.json(
      {
        error:
          `${clashes.length} item(s) already have stock movements at this clinic, so an opening ` +
          `balance cannot establish their first position: ` +
          `${clashes.map((id) => names.get(id) ?? id).slice(0, 5).join(", ")}. ` +
          `Remove them from this document and use a stock adjustment instead.`,
      },
      { status: 409 }
    );

  const totals = totalsOf(lines);
  const updated = await prisma.openingBalance.update({
    where: { id: doc.id },
    data: {
      status: "SUBMITTED", submittedById: userId, submittedAt: new Date(),
      totalQuantity: totals.quantity, totalValue: totals.value,
    },
  });
  return NextResponse.json({ ok: true, status: updated.status, ...totals });
}
