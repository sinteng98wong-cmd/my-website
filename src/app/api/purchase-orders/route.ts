import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generatePurchaseOrderRef } from "@/lib/ref-generator";

const ALLOWED = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "STOREKEEPER"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!ALLOWED.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status");
  const supplierId = req.nextUrl.searchParams.get("supplierId");

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      ...(status     && { status: status as any }),
      ...(supplierId && { supplierId }),
    },
    include: {
      clinic:   { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      raisedBy: { select: { id: true, name: true } },
      lines:    { select: { quantity: true, receivedQty: true, unitCost: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(orders.map((o) => ({
    ...o,
    totalValue: o.lines.reduce((s, l) => s + l.quantity * Number(l.unitCost), 0),
  })));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "STOREKEEPER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { clinicId, supplierId, expectedDate, notes, lines } = body;

  if (!clinicId || !supplierId || !lines?.length) {
    return NextResponse.json({ error: "clinicId, supplierId and at least one line are required" }, { status: 422 });
  }

  const poRef = await generatePurchaseOrderRef();

  const po = await prisma.purchaseOrder.create({
    data: {
      poRef,
      clinicId,
      supplierId,
      status:      "DRAFT",
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      notes:        notes || null,
      raisedById:   userId,
      lines: {
        create: lines.map((l: any) => ({
          itemId:   l.itemId,
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
        })),
      },
    },
    include: {
      clinic:   { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      lines:    { include: { item: { select: { id: true, name: true, sku: true, unit: true } } } },
    },
  });

  return NextResponse.json(po, { status: 201 });
}
