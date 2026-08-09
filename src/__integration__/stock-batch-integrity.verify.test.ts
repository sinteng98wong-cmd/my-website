/**
 * Batch integrity + supplier invoice guard (requires a live database).
 *
 *   npx jest --config jest.integration.config.ts
 *
 * Covers the four audit findings that unit tests cannot prove: batch identity
 * carried through a transfer (H-1/H-3), stock-take adjustments depleting real
 * batches (H-1), a pinned batch that never borrows from elsewhere (H-2), and
 * the drift detector seeing batch and value drift (H-4) — plus C-1, the
 * one-supplier-invoice-per-purchase-order rule, under concurrency.
 */
const session = { user: { id: "", role: "SUPER_ADMIN" } as any };
jest.mock("next-auth", () => ({ getServerSession: async () => ({ user: session.user }) }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { receiveStock } from "@/lib/stock";
import { postMovement } from "@/lib/stock-ledger";
import { runDriftDetection } from "@/lib/stock-drift";
import { approveStockTake } from "@/services/stock-take.service";
import { PATCH as doStatus } from "@/app/api/delivery-orders/[id]/status/route";
import { POST as createIssue } from "@/app/api/stock-issues/route";
import { POST as submitIssue } from "@/app/api/stock-issues/[id]/submit/route";
import { POST as createInvoice } from "@/app/api/stock-invoices/route";

const TAG = `bat-${Date.now()}`;
const req = (body?: unknown) => ({ nextUrl: new URL("http://t"), url: "http://t", json: async () => body }) as any;

const ids: Record<string, string> = {};

const SOON  = new Date("2026-09-01T00:00:00Z");
const LATER = new Date("2027-03-01T00:00:00Z");

const qty = async (clinicId: string, itemId: string) =>
  (await prisma.clinicStock.findUnique({ where: { clinicId_itemId: { clinicId, itemId } } }))?.quantity ?? 0;

const batches = (clinicId: string, itemId: string) =>
  prisma.stockBatch.findMany({ where: { clinicId, itemId }, orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }] });

const batchTotal = async (clinicId: string, itemId: string) =>
  (await batches(clinicId, itemId)).reduce((s, b) => s + b.remainingQty, 0);

const movesFor = (clinicId: string, itemId: string) =>
  prisma.stockMovement.findMany({ where: { clinicId, itemId }, orderBy: { seq: "asc" } });

/** Receive stock into a clinic, optionally as a dated batch. */
async function receive(
  clinicId: string, itemId: string, quantity: number, cost: number, key: string,
  batch?: { no: string; expiry: Date | null }
) {
  await receiveStock(
    clinicId,
    [{
      itemId, receivedQty: quantity, unitCost: cost, postingKey: `${TAG}:recv:${key}`,
      ...(batch ? { batchNumber: batch.no, expiryDate: batch.expiry } : {}),
    }],
    { type: "RECEIPT_PO", sourceType: "PURCHASE_ORDER", reference: `${TAG}-RECV`, userId: ids.admin }
  );
}

/** Create an approved delivery order ready to dispatch. */
async function makeDo(ref: string, lines: { itemId: string; quantity: number; receivedQty?: number }[]) {
  return prisma.deliveryOrder.create({
    data: {
      doRef: `${TAG}-${ref}`,
      fromClinicId: ids.source, toClinicId: ids.dest, status: "APPROVED",
      raisedById: ids.admin, approvedById: ids.admin, approvedAt: new Date(),
      lines: { create: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, receivedQty: l.receivedQty ?? null, unitCost: 5 })) },
    },
    include: { lines: true },
  });
}

const mkItem = (n: string) =>
  prisma.stockItem.create({ data: { sku: `${TAG}-${n}`, name: `${TAG} ${n}`, category: "Verify" } });

