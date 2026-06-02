import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { receiveStock } from "@/lib/stock";
import { z } from "zod";

const Schema = z.object({
  status: z.enum(["SUBMITTED", "CONFIRMED", "RECEIVED", "PARTIAL", "INVOICED", "CANCELLED"]),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "STOREKEEPER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: { lines: true },
  });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body   = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 422 });

  const { status: newStatus } = parsed.data;

  // SUBMITTED → CONFIRMED
  if (newStatus === "CONFIRMED") {
    const updated = await prisma.purchaseOrder.update({
      where: { id: params.id },
      data:  { status: "CONFIRMED", confirmedAt: new Date() },
    });
    return NextResponse.json(updated);
  }

  // * → RECEIVED / PARTIAL — commit stock
  if (newStatus === "RECEIVED" || newStatus === "PARTIAL") {
    await receiveStock(
      po.clinicId,
      po.lines.map((l) => ({
        itemId:      l.itemId,
        receivedQty: l.receivedQty ?? l.quantity,
        unitCost:    Number(l.unitCost),
        batchNumber: l.batchNumber ?? null,
        expiryDate:  l.expiryDate  ?? null,
        doLineId:    null,
      }))
    );
    const updated = await prisma.purchaseOrder.update({
      where: { id: params.id },
      data:  { status: newStatus, receivedAt: new Date() },
    });
    return NextResponse.json(updated);
  }

  // Any valid transition
  const updated = await prisma.purchaseOrder.update({
    where: { id: params.id },
    data:  { status: newStatus },
  });
  return NextResponse.json(updated);
}
