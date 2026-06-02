import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({
  participantId: z.string().min(1),
  itemId: z.string().min(1),
  approvedQty: z.number().int().nonnegative(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;

  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pool = await prisma.poolOrder.findUnique({ where: { id: params.id } });
  if (!pool) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pool.status !== "DELIVERED" || pool.deliveryMode !== "CENTRALISED") {
    return NextResponse.json({ error: "Only available for DELIVERED CENTRALISED pool orders" }, { status: 400 });
  }

  if (role === "CLINIC_MANAGER") {
    const uc = await prisma.userClinic.findFirst({ where: { userId, clinicId: pool.initiatingClinicId } });
    if (!uc) return NextResponse.json({ error: "Forbidden: not from initiating clinic" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const { participantId, itemId, approvedQty } = parsed.data;

  const line = await prisma.poolParticipantLine.findFirst({
    where: { participantId, itemId },
  });
  if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });

  const updated = await prisma.poolParticipantLine.update({
    where: { id: line.id },
    data: { approvedQty },
  });

  return NextResponse.json(updated);
}
