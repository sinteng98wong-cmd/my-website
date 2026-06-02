import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { receivePoolStock, generateDOsFromPoolOrder } from "@/lib/stock";

const StatusSchema = z.object({
  status: z.enum(["CLOSED", "SUBMITTED", "DELIVERED", "DISTRIBUTED", "INVOICED"]),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;

  const pool = await prisma.poolOrder.findUnique({
    where: { id: params.id },
    include: {
      lines: true,
      participants: { include: { items: true } },
    },
  });
  if (!pool) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const { status: newStatus } = parsed.data;
  const current = pool.status;

  // Validate initiating clinic membership for non-SUPER_ADMIN
  const isInitiatingClinicUser = role === "SUPER_ADMIN" ? true : await prisma.userClinic.findFirst({
    where: { userId, clinicId: pool.initiatingClinicId },
  }).then(Boolean);

  // Transition rules
  if (newStatus === "CLOSED") {
    if (!["OPEN", "REOPENED"].includes(current)) {
      return NextResponse.json({ error: `Cannot close from ${current}` }, { status: 400 });
    }
    if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role) || !isInitiatingClinicUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await prisma.poolOrder.update({
      where: { id: params.id },
      data: { status: "CLOSED" },
    });
    return NextResponse.json(updated);
  }

  if (newStatus === "SUBMITTED") {
    if (!["CLOSED", "REOPENED"].includes(current)) {
      return NextResponse.json({ error: `Cannot submit from ${current}` }, { status: 400 });
    }
    if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role) || !isInitiatingClinicUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await prisma.poolOrder.update({
      where: { id: params.id },
      data: { status: "SUBMITTED", approvedById: userId, approvedAt: new Date() },
    });
    return NextResponse.json(updated);
  }

  if (newStatus === "DELIVERED") {
    if (current !== "SUBMITTED") {
      return NextResponse.json({ error: `Cannot mark delivered from ${current}` }, { status: 400 });
    }
    if (!["SUPER_ADMIN", "CLINIC_MANAGER", "STOREKEEPER"].includes(role) || !isInitiatingClinicUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updateData: any = { status: "DELIVERED", deliveredAt: new Date() };

    if (pool.deliveryMode === "CENTRALISED") {
      const stockLines = pool.lines.map((l) => ({ itemId: l.itemId, totalQty: l.totalQty }));
      await receivePoolStock(pool.initiatingClinicId, stockLines);
    }

    const updated = await prisma.poolOrder.update({
      where: { id: params.id },
      data: updateData,
    });
    return NextResponse.json(updated);
  }

  if (newStatus === "DISTRIBUTED") {
    if (current !== "DELIVERED") {
      return NextResponse.json({ error: `Cannot distribute from ${current}` }, { status: 400 });
    }
    if (pool.deliveryMode !== "CENTRALISED") {
      return NextResponse.json({ error: "DISTRIBUTED only applies to CENTRALISED mode" }, { status: 400 });
    }
    if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role) || !isInitiatingClinicUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const dos = await generateDOsFromPoolOrder(params.id, userId);
    return NextResponse.json({ status: "DISTRIBUTED", deliveryOrders: dos.map((d) => ({ id: d.id, doRef: d.doRef })) });
  }

  if (newStatus === "INVOICED") {
    if (!["DELIVERED", "DISTRIBUTED"].includes(current)) {
      return NextResponse.json({ error: `Cannot invoice from ${current}` }, { status: 400 });
    }
    if (current === "DELIVERED" && pool.deliveryMode !== "DIRECT") {
      return NextResponse.json({ error: "DELIVERED→INVOICED only for DIRECT mode" }, { status: 400 });
    }
    if (!["SUPER_ADMIN", "FINANCE"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await prisma.poolOrder.update({
      where: { id: params.id },
      data: { status: "INVOICED" },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid transition" }, { status: 400 });
}
