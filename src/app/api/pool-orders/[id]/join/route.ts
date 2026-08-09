import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { assertClinicAccess } from "@/lib/clinic-access";

const JoinSchema = z.object({
  clinicId: z.string().min(1),
  items: z.array(z.object({
    itemId: z.string().min(1),
    requestedQty: z.number().int().positive(),
    unitCost: z.number().nonnegative(),
  })).min(1),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER", "STOREKEEPER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pool = await prisma.poolOrder.findUnique({ where: { id: params.id } });
  if (!pool) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["OPEN", "REOPENED"].includes(pool.status)) {
    return NextResponse.json({ error: "Pool order is not accepting participants" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = JoinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const d = parsed.data;
  const userId = (session.user as any).id as string;

  // The clinic being committed to this pool comes from the request body, so a
  // caller may only add a clinic they are authorized for.
  const access = await assertClinicAccess(role, userId, d.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const requestedAmount = d.items.reduce((s, i) => s + i.requestedQty * i.unitCost, 0);

  const existing = await prisma.poolParticipant.findUnique({
    where: { poolId_clinicId: { poolId: params.id, clinicId: d.clinicId } },
    include: { items: true },
  });

  let participant;
  if (existing) {
    // Delete existing lines and recreate
    await prisma.poolParticipantLine.deleteMany({ where: { participantId: existing.id } });
    participant = await prisma.poolParticipant.update({
      where: { id: existing.id },
      data: {
        requestedAmount,
        joinedById: userId,
        items: {
          create: d.items.map((item) => ({
            itemId: item.itemId,
            requestedQty: item.requestedQty,
            unitCost: item.unitCost,
          })),
        },
      },
      include: { items: true },
    });
  } else {
    participant = await prisma.poolParticipant.create({
      data: {
        poolId: params.id,
        clinicId: d.clinicId,
        requestedAmount,
        joinedById: userId,
        items: {
          create: d.items.map((item) => ({
            itemId: item.itemId,
            requestedQty: item.requestedQty,
            unitCost: item.unitCost,
          })),
        },
      },
      include: { items: true },
    });
  }

  // Recalculate PoolOrderLine totalQty for each item
  const allParticipants = await prisma.poolParticipant.findMany({
    where: { poolId: params.id },
    include: { items: true },
  });

  const itemTotals = new Map<string, number>();
  for (const p of allParticipants) {
    for (const line of p.items) {
      itemTotals.set(line.itemId, (itemTotals.get(line.itemId) ?? 0) + line.requestedQty);
    }
  }

  for (const [itemId, totalQty] of itemTotals) {
    await prisma.poolOrderLine.updateMany({
      where: { poolId: params.id, itemId },
      data: { totalQty },
    });
  }

  return NextResponse.json(participant, { status: existing ? 200 : 201 });
}
