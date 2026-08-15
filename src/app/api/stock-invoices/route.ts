import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clinicScopeFor } from "@/lib/clinic-access";
import { postMovement, postingKeys } from "@/lib/stock-ledger";
import {
  splitPriceCorrection, paidInvoicedQtyOf, PPV_NOTE, REVALUATION_NOTE,
} from "@/lib/stock-ppv";
import { isPeriodLockedError } from "@/lib/stock-period";
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

/** True when an error is a Postgres unique violation on the given column. */
function isUniqueViolation(e: unknown, column: string): boolean {
  const err = e as { code?: string; meta?: { target?: string[] | string } };
  if (err?.code !== "P2002") return false;
  const target = err.meta?.target;
  return (Array.isArray(target) ? target.join(",") : String(target ?? "")).includes(column);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Branch users only see invoices covering their own clinics' movements.
  const scope = await clinicScopeFor(role, userId);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clinicIds = scope.clinicIds;

  const invoices = await prisma.stockInvoice.findMany({
    ...(clinicIds
      ? {
          where: {
            OR: [
              { purchaseOrder: { clinicId: { in: clinicIds } } },
              { deliveryOrders: { some: { OR: [
                { toClinicId:   { in: clinicIds } },
                { fromClinicId: { in: clinicIds } },
              ] } } },
            ],
          },
        }
      : {}),
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
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
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
          const newAvg = Math.max(0, (Number(cs.avgUnitCost) * cs.quantity + correction) / cs.quantity);
          // Value-only movement: quantity is untouched, the ledger records the
          // revaluation so stock value stays reconcilable after a reprice.
          await prisma.$transaction(async (tx) => {
            await tx.clinicStock.update({
              where: { clinicId_itemId: { clinicId: toClinicId, itemId: line.itemId } },
              data: { avgUnitCost: newAvg },
            });
            await postMovement(tx, {
              clinicId: toClinicId, itemId: line.itemId, type: "REVALUATION",
              quantity: 0, unitCost: invoicedCost, valueDelta: correction,
              balanceAfter: cs.quantity, avgCostAfter: newAvg,
              sourceType: "STOCK_INVOICE", sourceId: null, sourceLineId: line.id,
              reference: invoiceRef, postingKey: postingKeys.revalueDo(invoiceRef, line.id),
              userId, note: `Repriced from ${ordered} to ${invoicedCost}`,
            });
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
        stockInvoice: { select: { invoiceRef: true } },
        clinic: true,
      },
    });

    if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

    // A purchase order carries exactly one supplier invoice. A second one
    // would reprice the same receipt again and silently inflate stock value,
    // so it is refused here — before anything is posted — and again by the
    // atomic claim and the unique constraint below.
    if (po.stockInvoice)
      return NextResponse.json(
        { error: `Purchase order ${po.poRef} is already covered by invoice "${po.stockInvoice.invoiceRef}". Raise a credit note or amendment against that invoice instead.` },
        { status: 409 }
      );

    if (!["RECEIVED", "PARTIAL"].includes(po.status))
      return NextResponse.json({ error: "PO must be in RECEIVED or PARTIAL status to invoice" }, { status: 400 });

    const priceMap = new Map(lineUpdates.map((u) => [u.lineId, u.invoicedUnitCost]));

    // Derive entity from receiving clinic
    const clinic = await prisma.clinic.findUnique({
      where: { id: po.clinicId },
      include: { entity: { select: { id: true } } },
    });

    const totalAmount = po.lines.reduce((s, l) => {
      const cost = priceMap.get(l.id) ?? Number(l.unitCost);
      return s + (l.receivedQty ?? l.quantity) * cost;
    }, 0);

    // Everything below is one transaction: the claim, the repricing, the
    // revaluations and the invoice itself either all happen or none do.
    try {
      const invoice = await prisma.$transaction(async (tx) => {
        // One-shot claim on the invoiceable statuses. Two requests arriving
        // together race here and exactly one wins, so neither the check above
        // nor a stale read can let both revalue.
        const claimed = await tx.purchaseOrder.updateMany({
          where: { id: purchaseOrderId, status: { in: ["RECEIVED", "PARTIAL"] } },
          data:  { status: "INVOICED" },
        });
        if (claimed.count === 0) throw new Error("PO_ALREADY_INVOICED");

        // Update POLine unit costs to actual invoiced prices
        for (const line of po.lines) {
          const invoicedCost = priceMap.get(line.id) ?? Number(line.unitCost);
          await tx.pOLine.update({ where: { id: line.id }, data: { unitCost: invoicedCost } });

          // ── H-5: split the price correction ───────────────────────────────
          // The difference is shared between stock still on hand and stock that
          // has already left inventory. Nothing is dropped: when no stock
          // remains the whole correction becomes purchase price variance.
          const originalCost = Number(line.unitCost);
          const costDiff = invoicedCost - originalCost;
          if (Math.abs(costDiff) <= 0.001) continue;

          // Free goods were never invoiced, so they stay out of the base.
          const paidInvoicedQty = paidInvoicedQtyOf(line);
          if (paidInvoicedQty <= 0) continue;

          const cs = await tx.clinicStock.findUnique({
            where: { clinicId_itemId: { clinicId: po.clinicId, itemId: line.itemId } },
          });
          const currentQty = cs?.quantity ?? 0;

          // Denominator is the paid receipt pool for this clinic+item, so two
          // purchase orders for the same item cannot both claim the same stock.
          // RECEIPT_FOC is excluded by type — free goods carry no invoice price.
          const pool = await tx.stockMovement.aggregate({
            where: { clinicId: po.clinicId, itemId: line.itemId, type: "RECEIPT_PO" },
            _sum:  { qtyIn: true },
          });

          const split = splitPriceCorrection({
            receiptUnitCost: originalCost,
            invoiceUnitCost: invoicedCost,
            paidInvoicedQty,
            currentQty,
            paidPoolQty: pool._sum.qtyIn ?? 0,
          });

          const ratioPct = (split.onHandRatio * 100).toFixed(1);
          const priced   = `Repriced from ${originalCost} to ${invoicedCost}`;

          // A. Inventory revaluation — only meaningful while stock is held.
          //
          // No floor is applied to the new average. It cannot go negative:
          // newAvg reduces to avg + costDiff × (paidInvoicedQty / paidPoolQty),
          // and that factor is at most 1, so newAvg >= invoicedCost >= 0.
          let avgAfter = Number(cs?.avgUnitCost ?? invoicedCost);
          if (cs && currentQty > 0 && split.inventoryCorrection !== 0) {
            avgAfter = (Number(cs.avgUnitCost ?? invoicedCost) * currentQty + split.inventoryCorrection) / currentQty;
            await tx.clinicStock.update({
              where: { clinicId_itemId: { clinicId: po.clinicId, itemId: line.itemId } },
              data:  { avgUnitCost: avgAfter },
            });
            await postMovement(tx, {
              clinicId: po.clinicId, itemId: line.itemId, type: "REVALUATION",
              quantity: 0, unitCost: invoicedCost, valueDelta: split.inventoryCorrection,
              balanceAfter: currentQty, avgCostAfter: avgAfter,
              sourceType: "STOCK_INVOICE", sourceId: purchaseOrderId, sourceLineId: line.id,
              reference: invoiceRef, postingKey: postingKeys.revaluePo(invoiceRef, line.id),
              userId,
              note: `${priced}. ${REVALUATION_NOTE} — ${ratioPct}% of ${split.totalCorrection.toFixed(2)}`,
            });
          }

          // B. Purchase price variance — the portion no longer in inventory.
          // Value-only and quantity-free: it never touches ClinicStock.
          if (split.ppvCorrection !== 0) {
            await postMovement(tx, {
              clinicId: po.clinicId, itemId: line.itemId, type: "PURCHASE_PRICE_VARIANCE",
              quantity: 0, unitCost: invoicedCost, valueDelta: split.ppvCorrection,
              balanceAfter: currentQty, avgCostAfter: avgAfter,
              sourceType: "STOCK_INVOICE", sourceId: purchaseOrderId, sourceLineId: line.id,
              reference: invoiceRef, postingKey: postingKeys.ppvPo(invoiceRef, line.id),
              userId,
              note: `${priced}. ${PPV_NOTE} — ${(100 - Number(ratioPct)).toFixed(1)}% of ${split.totalCorrection.toFixed(2)}`,
            });
          }
        }

        return tx.stockInvoice.create({
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
      }, { maxWait: 15_000, timeout: 30_000 });

      return NextResponse.json(invoice, { status: 201 });
    } catch (e) {
      // A locked stock period refuses the revaluation and the PPV together —
      // the whole transaction rolls back, so the invoice is not created either.
      if (isPeriodLockedError(e))
        return NextResponse.json(
          { error: e.message, clinicId: e.clinicId, period: e.period, code: "PERIOD_LOCKED" },
          { status: 409 }
        );
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "PO_ALREADY_INVOICED" || isUniqueViolation(e, "purchaseOrderId"))
        return NextResponse.json(
          { error: `Purchase order ${po.poRef} has already been invoiced. Nothing was posted.` },
          { status: 409 }
        );
      if (isUniqueViolation(e, "invoiceRef"))
        return NextResponse.json({ error: `Invoice number "${invoiceRef}" is already recorded.` }, { status: 400 });
      throw e;
    }
  }

  return NextResponse.json({ error: "Invalid source" }, { status: 422 });
}
