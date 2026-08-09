import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { receiveStock } from "@/lib/stock";
import { checkPoolDirectReceive } from "@/lib/stock-receipt";
import { postingKeys } from "@/lib/stock-ledger";
import { getUserClinicIds, hasGlobalClinicScope } from "@/lib/clinic-access";

const Schema = z.object({
  clinicId: z.string().min(1),
  lines: z.array(z.object({
    itemId: z.string().min(1),
    receivedQty: z.number().int().positive(),
  })).min(1),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER", "STOREKEEPER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pool = await prisma.poolOrder.findUnique({
    where: { id: params.id },
    include: {
      lines: { select: { itemId: true, unitCost: true, actualUnitCost: true } },
      participants: { include: { items: { select: { itemId: true, unitCost: true } } } },
    },
  });
  if (!pool) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const { clinicId, lines } = parsed.data;
  const participant = pool.participants.find((p) => p.clinicId === clinicId) ?? null;

  const userClinicIds = hasGlobalClinicScope(role) ? [] : await getUserClinicIds(userId);

  const guard = checkPoolDirectReceive({
    poolStatus:         pool.status,
    deliveryMode:       pool.deliveryMode,
    participant:        participant ? { clinicId: participant.clinicId, receivedAt: participant.receivedAt } : null,
    participantItemIds: participant?.items.map((i) => i.itemId) ?? [],
    requestedItemIds:   lines.map((l) => l.itemId),
    hasGlobalScope: hasGlobalClinicScope(role),
    userClinicIds,
  });
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  // Stock movement and the received marker commit together, and the marker is
  // written conditionally so two concurrent receipts cannot both post.
  const posted = await prisma.$transaction(async (tx) => {
    const claimed = await tx.poolParticipant.updateMany({
      where: { id: participant!.id, receivedAt: null },
      data:  { receivedAt: new Date() },
    });
    if (claimed.count === 0) return false;

    // Actual invoiced cost where the pool has been reconciled, otherwise the
    // cost the branch ordered at — never zero.
    const costOf = (itemId: string) => {
      const poolLine = pool.lines.find((l) => l.itemId === itemId);
      const partLine = participant!.items.find((i) => i.itemId === itemId) as { unitCost?: unknown } | undefined;
      return Number(poolLine?.actualUnitCost ?? poolLine?.unitCost ?? partLine?.unitCost ?? 0);
    };

    await receiveStock(
      clinicId,
      lines.map((l) => ({
        itemId:      l.itemId,
        receivedQty: l.receivedQty,
        unitCost:    costOf(l.itemId),
        postingKey:  postingKeys.poolDirect(participant!.id, l.itemId),
        sourceLineId: participant!.id,
      })),
      {
        type: "RECEIPT_POOL", sourceType: "POOL_ORDER", sourceId: pool.id,
        reference: pool.poRef, userId,
      },
      tx
    );
    return true;
  });

  if (!posted)
    return NextResponse.json({ error: "This clinic has already received its share of the pool order" }, { status: 409 });

  const updatedParticipant = await prisma.poolParticipant.findUnique({ where: { id: participant!.id } });

  // Check if all participants have received
  const allParticipants = await prisma.poolParticipant.findMany({ where: { poolId: params.id } });
  const allReceived = allParticipants.every((p) => p.receivedAt !== null);
  if (allReceived) {
    await prisma.poolOrder.update({ where: { id: params.id }, data: { status: "INVOICED" } });
  }

  return NextResponse.json({ participant: updatedParticipant, allReceived });
}
