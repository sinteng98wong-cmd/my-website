import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const clinicId = req.nextUrl.searchParams.get("clinicId");
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });

  const batches = await prisma.stockBatch.findMany({
    where: { clinicId, remainingQty: { gt: 0 } },
    include: {
      item:     { select: { id: true, name: true, sku: true, unit: true, category: true } },
      supplier: { select: { id: true, name: true } },
    },
    orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
  });

  return NextResponse.json(batches);
}

/** POST — manually register a batch for existing stock (traceability only, does not change ClinicStock qty) */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "STOREKEEPER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { clinicId, itemId, batchNumber, expiryDate, quantity, unitCost, supplierId, receivedAt } = body;

  if (!clinicId || !itemId || !batchNumber || !quantity) {
    return NextResponse.json({ error: "clinicId, itemId, batchNumber and quantity are required" }, { status: 422 });
  }

  // Verify the clinic actually has this item in stock
  const stock = await prisma.clinicStock.findUnique({
    where: { clinicId_itemId: { clinicId, itemId } },
  });
  if (!stock) return NextResponse.json({ error: "Item not found in clinic stock" }, { status: 404 });

  const batch = await prisma.stockBatch.create({
    data: {
      clinicId,
      itemId,
      supplierId:  supplierId  || null,
      batchNumber,
      expiryDate:  expiryDate  ? new Date(expiryDate) : null,
      quantity:    Number(quantity),
      remainingQty: Number(quantity),
      unitCost:    unitCost ? Number(unitCost) : (stock.avgUnitCost ?? 0),
      receivedAt:  receivedAt ? new Date(receivedAt) : new Date(),
    },
    include: {
      item:     { select: { id: true, name: true, sku: true, unit: true, category: true } },
      supplier: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(batch, { status: 201 });
}
