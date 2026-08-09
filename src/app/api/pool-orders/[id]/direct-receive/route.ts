import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { receiveStock } from "@/lib/stock";
import { checkPoolDirectReceive } from "@/lib/stock-receipt";

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
    include: { participants: { include: { items: { select: { itemId: true } } } } },
  });
  if (!pool) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const { clinicId, lines } = parsed.data;
  const participant = pool.participants.find((p) => p.clinicId === clinicId) ?? null;

  const userClinicIds = role === "SUPER_ADMIN"
    ? []
    : (await prisma.userClinic.findMany({ where: { userId }, select: { clinicId: true } })).map((uc) => uc.clinicId);

  const guard = checkPoolDirectReceive({
    poolStatus:         pool.status,
    deliveryMode:       pool.deliveryMode,
    participant:        participant ? { clinicId: participant.clinicId, receivedAt: participant.receivedAt } : null,
    participantItemIds: participant?.items.map((i) => i.itemId) ?? [],
    requestedItemIds:   lines.map((l) => l.itemId),
    role,
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

    await receiveStock(clinicId, lines, tx);
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