beforeAll(async () => {
  const entity = await prisma.entity.create({ data: { legalName: `${TAG}-entity` } });
  const source = await prisma.clinic.create({ data: { name: `${TAG}-source`, entityId: entity.id } });
  const dest   = await prisma.clinic.create({ data: { name: `${TAG}-dest`,   entityId: entity.id } });
  const admin  = await prisma.user.create({
    data: { name: `${TAG}-admin`, email: `${TAG}-a@verify.local`, passwordHash: "x", role: "SUPER_ADMIN" },
  });
  const supplier = await prisma.supplier.create({ data: { name: `${TAG}-supplier` } });

  Object.assign(ids, {
    entity: entity.id, source: source.id, dest: dest.id, admin: admin.id, supplier: supplier.id,
    xfer:    (await mkItem("xfer")).id,      // clean single-batch transfer
    split:   (await mkItem("split")).id,     // transfer spanning two batches
    short:   (await mkItem("short")).id,     // transfer with a delivery shortfall
    mixed:   (await mkItem("mixed")).id,     // batched + unbatched at source
    take:    (await mkItem("take")).id,      // stock-take decrease
    takeUp:  (await mkItem("takeup")).id,    // stock-take increase
    pin:     (await mkItem("pin")).id,       // pinned-batch issue
    race:    (await mkItem("race")).id,      // concurrent batch depletion
    clean:   (await mkItem("clean")).id,     // drift: healthy position
    driftB:  (await mkItem("driftb")).id,    // drift: injected batch mismatch
    driftV:  (await mkItem("driftv")).id,    // drift: injected value mismatch
    driftQ:  (await mkItem("driftq")).id,    // drift: injected quantity mismatch
    preLdgr: (await mkItem("preldgr")).id,   // drift: stock predating the ledger
    inv:     (await mkItem("inv")).id,       // supplier invoice revaluation
  });

  session.user = { id: ids.admin, role: "SUPER_ADMIN" };

  await receive(ids.source, ids.xfer,  20, 5, "xfer",    { no: "BATCH-A", expiry: SOON });
  await receive(ids.source, ids.split, 6,  5, "split-a", { no: "SPLIT-A", expiry: SOON });
  await receive(ids.source, ids.split, 10, 5, "split-b", { no: "SPLIT-B", expiry: LATER });
  await receive(ids.source, ids.short, 20, 5, "short",   { no: "SHORT-A", expiry: SOON });
  await receive(ids.source, ids.mixed, 5,  5, "mixed-u");                                   // unbatched
  await receive(ids.source, ids.mixed, 5,  5, "mixed-b", { no: "MIXED-B", expiry: SOON });
  await receive(ids.source, ids.take,  12, 5, "take",    { no: "TAKE-A",  expiry: SOON });
  await receive(ids.source, ids.takeUp, 4, 5, "takeup",  { no: "TAKEUP-A", expiry: SOON });
  await receive(ids.source, ids.pin,   10, 5, "pin-a",   { no: "PIN-A", expiry: SOON });
  await receive(ids.source, ids.pin,   50, 5, "pin-b",   { no: "PIN-B", expiry: LATER });
  await receive(ids.source, ids.race,  10, 2, "race",    { no: "RACE-A", expiry: SOON });
  await receive(ids.source, ids.clean, 10, 3, "clean",   { no: "CLEAN-A", expiry: LATER });
  await receive(ids.source, ids.driftB, 8, 3, "driftb",  { no: "DRIFTB-A", expiry: LATER });
  await receive(ids.source, ids.driftV, 8, 3, "driftv",  { no: "DRIFTV-A", expiry: LATER });
  await receive(ids.source, ids.driftQ, 8, 3, "driftq",  { no: "DRIFTQ-A", expiry: LATER });
  await receive(ids.source, ids.inv,   10, 5, "inv");
});

