import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { receiveStock } from "@/lib/stock";

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
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER", "STOREKEEPER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pool = await prisma.poolOrder.findUnique({
    where: { id: params.id },
    include: { participants: true },
  });
  if (!pool) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pool.status !== "DELIVERED" || pool.deliveryMode !== "DIRECT") {
    return NextResponse.json({ error: "Only available for DELIVERED DIRECT pool orders" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const { clinicId, lines } = parsed.data;

  const participant = pool.participants.find((p) => p.clinicId === clinicId);
  if (!participant) return NextResponse.json({ error: "Clinic is not a participant" }, { status: 400 });

  await receiveStock(clinicId, lines);

  const updatedParticipant = await prisma.poolParticipant.update({
    where: { id: participant.id },
    data: { receivedAt: new Date() },
  });

  // Check if all participants have received
  const allParticipants = await prisma.poolParticipant.findMany({ where: { poolId: params.id } });
  const allReceived = allParticipants.every((p) => p.receivedAt !== null);
  if (allReceived) {
    await prisma.poolOrder.update({ where: { id: params.id }, data: { status: "INVOICED" } });
  }

  return NextResponse.json({ participant: updatedParticipant, allReceived });
}
