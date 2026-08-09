import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { deductStock, receiveStock } from "@/lib/stock";
import { postingKeys } from "@/lib/stock-ledger";

const Schema = z.object({
  status: z.enum(["PENDING", "APPROVED", "DRAFT", "IN_TRANSIT", "RECEIVED", "INVOICED"]),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;

  const order = await prisma.deliveryOrder.findUnique({
    where: { id: params.id },
    include: {
      lines: { include: { batchAllocations: true } },
      fromClinic: { include: { entity: { select: { id: true } } } },
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const { status: newStatus } = parsed.data;
  const current = order.status;

  const isFromClinicUser = role === "SUPER_ADMIN" ? true : await prisma.userClinic.findFirst({
    where: { userId, clinicId: order.fromClinicId },
  }).then(Boolean);

  const isToClinicUser = role === "SUPER_ADMIN" ? true : await prisma.userClinic.findFirst({
    where: { userId, clinicId: order.toClinicId },
  }).then(Boolean);

  // DRAFT → PENDING
  if (newStatus === "PENDING") {
    if (current !== "DRAFT") return NextResponse.json({ error: `Cannot submit from ${current}` }, { status: 400 });
    if (!["SUPER_ADMIN", "CLINIC_MANAGER", "STOREKEEPER"].includes(role) || !isFromClinicUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await prisma.deliveryOrder.update({ where: { id: params.id }, data: { status: "PENDING" } });
    return NextResponse.json(updated);
  }

  // PENDING → APPROVED
  if (newStatus === "APPROVED") {
    if (current !== "PENDING") return NextResponse.json({ error: `Cannot approve from ${current}` }, { status: 400 });
    if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role) || !isFromClinicUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await prisma.deliveryOrder.update({
      where: { id: params.id },
      data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() },
    });
    return NextResponse.json(updated);
  }

  // PENDING → DRAFT (reject)
  if (newStatus === "DRAFT" && current === "PENDING") {
    if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role) || !isFromClinicUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await prisma.deliveryOrder.update({ where: { id: params.id }, data: { status: "DRAFT" } });
    return NextResponse.json(updated);
  }

  // APPROVED → IN_TRANSIT
  if (newStatus === "IN_TRANSIT") {
    if (current !== "APPROVED") return NextResponse.json({ error: `Cannot dispatch from ${current}` }, { status: 400 });
    if (!["SUPER_ADMIN", "CLINIC_MANAGER", "STOREKEEPER"].includes(role) || !isFromClinicUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Claim the transition inside the same transaction as the stock movement,
    // so a double submit cannot deduct the goods twice.
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.deliveryOrder.updateMany({
        where: { id: params.id, status: "APPROVED" },
        data:  { status: "IN_TRANSIT", dispatchedAt: new Date() },
      });
      if (claimed.count === 0) return null;
      const outcomes = await deductStock(
        order.fromClinicId,
        order.lines.map((l) => ({
          itemId: l.itemId, quantity: l.quantity,
          postingKey: postingKeys.doDispatch(l.id), sourceLineId: l.id,
        })),
        {
          type: "TRANSFER_OUT", sourceType: "DELIVERY_ORDER", sourceId: order.id,
          reference: order.doRef, userId,
        },
        tx
      );
      // Record which physical batches actually left, so the receiving clinic
      // recreates the same identities rather than inventing new ones. Written
      // inside the claimed transition, so it happens exactly once.
      for (const o of outcomes) {
        for (const a of o.allocations) {
          await tx.dOLineBatch.create({
            data: {
              doLineId:      o.sourceLineId!,
              sourceBatchId: a.batchId,
              batchNumber:   a.batchNumber,
              expiryDate:    a.expiryDate,
              quantity:      a.quantity,
            },
          });
        }
      }
      return tx.deliveryOrder.findUnique({ where: { id: params.id } });
    });
    if (!updated) return NextResponse.json({ error: "Delivery order is no longer awaiting dispatch" }, { status: 409 });
    return NextResponse.json(updated);
  }

  // IN_TRANSIT → RECEIVED
  if (newStatus === "RECEIVED") {
    if (current !== "IN_TRANSIT") return NextResponse.json({ error: `Cannot receive from ${current}` }, { status: 400 });
    if (!["SUPER_ADMIN", "CLINIC_MANAGER", "STOREKEEPER"].includes(role) || !isToClinicUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // The full dispatched quantity is received in, then any shortfall is
    // posted as an explicit variance owned by the receiving branch. The
    // difference is recorded, never silently discarded.
    //
    // Batch identity is carried, not recreated from scratch: whatever the
    // source clinic depleted at dispatch is what arrives here. A line that
    // moved unbatched stock stays unbatched. Only when dispatch recorded no
    // allocation at all does the manually entered batch on the line apply.
    const carried = (l: (typeof order.lines)[number]) => {
      const identified = l.batchAllocations.filter((a) => a.batchNumber || a.expiryDate);
      if (!identified.length) return undefined;
      return identified.map((a) => ({
        batchNumber: a.batchNumber,
        expiryDate:  a.expiryDate,
        quantity:    a.quantity,
      }));
    };

    const receiveLines = order.lines.map((l) => ({
      itemId:      l.itemId,
      receivedQty: l.quantity,
      unitCost:    Number(l.unitCost),
      batchNumber: l.batchNumber ?? null,
      expiryDate:  l.expiryDate  ?? null,
      batches:     carried(l),
      doLineId:    l.id,
      postingKey:  postingKeys.doReceipt(l.id),
      sourceLineId: l.id,
    }));
    const varianceLines = order.lines
      .filter((l) => l.receivedQty !== null && l.receivedQty < l.quantity)
      .map((l) => ({
        itemId:   l.itemId,
        quantity: l.quantity - (l.receivedQty ?? l.quantity),
        postingKey: postingKeys.doVariance(l.id),
        sourceLineId: l.id,
        note: `Short delivery: dispatched ${l.quantity}, received ${l.receivedQty}`,
      }));
    const hasDiscrepancy = order.lines.some(
      (l) => l.receivedQty !== null && l.receivedQty !== l.quantity
    );

    // Same one-shot claim as dispatch: the receipt posts stock exactly once.
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.deliveryOrder.updateMany({
        where: { id: params.id, status: "IN_TRANSIT" },
        data:  { status: "RECEIVED", receivedAt: new Date() },
      });
      if (claimed.count === 0) return null;
      const source = {
        sourceType: "DELIVERY_ORDER" as const, sourceId: order.id,
        reference: order.doRef, userId,
      };
      await receiveStock(order.toClinicId, receiveLines, { ...source, type: "TRANSFER_IN" }, tx);
      if (varianceLines.length) {
        await deductStock(order.toClinicId, varianceLines, { ...source, type: "TRANSFER_VARIANCE_OUT" }, tx);
      }
      return tx.deliveryOrder.findUnique({ where: { id: params.id } });
    });
    if (!updated) return NextResponse.json({ error: "Delivery order is no longer in transit" }, { status: 409 });
    return NextResponse.json({ ...updated, hasDiscrepancy });
  }

  // RECEIVED → INVOICED
  if (newStatus === "INVOICED") {
    if (current !== "RECEIVED") return NextResponse.json({ error: `Cannot invoice from ${current}` }, { status: 400 });
    if (!["SUPER_ADMIN", "FINANCE"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await prisma.deliveryOrder.update({ where: { id: params.id }, data: { status: "INVOICED" } });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid transition" }, { status: 400 });
}