afterAll(async () => {
  const clinicIds = [ids.source, ids.dest].filter(Boolean);
  if (clinicIds.length) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "dentalos.ledger_maintenance" = 'on'`);
      await tx.stockMovement.deleteMany({ where: { clinicId: { in: clinicIds } } });
    });
    await prisma.stockIssueAllocation.deleteMany({ where: { line: { stockIssue: { clinicId: { in: clinicIds } } } } });
    await prisma.stockIssueLine.deleteMany({ where: { stockIssue: { clinicId: { in: clinicIds } } } });
    await prisma.stockIssue.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.stockTakeLine.deleteMany({ where: { stockTake: { clinicId: { in: clinicIds } } } });
    await prisma.stockTake.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.dOLineBatch.deleteMany({ where: { doLine: { do: { fromClinicId: { in: clinicIds } } } } });
    await prisma.dOLine.deleteMany({ where: { do: { fromClinicId: { in: clinicIds } } } });
    await prisma.deliveryOrder.deleteMany({ where: { fromClinicId: { in: clinicIds } } });
    await prisma.stockInvoice.deleteMany({ where: { invoiceRef: { startsWith: TAG } } });
    await prisma.pOLine.deleteMany({ where: { po: { clinicId: { in: clinicIds } } } });
    await prisma.purchaseOrder.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.stockBatch.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.clinicStock.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.userClinic.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.stockItem.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
    await prisma.supplier.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } });
    await prisma.entity.deleteMany({ where: { id: ids.entity } });
  }
  await prisma.$disconnect();
});

// ── H-1 / H-3: batch identity through a transfer ────────────────────────────

describe("5/6/7. a transfer moves the batch, it does not clone it", () => {
  it("5. dispatch decreases the source batch", async () => {
    const order = await makeDo("DO-XFER", [{ itemId: ids.xfer, quantity: 10 }]);
    const res = await doStatus(req({ status: "IN_TRANSIT" }), { params: { id: order.id } });
    expect(res.status).toBe(200);

    expect(await qty(ids.source, ids.xfer)).toBe(10);
    const [a] = await batches(ids.source, ids.xfer);
    expect(a.batchNumber).toBe("BATCH-A");
    expect(a.remainingQty).toBe(10);          // 20 − 10, previously untouched

    const allocations = await prisma.dOLineBatch.findMany({ where: { doLineId: order.lines[0].id } });
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toMatchObject({ batchNumber: "BATCH-A", quantity: 10 });
    expect(allocations[0].sourceBatchId).toBe(a.id);
  });

  it("6. receipt recreates the same batch identity at the destination", async () => {
    const order = await prisma.deliveryOrder.findFirstOrThrow({ where: { doRef: `${TAG}-DO-XFER` } });
    const res = await doStatus(req({ status: "RECEIVED" }), { params: { id: order.id } });
    expect(res.status).toBe(200);

    expect(await qty(ids.dest, ids.xfer)).toBe(10);
    const dest = await batches(ids.dest, ids.xfer);
    expect(dest).toHaveLength(1);
    expect(dest[0].batchNumber).toBe("BATCH-A");
    expect(dest[0].expiryDate?.toISOString()).toBe(SOON.toISOString());
    expect(dest[0].remainingQty).toBe(10);
  });

  it("7. the same goods are never counted twice across the group", async () => {
    const source = await batchTotal(ids.source, ids.xfer);
    const dest   = await batchTotal(ids.dest,   ids.xfer);
    expect(source + dest).toBe(20);                        // exactly what was received
    expect(source).toBe(await qty(ids.source, ids.xfer));
    expect(dest).toBe(await qty(ids.dest,   ids.xfer));
  });

  it("carries every batch when the dispatch spans more than one", async () => {
    const order = await makeDo("DO-SPLIT", [{ itemId: ids.split, quantity: 9 }]);
    await doStatus(req({ status: "IN_TRANSIT" }), { params: { id: order.id } });

    // FEFO: SPLIT-A (expires first) is emptied, the rest comes from SPLIT-B.
    const src = await batches(ids.source, ids.split);
    expect(src.map((b) => [b.batchNumber, b.remainingQty])).toEqual([["SPLIT-A", 0], ["SPLIT-B", 7]]);

    await doStatus(req({ status: "RECEIVED" }), { params: { id: order.id } });
    const dest = await batches(ids.dest, ids.split);
    expect(dest.map((b) => [b.batchNumber, b.remainingQty])).toEqual([["SPLIT-A", 6], ["SPLIT-B", 3]]);
    expect(await batchTotal(ids.source, ids.split) + await batchTotal(ids.dest, ids.split)).toBe(16);
  });

  it("leaves unbatched source stock unbatched instead of inventing a batch", async () => {
    const order = await makeDo("DO-MIXED", [{ itemId: ids.mixed, quantity: 8 }]);
    await doStatus(req({ status: "IN_TRANSIT" }), { params: { id: order.id } });
    await doStatus(req({ status: "RECEIVED" }),   { params: { id: order.id } });

    // 5 batched at source went first (FEFO), 3 came from unbatched stock.
    expect(await batchTotal(ids.source, ids.mixed)).toBe(0);
    expect(await qty(ids.source, ids.mixed)).toBe(2);

    const dest = await batches(ids.dest, ids.mixed);
    expect(dest.map((b) => [b.batchNumber, b.remainingQty])).toEqual([["MIXED-B", 5]]);
    expect(await qty(ids.dest, ids.mixed)).toBe(8);   // 5 batched + 3 unbatched
  });
});

describe("8/9. discrepancies and repeated actions", () => {
  it("8. reconciles batch quantities with the physical outcome of a short delivery", async () => {
    const order = await makeDo("DO-SHORT", [{ itemId: ids.short, quantity: 10, receivedQty: 8 }]);
    await doStatus(req({ status: "IN_TRANSIT" }), { params: { id: order.id } });
    const res = await doStatus(req({ status: "RECEIVED" }), { params: { id: order.id } });
    expect((await res.json()).hasDiscrepancy).toBe(true);

    // Source gave up 10; the destination keeps 8 and writes 2 off as variance.
    expect(await qty(ids.source, ids.short)).toBe(10);
    expect(await batchTotal(ids.source, ids.short)).toBe(10);
    expect(await qty(ids.dest, ids.short)).toBe(8);
    expect(await batchTotal(ids.dest, ids.short)).toBe(8);

    const types = (await movesFor(ids.dest, ids.short)).map((m) => m.type);
    expect(types).toEqual(["TRANSFER_IN", "TRANSFER_VARIANCE_OUT"]);
  });

  it("9. a repeated dispatch or receipt changes nothing", async () => {
    const order = await prisma.deliveryOrder.findFirstOrThrow({ where: { doRef: `${TAG}-DO-XFER` } });
    const before = {
      source: await batchTotal(ids.source, ids.xfer),
      dest:   await batchTotal(ids.dest,   ids.xfer),
      moves:  (await movesFor(ids.source, ids.xfer)).length + (await movesFor(ids.dest, ids.xfer)).length,
      allocs: await prisma.dOLineBatch.count({ where: { doLine: { doId: order.id } } }),
    };

    expect((await doStatus(req({ status: "IN_TRANSIT" }), { params: { id: order.id } })).status).toBe(400);
    expect((await doStatus(req({ status: "RECEIVED" }),   { params: { id: order.id } })).status).toBe(400);

    expect(await batchTotal(ids.source, ids.xfer)).toBe(before.source);
    expect(await batchTotal(ids.dest,   ids.xfer)).toBe(before.dest);
    expect((await movesFor(ids.source, ids.xfer)).length + (await movesFor(ids.dest, ids.xfer)).length).toBe(before.moves);
    expect(await prisma.dOLineBatch.count({ where: { doLine: { doId: order.id } } })).toBe(before.allocs);
  });
});

// ── H-1: stock take adjustments ─────────────────────────────────────────────

async function stockTakeFor(itemId: string, physicalQty: number, ref: string) {
  const stock = await prisma.clinicStock.findUniqueOrThrow({
    where: { clinicId_itemId: { clinicId: ids.source, itemId } },
  });
  return prisma.stockTake.create({
    data: {
      reference: `${TAG}-${ref}`, clinicId: ids.source, status: "SUBMITTED",
      createdById: ids.admin, submittedById: ids.admin, submittedAt: new Date(),
      lines: {
        create: [{
          itemId, systemQty: stock.quantity, physicalQty,
          avgUnitCost: (Number(stock.avgUnitCost ?? 0)).toFixed(4),
          reason: "STOCK_COUNT_VARIANCE", countedById: ids.admin, countedAt: new Date(),
        }],
      },
    },
  });
}

describe("10-13. stock take adjustments move real batches", () => {
  it("10/13. an adjustment out depletes batches and reconciles", async () => {
    const take = await stockTakeFor(ids.take, 9, "STK-DOWN");   // 12 counted as 9
    const out = await approveStockTake(take.id, ids.admin);
    expect(out.ok).toBe(true);

    expect(await qty(ids.source, ids.take)).toBe(9);
    const [b] = await batches(ids.source, ids.take);
    expect(b.batchNumber).toBe("TAKE-A");
    expect(b.remainingQty).toBe(9);                             // 12 − 3
    expect(await batchTotal(ids.source, ids.take)).toBe(await qty(ids.source, ids.take));
  });

  it("11. an adjustment out cannot drive a batch below zero", async () => {
    // Count the whole position away: batch depletion must stop exactly at 0.
    const take = await stockTakeFor(ids.take, 0, "STK-ZERO");
    expect((await approveStockTake(take.id, ids.admin)).ok).toBe(true);
    expect(await qty(ids.source, ids.take)).toBe(0);
    const src = await batches(ids.source, ids.take);
    expect(src.every((b) => b.remainingQty >= 0)).toBe(true);
    expect(await batchTotal(ids.source, ids.take)).toBe(0);
  });

  it("12/13. an adjustment in creates unbatched stock, never a fabricated batch", async () => {
    const take = await stockTakeFor(ids.takeUp, 7, "STK-UP");   // 4 counted as 7
    expect((await approveStockTake(take.id, ids.admin)).ok).toBe(true);

    expect(await qty(ids.source, ids.takeUp)).toBe(7);
    const src = await batches(ids.source, ids.takeUp);
    expect(src).toHaveLength(1);                                // no new batch row
    expect(src[0].batchNumber).toBe("TAKEUP-A");
    expect(src[0].expiryDate?.toISOString()).toBe(SOON.toISOString());
    expect(src[0].remainingQty).toBe(4);                        // untouched
    // The 3 found units are unbatched, and the position still reconciles:
    // batch total ≤ stock on hand, remainder explicitly unbatched.
    expect(await batchTotal(ids.source, ids.takeUp)).toBe(4);
    expect(await qty(ids.source, ids.takeUp)).toBe(7);
  });
});

// ── H-2: a pinned batch is the only source ──────────────────────────────────

async function issueLines(itemId: string, quantity: number, batchId?: string, reason = "CLINICAL_CONSUMPTION") {
  const res = await createIssue(req({
    clinicId: ids.source, reason,
    lines: [{ itemId, quantity, ...(batchId ? { batchId } : {}) }],
  }));
  return { status: res.status, body: await res.json() };
}

describe("14-17. pinning a batch on an issue", () => {
  it("14/15/16. refuses when the pinned batch cannot cover the quantity", async () => {
    const pinA = (await batches(ids.source, ids.pin)).find((b) => b.batchNumber === "PIN-A")!;
    const before = { qty: await qty(ids.source, ids.pin), batch: await batchTotal(ids.source, ids.pin) };

    const created = await issueLines(ids.pin, 25, pinA.id);
    expect(created.status).toBe(201);
    const res = await submitIssue(req(), { params: { id: created.body.id } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("PIN-A");

    // 15/16. neither the other batch nor unbatched stock was touched.
    expect(await qty(ids.source, ids.pin)).toBe(before.qty);
    expect(await batchTotal(ids.source, ids.pin)).toBe(before.batch);
    const pinB = (await batches(ids.source, ids.pin)).find((b) => b.batchNumber === "PIN-B")!;
    expect(pinB.remainingQty).toBe(50);
    expect(await prisma.stockIssueAllocation.count({ where: { line: { stockIssue: { id: created.body.id } } } })).toBe(0);
  });

  it("14. takes only from the pinned batch when it does cover the quantity", async () => {
    const pinB = (await batches(ids.source, ids.pin)).find((b) => b.batchNumber === "PIN-B")!;
    const created = await issueLines(ids.pin, 6, pinB.id);
    expect((await submitIssue(req(), { params: { id: created.body.id } })).status).toBe(200);

    const after = await batches(ids.source, ids.pin);
    expect(after.find((b) => b.batchNumber === "PIN-A")!.remainingQty).toBe(10);   // untouched
    expect(after.find((b) => b.batchNumber === "PIN-B")!.remainingQty).toBe(44);

    const allocs = await prisma.stockIssueAllocation.findMany({ where: { line: { stockIssue: { id: created.body.id } } } });
    expect(allocs).toHaveLength(1);
    expect(allocs[0].batchId).toBe(pinB.id);
  });

  it("17. an unpinned issue still follows FEFO", async () => {
    const created = await issueLines(ids.pin, 12);
    expect((await submitIssue(req(), { params: { id: created.body.id } })).status).toBe(200);

    const after = await batches(ids.source, ids.pin);
    expect(after.find((b) => b.batchNumber === "PIN-A")!.remainingQty).toBe(0);    // earliest expiry emptied
    expect(after.find((b) => b.batchNumber === "PIN-B")!.remainingQty).toBe(42);
    expect(await batchTotal(ids.source, ids.pin)).toBe(await qty(ids.source, ids.pin));
  });
});

// ── Concurrency ─────────────────────────────────────────────────────────────

describe("23/24. concurrency", () => {
  it("23. simultaneous depletion cannot drive a batch negative", async () => {
    // Six issues of 3 against 10 units: at most three can succeed. Raised one
    // at a time (reference numbering is sequential), submitted together.
    const created = [];
    for (let i = 0; i < 6; i++) created.push(await issueLines(ids.race, 3));
    const results = await Promise.all(
      created.map((c) => submitIssue(req(), { params: { id: c.body.id } }).then((r) => r.status))
    );

    const posted = results.filter((s) => s === 200).length;
    expect(posted).toBeLessThanOrEqual(3);
    expect(await qty(ids.source, ids.race)).toBe(10 - posted * 3);
    const [b] = await batches(ids.source, ids.race);
    expect(b.remainingQty).toBe(10 - posted * 3);
    expect(b.remainingQty).toBeGreaterThanOrEqual(0);
  });

  it("1/2/3/4/24. two supplier invoices on one purchase order: exactly one wins", async () => {
    const po = await prisma.purchaseOrder.create({
      data: {
        poRef: `${TAG}-PO-1`, clinicId: ids.source, supplierId: ids.supplier, status: "RECEIVED",
        raisedById: ids.admin,
        lines: { create: [{ itemId: ids.inv, quantity: 10, receivedQty: 10, postedQty: 10, unitCost: 5 }] },
      },
      include: { lines: true },
    });

    const body = (ref: string) => ({
      source: "SUPPLIER", invoiceRef: `${TAG}-${ref}`, month: "2026-08",
      purchaseOrderId: po.id, supplierId: ids.supplier,
      lineUpdates: [{ lineId: po.lines[0].id, invoicedUnitCost: 6 }],
    });

    const [one, two] = await Promise.all([
      createInvoice(req(body("SINV-1"))),
      createInvoice(req(body("SINV-2"))),
    ]);
    const statuses = [one.status, two.status].sort();
    expect(statuses[0]).toBe(201);            // 1. the first invoice succeeds
    expect(statuses[1]).toBe(409);            // 2/24. the second is refused

    // 3. exactly one revaluation, so the receipt was repriced once.
    const revals = (await movesFor(ids.source, ids.inv)).filter((m) => m.type === "REVALUATION");
    expect(revals).toHaveLength(1);
    expect(Number(revals[0].valueDelta)).toBe(10);          // 10 units × (6 − 5)

    const stock = await prisma.clinicStock.findUniqueOrThrow({
      where: { clinicId_itemId: { clinicId: ids.source, itemId: ids.inv } },
    });
    expect(Number(stock.avgUnitCost)).toBe(6);              // not 7
    expect(await prisma.stockInvoice.count({ where: { purchaseOrderId: po.id } })).toBe(1);
  });

  it("2/3. a later supplier invoice is refused with nothing posted", async () => {
    const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { poRef: `${TAG}-PO-1` }, include: { lines: true } });
    const before = (await movesFor(ids.source, ids.inv)).length;
    const stockBefore = await prisma.clinicStock.findUniqueOrThrow({
      where: { clinicId_itemId: { clinicId: ids.source, itemId: ids.inv } },
    });

    const res = await createInvoice(req({
      source: "SUPPLIER", invoiceRef: `${TAG}-SINV-3`, month: "2026-08",
      purchaseOrderId: po.id, supplierId: ids.supplier,
      lineUpdates: [{ lineId: po.lines[0].id, invoicedUnitCost: 9 }],
    }));
    expect(res.status).toBe(409);

    expect((await movesFor(ids.source, ids.inv)).length).toBe(before);
    const stockAfter = await prisma.clinicStock.findUniqueOrThrow({
      where: { clinicId_itemId: { clinicId: ids.source, itemId: ids.inv } },
    });
    expect(Number(stockAfter.avgUnitCost)).toBe(Number(stockBefore.avgUnitCost));
    expect(stockAfter.quantity).toBe(stockBefore.quantity);
    expect(await prisma.stockInvoice.count({ where: { purchaseOrderId: po.id } })).toBe(1);
  });
});

// ── H-4: the drift detector ─────────────────────────────────────────────────
//
// Runs last: these deliberately corrupt dedicated items.

describe("18-22. drift detection", () => {
  const findingsFor = async (itemId: string) => {
    const report = await runDriftDetection([ids.source, ids.dest]);
    return report.findings.filter((f) => f.itemId === itemId);
  };

  it("18. a clean batched position produces no finding at all", async () => {
    expect(await findingsFor(ids.clean)).toEqual([]);
  });

  it("18. every position touched by this run is free of errors", async () => {
    const report = await runDriftDetection([ids.source, ids.dest]);
    const errors = report.findings.filter((f) => f.severity === "ERROR");
    expect(errors).toEqual([]);
  });

  it("21. stock predating the ledger stays informational", async () => {
    await prisma.clinicStock.create({
      data: { clinicId: ids.source, itemId: ids.preLdgr, quantity: 15, parLevel: 0, avgUnitCost: 4 },
    });
    const f = await findingsFor(ids.preLdgr);
    expect(f.map((x) => x.code)).toEqual(["MISSING_MOVEMENTS"]);
    expect(f[0].severity).toBe("INFO");
  });

  it("21. partially batched stock is informational, not an error", async () => {
    // The stock-take increase left 3 unbatched units behind a real batch.
    const f = await findingsFor(ids.takeUp);
    expect(f.map((x) => x.code)).toEqual(["UNBATCHED_STOCK"]);
    expect(f[0].severity).toBe("INFO");
  });

  it("19. an injected batch mismatch is detected", async () => {
    const [b] = await batches(ids.source, ids.driftB);
    await prisma.stockBatch.update({ where: { id: b.id }, data: { remainingQty: 12 } });  // stock is 8

    const f = await findingsFor(ids.driftB);
    const over = f.find((x) => x.code === "BATCH_OVER_ALLOCATION")!;
    expect(over.severity).toBe("ERROR");
    expect(over.expected).toBe(8);
    expect(over.actual).toBe(12);
  });

  it("20. an injected value mismatch is detected", async () => {
    // A second revaluation posted without the matching ClinicStock write —
    // the shape of the C-1 defect this task closed.
    const last = (await movesFor(ids.source, ids.driftV)).at(-1)!;
    await prisma.$transaction(async (tx) => {
      await postMovement(tx, {
        clinicId: ids.source, itemId: ids.driftV, type: "REVALUATION",
        quantity: 0, unitCost: 3, valueDelta: 24,
        balanceAfter: last.balanceAfter, avgCostAfter: Number(last.avgCostAfter),
        sourceType: "STOCK_INVOICE", reference: `${TAG}-DRIFT`,
        postingKey: `${TAG}:drift:value`, userId: ids.admin,
      });
    });

    const f = await findingsFor(ids.driftV);
    const v = f.find((x) => x.code === "VALUE_MISMATCH")!;
    expect(v.severity).toBe("ERROR");
    expect(v.expected).toBe(24);        // 8 units at 3.00
    expect(v.actual).toBe(48);          // the ledger now carries twice that
  });

  it("22. a ledger quantity mismatch is still an error", async () => {
    await prisma.clinicStock.update({
      where: { clinicId_itemId: { clinicId: ids.source, itemId: ids.driftQ } },
      data:  { quantity: 5 },           // ledger says 8
    });
    const codes = (await findingsFor(ids.driftQ)).map((x) => x.code);
    expect(codes).toContain("BALANCE_MISMATCH");
    expect(codes).toContain("BATCH_OVER_ALLOCATION");
    const report = await runDriftDetection([ids.source]);
    expect(report.clean).toBe(false);
  });
});
