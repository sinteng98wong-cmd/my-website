import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// ── Internal DO invoice ────────────────────────────────────────────────────
const InternalSchema = z.object({
  source:     z.literal("INTERNAL"),
  invoiceRef: z.string().min(1),
  month:      z.string().regex(/^\d{4}-\d{2}$/),
  toClinicId: z.string().min(1),
  doIds:      z.array(z.string().min(1)).min(1),
  sst:        z.number().nonnegative().default(0),
  // optional per-line price overrides: lineId → invoiced unit cost
  lineUpdates: z.array(z.object({
    lineId:          z.string(),
    invoicedUnitCost: z.number().nonnegative(),
  })).optional(),
});

// ── Supplier PO invoice ────────────────────────────────────────────────────
const SupplierSchema = z.object({
  source:          z.literal("SUPPLIER"),
  invoiceRef:      z.string().min(1),
  invoiceDate:     z.string().optional(),   // date printed on supplier's invoice
  month:           z.string().regex(/^\d{4}-\d{2}$/),
  purchaseOrderId: z.string().min(1),
  supplierId:      z.string().min(1),
  sst:             z.number().nonnegative().default(0),
  lineUpdates: z.array(z.object({
    lineId:           z.string(),
    invoicedUnitCost: z.number().nonnegative(),
  })).min(1),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoices = await prisma.stockInvoice.findMany({
    include: {
      fromEntity:    { select: { id: true, legalName: true } },
      supplier:      { select: { id: true, name: true } },
      purchaseOrder: { select: { id: true, poRef: true } },
      deliveryOrders: {
        select: {
          id: true, doRef: true, status: true, toClinicId: true,
          toClinic: { select: { name: true } },
          lines: { select: { quantity: true, unitCost: true, receivedQty: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invoices);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) {
    return NextResponse.json({ error: "Forbidden: Finance or Super Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.source) {
    return NextResponse.json({ error: "source (INTERNAL or SUPPLIER) is required" }, { status: 422 });
  }

  // Check invoice ref uniqueness
  const existing = await prisma.stockInvoice.findUnique({ where: { invoiceRef: body.invoiceRef } });
  if (existing) {
    return NextResponse.json({ error: `Invoice number "${body.invoiceRef}" is already recorded.` }, { status: 400 });
  }

  // ── INTERNAL: DO-based invoice ─────────────────────────────────────────
  if (body.source === "INTERNAL") {
    const parsed = InternalSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

    const { invoiceRef, month, toClinicId, doIds, sst, lineUpdates } = parsed.data;

    const dos = await prisma.deliveryOrder.findMany({
      where: { id: { in: doIds } },
      include: {
        fromClinic: { include: { entity: { select: { id: true } } } },
        lines: { select: { id: true, quantity: true, unitCost: true, receivedQty: true, itemId: true } },
      },
    });

    if (dos.length !== doIds.length)
      return NextResponse.json({ error: "One or more DOs not found" }, { status: 400 });

    const notReceived = dos.filter((d) => d.status !== "RECEIVED");
    if (notReceived.length > 0)
      return NextResponse.json({ error: `Not yet received: ${notReceived.map((d) => d.doRef).join(", ")}` }, { status: 400 });

    const alreadyLinked = dos.filter((d) => d.stockInvoiceId);
    if (alreadyLinked.length > 0)
      return NextResponse.json({ error: `Already invoiced: ${alreadyLinked.map((d) => d.doRef).join(", ")}` }, { status: 400 });

    // Apply line price updates if provided
    const priceMap = new Map((lineUpdates ?? []).map((u) => [u.lineId, u.invoicedUnitCost]));
    for (const [lineId, newCost] of priceMap) {
      await prisma.dOLine.update({ where: { id: lineId }, data: { unitCost: newCost } });
    }

    // Recalculate total using (possibly updated) prices
    const allLines = dos.flatMap((d) => d.lines);
    const totalAmount = allLines.reduce((s, l) => {
      const cost = priceMap.get(l.id) ?? Number(l.unitCost);
      return s + (l.receivedQty ?? l.quantity) * cost;
    }, 0);

    // Update avgUnitCost if prices changed
    if (priceMap.size > 0) {
      for (const line of allLines) {
        const invoicedCost = priceMap.get(line.id);
        if (!invoicedCost) continue;
        const ordered = Number(line.unitCost);
        if (Math.abs(invoicedCost - ordered) < 0.001) continue;
        // Correct avgUnitCost: replace old cost contribution with new
        const cs = await prisma.clinicStock.findUnique({
          where: { clinicId_itemId: { clinicId: toClinicId, itemId: line.itemId } },
        });
        if (cs && cs.avgUnitCost && cs.quantity > 0) {
          const qty = line.receivedQty ?? line.quantity;
          const correction = (invoicedCost - ordered) * qty;
          const newAvg = (Number(cs.avgUnitCost) * cs.quantity + correction) / cs.quantity;
          await prisma.clinicStock.update({
            where: { clinicId_itemId: { clinicId: toClinicId, itemId: line.itemId } },
            data: { avgUnitCost: Math.max(0, newAvg) },
          });
        }
      }
    }

    const fromEntityId = dos[0].fromClinic.entity.id;
    const invoice = await prisma.stockInvoice.create({
      data: {
        source:       "INTERNAL",
        invoiceRef,
        fromEntityId,
        month,
        totalAmount,
        sst,
        issuedAt:     new Date(),
        deliveryOrders: { connect: doIds.map((id) => ({ id })) },
      },
      include: {
        fromEntity:     { select: { legalName: true } },
        deliveryOrders: { select: { id: true, doRef: true } },
      },
    });

    await prisma.deliveryOrder.updateMany({
      where: { id: { in: doIds } },
      data:  { status: "INVOICED" },
    });

    return NextResponse.json(invoice, { status: 201 });
  }

  // ── SUPPLIER: PO-based invoice ─────────────────────────────────────────
  if (body.source === "SUPPLIER") {
    const parsed = SupplierSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

    const { invoiceRef, invoiceDate, month, purchaseOrderId, supplierId, sst, lineUpdates } = parsed.data;

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        lines: { include: { item: { select: { id: true, name: true } } } },
        clinic: true,
      },
    });

    if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    if (!["RECEIVED", "PARTIAL"].includes(po.status))
      return NextResponse.json({ error: "PO must be in RECEIVED or PARTIAL status to invoice" }, { status: 400 });

    const priceMap = new Map(lineUpdates.map((u) => [u.lineId, u.invoicedUnitCost]));

    // Update POLine unit costs to actual invoiced prices
    for (const line of po.lines) {
      const invoicedCost = priceMap.get(line.id) ?? Number(line.unitCost);
      await prisma.pOLine.update({ where: { id: line.id }, data: { unitCost: invoicedCost } });

      // Correct avgUnitCost at the receiving clinic
      const originalCost = Number(line.unitCost);
      const costDiff = invoicedCost - originalCost;
      if (Math.abs(costDiff) > 0.001) {
        const cs = await prisma.clinicStock.findUnique({
          where: { clinicId_itemId: { clinicId: po.clinicId, itemId: line.itemId } },
        });
        if (cs && cs.quantity > 0) {
          const qty = line.receivedQty ?? line.quantity;
          const correction = costDiff * qty;
          const newAvg = (Number(cs.avgUnitCost ?? invoicedCost) * cs.quantity + correction) / cs.quantity;
          await prisma.clinicStock.update({
            where: { clinicId_itemId: { clinicId: po.clinicId, itemId: line.itemId } },
            data:  { avgUnitCost: Math.max(0, newAvg) },
          });
        }
      }
    }

    const totalAmount = po.lines.reduce((s, l) => {
      const cost = priceMap.get(l.id) ?? Number(l.unitCost);
      return s + (l.receivedQty ?? l.quantity) * cost;
    }, 0);

    // Derive entity from receiving clinic
    const clinic = await prisma.clinic.findUnique({
      where: { id: po.clinicId },
      include: { entity: { select: { id: true } } },
    });

    const invoice = await prisma.stockInvoice.create({
      data: {
        source:          "SUPPLIER",
        invoiceRef,
        fromEntityId:    clinic!.entity.id,
        supplierId,
        purchaseOrderId,
        month,
        totalAmount,
        sst,
        issuedAt: invoiceDate ? new Date(invoiceDate) : new Date(),
      },
      include: {
        fromEntity: { select: { legalName: true } },
        supplier:   { select: { name: true } },
        purchaseOrder: { select: { poRef: true } },
      },
    });

    // Mark PO as INVOICED
    await prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data:  { status: "INVOICED" },
    });

    return NextResponse.json(invoice, { status: 201 });
  }

  return NextResponse.json({ error: "Invalid source" }, { status: 422 });
}
