import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({
  lineId:      z.string().min(1),
  receivedQty: z.number().int().nonnegative(),
  batchNumber: z.string().optional(),
  expiryDate:  z.string().optional(), // ISO date string
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER", "STOREKEEPER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const order = await prisma.deliveryOrder.findUnique({ where: { id: params.id } });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.status !== "IN_TRANSIT") {
    return NextResponse.json({ error: "Can only update received qty when IN_TRANSIT" }, { status: 400 });
  }

  if (role !== "SUPER_ADMIN") {
    const uc = await prisma.userClinic.findFirst({ where: { userId, clinicId: order.toClinicId } });
    if (!uc) return NextResponse.json({ error: "Forbidden: not from receiving clinic" }, { status: 403 });
  }

  const body  = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const { lineId, receivedQty, batchNumber, expiryDate } = parsed.data;

  const line = await prisma.dOLine.findFirst({ where: { id: lineId, doId: params.id } });
  if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });

  const updated = await prisma.dOLine.update({
    where: { id: lineId },
    data: {
      receivedQty,
      batchNumber:  batchNumber  ?? null,
      expiryDate:   expiryDate   ? new Date(expiryDate) : null,
    },
  });

  return NextResponse.json(updated);
}
