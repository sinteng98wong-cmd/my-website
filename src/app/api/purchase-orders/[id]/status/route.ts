import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { receiveStock } from "@/lib/stock";
import {
  checkPoTransition,
  checkReceiptDeltas,
  derivePoStatus,
  isNoOpReceipt,
  isReceiptStatus,
  receiptDelta,
} from "@/lib/stock-receipt";
import { INVENTORY_ROLES, assertClinicAccess } from "@/lib/clinic-access";
import { z } from "zod";

const Schema = z.object({
  status: z.enum(["SUBMITTED", "CONFIRMED", "RECEIVED", "PARTIAL", "INVOICED", "CANCELLED"]),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: { lines: true },
  });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Goods may only be booked in by someone authorized for the receiving clinic.
  const access = await assertClinicAccess(role, userId, po.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body   = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 422 });

  const { status: requested } = parsed.data;

  const transition = checkPoTransition(po.status, requested);
  if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: transition.status });

  // ── Receipt (PARTIAL / RECEIVED) — posts stock ────────────────────────────
  if (isReceiptStatus(requested)) {
    const deltas = checkReceiptDeltas(po.lines);
    if (!deltas.ok) return NextResponse.json({ error: deltas.error }, { status: deltas.status });

    // Nothing new to post — report the derived status instead of double-posting.
    if (isNoOpReceipt(po.lines)) {
      const derived = derivePoStatus(po.lines);
      const updated = po.status === derived
        ? po
        : await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: derived } });
      return NextResponse.json({ ...updated, posted: 0, alreadyReceived: true });
    }

    const toPost = po.lines
      .map((l) => ({ line: l, delta: receiptDelta(l) }))
      .filter((x) => x.delta > 0);

    // Stock movement, posted baseline and status all commit together.
    const updated = await prisma.$transaction(async (tx) => {
      await receiveStock(
        po.clinicId,
        toPost.map(({ line, delta }) => ({
          itemId:      line.itemId,
          receivedQty: delta,
          unitCost:    Number(line.unitCost),
          batchNumber: line.batchNumber ?? null,
          expiryDate:  line.expiryDate  ?? null,
          doLineId:    null,
        })),
        tx
      );

      for (const { line, delta } of toPost) {
        await tx.pOLine.update({
          where: { id: line.id },
          data:  { postedQty: line.postedQty + delta },
        });
      }

      // Derived from the lines, never taken from the client: a PO is RECEIVED
      // only when every line has been posted in full.
      const posted = po.lines.map((l) => ({
        quantity:  l.quantity,
        postedQty: l.postedQty + (toPost.find((x) => x.line.id === l.id)?.delta ?? 0),
      }));

      return tx.purchaseOrder.update({
        where: { id: po.id },
        data:  { status: derivePoStatus(posted), receivedAt: new Date() },
      });
    });

    return NextResponse.json({
      ...updated,
      posted: toPost.reduce((s, x) => s + x.delta, 0),
    });
  }

  // ── Non-receipt transitions ───────────────────────────────────────────────
  const updated = await prisma.purchaseOrder.update({
    where: { id: params.id },
    data: {
      status: requested,
      ...(requested === "CONFIRMED" ? { confirmedAt: new Date() } : {}),
    },
  });
  return NextResponse.json(updated);
}
