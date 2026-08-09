/**
 * Phase 1 dual-write verification (requires a live database).
 *
 *   npx jest --config jest.integration.config.ts
 *
 * Drives the REAL route handlers against the REAL database. Only the session
 * is mocked — Prisma, the ledger, the constraints and the immutability trigger
 * are all genuine. Every fixture is created and torn down inside the run, so
 * nothing is left behind in the inventory.
 */
import { randomUUID } from "crypto";

const session = { user: { id: "", role: "STOREKEEPER" } as any };
jest.mock("next-auth", () => ({ getServerSession: async () => ({ user: session.user }) }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { runDriftDetection } from "@/lib/stock-drift";
import { PATCH as poStatus } from "@/app/api/purchase-orders/[id]/status/route";
import { PATCH as doStatus } from "@/app/api/delivery-orders/[id]/status/route";
import { PATCH as doReceivedQty } from "@/app/api/delivery-orders/[id]/received-qty/route";
import { PATCH as poolStatus } from "@/app/api/pool-orders/[id]/status/route";
import { POST as stockInvoice } from "@/app/api/stock-invoices/route";

const TAG = `verify-${Date.now()}`;
const req = (body?: unknown) => ({ nextUrl: new URL("http://t"), url: "http://t", json: async () => body }) as any;

const ids = { entity: "", clinicA: "", clinicB: "", user: "", supplier: "", itemA: "", itemB: "", itemC: "", itemD: "" };

const qty = async (clinicId: string, itemId: string) =>
  (await prisma.clinicStock.findUnique({ where: { clinicId_itemId: { clinicId, itemId } } }))?.quantity ?? 0;

const avg = async (clinicId: string, itemId: string) =>
  Number((await prisma.clinicStock.findUnique({ where: { clinicId_itemId: { clinicId, itemId } } }))?.avgUnitCost ?? 0);

const moves = (clinicId: string, itemId: string) =>
  prisma.stockMovement.findMany({ where: { clinicId, itemId }, orderBy: { seq: "asc" } });

beforeAll(async () => {
  const entity = await prisma.entity.create({ data: { legalName: `${TAG}-entity` } });
  const clinicA = await prisma.clinic.create({ data: { name: `${TAG}-A`, entityId: entity.id } });
  const clinicB = await prisma.clinic.create({ data: { name: `${TAG}-B`, entityId: entity.id } });
  const user = await prisma.user.create({
    data: { name: `${TAG}-store`, email: `${TAG}@verify.local`, passwordHash: "x", role: "STOREKEEPER" },
  });
  await prisma.userClinic.createMany({
    data: [{ userId: user.id, clinicId: clinicA.id }, { userId: user.id, clinicId: clinicB.id }],
  });
  const supplier = await prisma.supplier.create({ data: { name: `${TAG}-supplier` } });
  const mkItem = (n: string) => prisma.stockItem.create({ data: { sku: `${TAG}-${n}`, name: `${TAG} ${n}`, category: "Verify" } });

  Object.assign(ids, {
    entity: entity.id, clinicA: clinicA.id, clinicB: clinicB.id, user: user.id, supplier: supplier.id,
    itemA: (await mkItem("A")).id, itemB: (await mkItem("B")).id,
    itemC: (await mkItem("C")).id, itemD: (await mkItem("D")).id,
  });
  session.user = { id: user.id, role: "STOREKEEPER" };
});

afterAll(async () => {
  const clinicIds = [ids.clinicA, ids.clinicB].filter(Boolean);
  if (clinicIds.length) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "dentalos.ledger_maintenance" = 'on'`);
      await tx.stockMovement.deleteMany({ where: { clinicId: { in: clinicIds } } });
    });
    await prisma.stockBatch.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.clinicStock.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.stockInvoice.deleteMany({ where: { invoiceRef: { startsWith: TAG } } });
    await prisma.dOLineBatch.deleteMany({ where: { doLine: { do: { fromClinicId: { in: clinicIds } } } } });
    await prisma.dOLine.deleteMany({ where: { do: { fromClinicId: { in: clinicIds } } } });
    await prisma.deliveryOrder.deleteMany({ where: { fromClinicId: { in: clinicIds } } });
    await prisma.pOLine.deleteMany({ where: { po: { clinicId: { in: clinicIds } } } });
    await prisma.purchaseOrder.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.poolOrderLine.deleteMany({ where: { pool: { initiatingClinicId: { in: clinicIds } } } });
    await prisma.poolParticipantLine.deleteMany({ where: { participant: { clinicId: { in: clinicIds } } } });
    await prisma.poolParticipant.deleteMany({ where: { clinicId: { in: clinicIds } } });
    await prisma.poolOrder.deleteMany({ where: { initiatingClinicId: { in: clinicIds } } });
    await prisma.userClinic.deleteMany({ where: { userId: ids.user } });
    await prisma.stockItem.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.supplier.deleteMany({ where: { id: ids.supplier } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } });
    await prisma.entity.deleteMany({ where: { id: ids.entity } });
  }
  await prisma.$disconnect();
});

// ── 1. PO receipt ────────────────────────────────────────────────────────────
describe("1. PO receipt", () => {
  let poId = "", lineId = "";

  it("posts stock and a matching RECEIPT_PO movement", async () => {
    const po = await prisma.purchaseOrder.create({
      data: {
        poRef: `${TAG}-PO1`, clinicId: ids.clinicA, supplierId: ids.supplier, status: "CONFIRMED",
        lines: { create: [{ itemId: ids.itemA, quantity: 10, unitCost: "5.00" }] },
      },
      include: { lines: true },
    });
    poId = po.id; lineId = po.lines[0].id;

    const before = await qty(ids.clinicA, ids.itemA);
    const res = await poStatus(req({ status: "RECEIVED" }), { params: { id: poId } });
    expect(res.status).toBe(200);

    expect(await qty(ids.clinicA, ids.itemA)).toBe(before + 10);

    const mv = await moves(ids.clinicA, ids.itemA);
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({
      type: "RECEIPT_PO", direction: "IN", qtyIn: 10, qtyOut: 0,
      sourceType: "PURCHASE_ORDER", sourceId: poId, sourceLineId: lineId,
      reference: `${TAG}-PO1`, postingKey: `PO:${lineId}:RECEIPT:0`,
      balanceAfter: 10, createdById: ids.user,
    });
    expect(Number(mv[0].unitCost)).toBe(5);
    expect(Number(mv[0].valueDelta)).toBe(50);
    expect(Number(mv[0].avgCostAfter)).toBe(5);
    expect(await avg(ids.clinicA, ids.itemA)).toBe(5);
  });

  it("is idempotent — a repeated receipt is refused before posting anything", async () => {
    // The state machine rejects RECEIVED → RECEIVED outright, so the receipt
    // never reaches the posting path. Stock and ledger are both untouched.
    const res = await poStatus(req({ status: "RECEIVED" }), { params: { id: poId } });
    expect(res.status).toBe(409);
    expect(await qty(ids.clinicA, ids.itemA)).toBe(10);
    expect(await moves(ids.clinicA, ids.itemA)).toHaveLength(1);
  });

  it("is idempotent at the posting layer too, when the transition is legal", async () => {
    // A genuinely partial receipt leaves the PO in PARTIAL, so PARTIAL →
    // PARTIAL is a legal transition and the no-op guard is what stops the
    // second posting. Uses its own item so the DO scenarios are unaffected.
    const po2 = await prisma.purchaseOrder.create({
      data: {
        poRef: `${TAG}-PO1b`, clinicId: ids.clinicA, supplierId: ids.supplier, status: "CONFIRMED",
        lines: { create: [{ itemId: ids.itemD, quantity: 10, receivedQty: 4, unitCost: "5.00" }] },
      },
      include: { lines: true },
    });
    const first = await poStatus(req({ status: "PARTIAL" }), { params: { id: po2.id } });
    expect((await first.json()).status).toBe("PARTIAL");
    expect(await qty(ids.clinicA, ids.itemD)).toBe(4);
    const countAfterFirst = (await moves(ids.clinicA, ids.itemD)).length;

    // Nothing changed on the lines, so re-posting from PARTIAL posts nothing.
    const res = await poStatus(req({ status: "PARTIAL" }), { params: { id: po2.id } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.alreadyReceived).toBe(true);
    expect(body.posted).toBe(0);
    expect(await qty(ids.clinicA, ids.itemD)).toBe(4);
    expect(await moves(ids.clinicA, ids.itemD)).toHaveLength(countAfterFirst);
  });
});

// ── 2. FOC receipt ───────────────────────────────────────────────────────────
describe("2. FOC receipt", () => {
  let poId = "", lineId = "";

  it("splits free goods into a zero-cost RECEIPT_FOC movement", async () => {
    const po = await prisma.purchaseOrder.create({
      data: {
        poRef: `${TAG}-PO2`, clinicId: ids.clinicA, supplierId: ids.supplier, status: "CONFIRMED",
        lines: { create: [{ itemId: ids.itemB, quantity: 10, receivedQty: 12, unitCost: "5.00" }] },
      },
      include: { lines: true },
    });
    poId = po.id; lineId = po.lines[0].id;

    const res = await poStatus(req({ status: "RECEIVED" }), { params: { id: poId } });
    expect(res.status).toBe(200);

    expect(await qty(ids.clinicA, ids.itemB)).toBe(12);

    const mv = await moves(ids.clinicA, ids.itemB);
    expect(mv.map((m) => m.type)).toEqual(["RECEIPT_PO", "RECEIPT_FOC"]);
    expect(mv[0]).toMatchObject({ qtyIn: 10, postingKey: `PO:${lineId}:RECEIPT:0` });
    expect(mv[1]).toMatchObject({ type: "RECEIPT_FOC", qtyIn: 2, balanceAfter: 12, postingKey: `PO:${lineId}:FOC:0` });
    expect(Number(mv[1].unitCost)).toBe(0);
    expect(Number(mv[1].valueDelta)).toBe(0);

    // 10 paid @5 + 2 free = RM50 over 12 units. The ledger holds this at
    // Decimal(12,4); ClinicStock.avgUnitCost is Decimal(10,2) and rounds.
    expect(Number(mv[1].avgCostAfter)).toBeCloseTo(50 / 12, 3);   // 4.1667
    expect(await avg(ids.clinicA, ids.itemB)).toBeCloseTo(4.17, 2);
  });

  it("keeps the ledger/ClinicStock cost divergence inside the drift tolerance", async () => {
    // Documented consequence of the two columns having different precision.
    const mv = await moves(ids.clinicA, ids.itemB);
    const ledgerCost = Number(mv[mv.length - 1].avgCostAfter);
    const stockCost = await avg(ids.clinicA, ids.itemB);
    expect(Math.abs(ledgerCost - stockCost)).toBeLessThan(0.005);
  });

  it("is idempotent", async () => {
    await poStatus(req({ status: "RECEIVED" }), { params: { id: poId } });
    expect(await qty(ids.clinicA, ids.itemB)).toBe(12);
    expect(await moves(ids.clinicA, ids.itemB)).toHaveLength(2);
  });
});

// ── 3 & 4. DO dispatch and receipt (complete) ────────────────────────────────
describe("3+4. DO dispatch and receipt", () => {
  let doId = "", lineId = "";

  beforeAll(async () => {
    const d = await prisma.deliveryOrder.create({
      data: {
        doRef: `${TAG}-DO1`, fromClinicId: ids.clinicA, toClinicId: ids.clinicB, status: "APPROVED",
        lines: { create: [{ itemId: ids.itemA, quantity: 6, unitCost: "5.00" }] },
      },
      include: { lines: true },
    });
    doId = d.id; lineId = d.lines[0].id;
  });

  it("3. dispatch removes stock and posts TRANSFER_OUT at average cost", async () => {
    const res = await doStatus(req({ status: "IN_TRANSIT" }), { params: { id: doId } });
    expect(res.status).toBe(200);

    expect(await qty(ids.clinicA, ids.itemA)).toBe(4);

    const mv = (await moves(ids.clinicA, ids.itemA)).filter((m) => m.type === "TRANSFER_OUT");
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({
      direction: "OUT", qtyOut: 6, qtyIn: 0, balanceAfter: 4,
      sourceType: "DELIVERY_ORDER", sourceId: doId, sourceLineId: lineId,
      reference: `${TAG}-DO1`, postingKey: `DO:${lineId}:TRANSFER_OUT`, createdById: ids.user,
    });
    expect(Number(mv[0].unitCost)).toBe(5);
    expect(Number(mv[0].valueDelta)).toBe(-30);
  });

  it("3. dispatch is idempotent — a repeat is refused and posts nothing", async () => {
    const res = await doStatus(req({ status: "IN_TRANSIT" }), { params: { id: doId } });
    expect(res.status).toBe(400);
    expect(await qty(ids.clinicA, ids.itemA)).toBe(4);
    expect((await moves(ids.clinicA, ids.itemA)).filter((m) => m.type === "TRANSFER_OUT")).toHaveLength(1);
  });

  it("4. receipt adds stock at the destination and posts TRANSFER_IN", async () => {
    await doReceivedQty(req({ lineId, receivedQty: 6 }), { params: { id: doId } });
    const res = await doStatus(req({ status: "RECEIVED" }), { params: { id: doId } });
    expect(res.status).toBe(200);
    expect((await res.json()).hasDiscrepancy).toBe(false);

    expect(await qty(ids.clinicB, ids.itemA)).toBe(6);

    const mv = await moves(ids.clinicB, ids.itemA);
    expect(mv.map((m) => m.type)).toEqual(["TRANSFER_IN"]);
    expect(mv[0]).toMatchObject({
      qtyIn: 6, balanceAfter: 6, sourceType: "DELIVERY_ORDER", sourceId: doId,
      postingKey: `DO:${lineId}:TRANSFER_IN`, createdById: ids.user,
    });
    expect(Number(mv[0].valueDelta)).toBe(30);
  });

  it("4. receipt is idempotent", async () => {
    const res = await doStatus(req({ status: "RECEIVED" }), { params: { id: doId } });
    expect(res.status).toBe(400);
    expect(await qty(ids.clinicB, ids.itemA)).toBe(6);
    expect(await moves(ids.clinicB, ids.itemA)).toHaveLength(1);
  });
});

// ── 5. DO discrepancy ────────────────────────────────────────────────────────
describe("5. DO discrepancy", () => {
  let doId = "", lineId = "";

  it("records the shortfall as an explicit variance rather than losing it", async () => {
    const d = await prisma.deliveryOrder.create({
      data: {
        doRef: `${TAG}-DO2`, fromClinicId: ids.clinicA, toClinicId: ids.clinicB, status: "APPROVED",
        lines: { create: [{ itemId: ids.itemB, quantity: 5, unitCost: "4.00" }] },
      },
      include: { lines: true },
    });
    doId = d.id; lineId = d.lines[0].id;

    await doStatus(req({ status: "IN_TRANSIT" }), { params: { id: doId } });
    expect(await qty(ids.clinicA, ids.itemB)).toBe(7); // 12 - 5 dispatched

    await doReceivedQty(req({ lineId, receivedQty: 3 }), { params: { id: doId } });
    const res = await doStatus(req({ status: "RECEIVED" }), { params: { id: doId } });
    expect(res.status).toBe(200);
    expect((await res.json()).hasDiscrepancy).toBe(true);

    // Receiving branch nets the 3 that actually arrived.
    expect(await qty(ids.clinicB, ids.itemB)).toBe(3);

    const mv = await moves(ids.clinicB, ids.itemB);
    expect(mv.map((m) => m.type)).toEqual(["TRANSFER_IN", "TRANSFER_VARIANCE_OUT"]);
    expect(mv[0]).toMatchObject({ qtyIn: 5, balanceAfter: 5, postingKey: `DO:${lineId}:TRANSFER_IN` });
    expect(mv[1]).toMatchObject({
      qtyOut: 2, balanceAfter: 3, clinicId: ids.clinicB,
      postingKey: `DO:${lineId}:VARIANCE`, sourceLineId: lineId, createdById: ids.user,
    });
    expect(mv[1].note).toContain("dispatched 5, received 3");

    // Group-wide the ledger balances: 5 out of A, 5 in to B, 2 written off at B.
    const outA = (await moves(ids.clinicA, ids.itemB)).filter((m) => m.type === "TRANSFER_OUT")[0];
    expect(outA.qtyOut).toBe(5);
    expect(mv[0].qtyIn - mv[1].qtyOut).toBe(3);
  });
});

// ── 6. Pool receipt ──────────────────────────────────────────────────────────
describe("6. Pool receipt", () => {
  let poolId = "", lineId = "";

  it("posts RECEIPT_POOL at the actual invoiced cost, not zero", async () => {
    const pool = await prisma.poolOrder.create({
      data: {
        poRef: `${TAG}-POOL1`, initiatingClinicId: ids.clinicA, supplierName: `${TAG}-supplier`,
        deliveryMode: "CENTRALISED", moqTarget: "100.00", status: "SUBMITTED",
        lines: { create: [{ itemId: ids.itemC, totalQty: 8, unitCost: "6.00", actualUnitCost: "4.00" }] },
      },
      include: { lines: true },
    });
    poolId = pool.id; lineId = pool.lines[0].id;

    session.user = { id: ids.user, role: "CLINIC_MANAGER" };
    const res = await poolStatus(req({ status: "DELIVERED" }), { params: { id: poolId } });
    expect(res.status).toBe(200);

    expect(await qty(ids.clinicA, ids.itemC)).toBe(8);

    const mv = await moves(ids.clinicA, ids.itemC);
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({
      type: "RECEIPT_POOL", direction: "IN", qtyIn: 8, balanceAfter: 8,
      sourceType: "POOL_ORDER", sourceId: poolId, sourceLineId: lineId,
      reference: `${TAG}-POOL1`, postingKey: `POOL:${poolId}:${ids.itemC}:RECEIPT`,
      createdById: ids.user,
    });
    expect(Number(mv[0].unitCost)).toBe(4);   // actualUnitCost wins over ordered 6
    expect(Number(mv[0].valueDelta)).toBe(32);
    expect(await avg(ids.clinicA, ids.itemC)).toBe(4);
  });

  it("is idempotent", async () => {
    const res = await poolStatus(req({ status: "DELIVERED" }), { params: { id: poolId } });
    expect(res.status).toBe(400);
    expect(await qty(ids.clinicA, ids.itemC)).toBe(8);
    expect(await moves(ids.clinicA, ids.itemC)).toHaveLength(1);
  });
});

// ── 7. Invoice revaluation ───────────────────────────────────────────────────
describe("7. Invoice revaluation", () => {
  const invoiceRef = `${TAG}-INV1`;

  it("splits the price correction between inventory and purchase price variance (H-5)", async () => {
    session.user = { id: ids.user, role: "FINANCE" };

    const po = await prisma.purchaseOrder.findFirstOrThrow({
      where: { poRef: `${TAG}-PO1` }, include: { lines: true },
    });
    const line = po.lines[0];

    const qtyBefore = await qty(ids.clinicA, ids.itemA);
    const avgBefore = await avg(ids.clinicA, ids.itemA);
    const before = (await moves(ids.clinicA, ids.itemA)).length;

    // Invoiced at 6.00 rather than the ordered 5.00, on 10 received units.
    const res = await stockInvoice(req({
      source: "SUPPLIER", invoiceRef, month: "2026-08",
      purchaseOrderId: po.id, supplierId: ids.supplier, sst: 0,
      lineUpdates: [{ lineId: line.id, invoicedUnitCost: 6 }],
    }));
    expect(res.status).toBe(201);

    // Quantity untouched — this is a value-only movement.
    expect(await qty(ids.clinicA, ids.itemA)).toBe(qtyBefore);

    // 10 units were received at RM5 and invoiced at RM6, a RM10 correction.
    // Only `qtyBefore` of those units are still on hand, so H-5 allocates the
    // correction proportionally: the held units carry their share as an
    // inventory revaluation and the rest becomes purchase price variance.
    // Loading the whole RM10 onto the remaining units — the behaviour before
    // H-5 — would overstate them by RM10/qtyBefore each.
    const mv = await moves(ids.clinicA, ids.itemA);
    expect(mv).toHaveLength(before + 2);

    const reval = mv.find((m: any) => m.type === "REVALUATION" && m.reference === invoiceRef)!;
    const ppv   = mv.find((m: any) => m.type === "PURCHASE_PRICE_VARIANCE" && m.reference === invoiceRef)!;
    expect(reval).toBeDefined();
    expect(ppv).toBeDefined();

    expect(reval).toMatchObject({
      type: "REVALUATION", direction: "NONE", qtyIn: 0, qtyOut: 0,
      sourceType: "STOCK_INVOICE", sourceId: po.id, sourceLineId: line.id,
      reference: invoiceRef, postingKey: `REVAL:PO:${invoiceRef}:${line.id}`,
      balanceAfter: qtyBefore, createdById: ids.user,
    });
    expect(ppv).toMatchObject({
      type: "PURCHASE_PRICE_VARIANCE", direction: "NONE", qtyIn: 0, qtyOut: 0,
      sourceType: "STOCK_INVOICE", sourceId: po.id, sourceLineId: line.id,
      reference: invoiceRef, postingKey: `PPV:PO:${invoiceRef}:${line.id}`,
      balanceAfter: qtyBefore, createdById: ids.user,
    });

    // The invariant: nothing is lost between the two halves.
    const inventoryShare = Number(reval.valueDelta);
    const ppvShare       = Number(ppv.valueDelta);
    expect(inventoryShare + ppvShare).toBeCloseTo(10, 2);

    // 10 received into the pool, qtyBefore still held → that proportion.
    expect(inventoryShare).toBeCloseTo(10 * (qtyBefore / 10), 2);

    // The average moves by the inventory share only — RM1 per held unit, not
    // the RM10/qtyBefore the pre-H-5 behaviour produced.
    expect(Number(reval.avgCostAfter)).toBeCloseTo(avgBefore + inventoryShare / qtyBefore, 3);
    expect(await avg(ids.clinicA, ids.itemA)).toBeCloseTo(Number(reval.avgCostAfter), 3);
  });

  it("is idempotent — the same invoice reference cannot be recorded twice", async () => {
    const before = (await moves(ids.clinicA, ids.itemA)).length;
    const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { poRef: `${TAG}-PO1` }, include: { lines: true } });
    const res = await stockInvoice(req({
      source: "SUPPLIER", invoiceRef, month: "2026-08",
      purchaseOrderId: po.id, supplierId: ids.supplier, sst: 0,
      lineUpdates: [{ lineId: po.lines[0].id, invoicedUnitCost: 6 }],
    }));
    expect(res.status).toBe(400);
    expect(await moves(ids.clinicA, ids.itemA)).toHaveLength(before);
  });
});

// ── Reconciliation ───────────────────────────────────────────────────────────
describe("8. Drift detection over the test transactions", () => {
  it("reports no ERROR findings", async () => {
    const report = await runDriftDetection([ids.clinicA, ids.clinicB]);
    const errors = report.findings.filter((f) => f.severity === "ERROR");
    expect(errors).toEqual([]);
    expect(report.clean).toBe(true);
  });

  it("reconciles every touched position: opening + in - out = closing", async () => {
    for (const [clinicId, itemId] of [
      [ids.clinicA, ids.itemA], [ids.clinicA, ids.itemB], [ids.clinicA, ids.itemC], [ids.clinicA, ids.itemD],
      [ids.clinicB, ids.itemA], [ids.clinicB, ids.itemB],
    ]) {
      const mv = await moves(clinicId, itemId);
      if (!mv.length) continue;
      const opening = mv[0].balanceAfter - (mv[0].qtyIn - mv[0].qtyOut);
      const closing = mv.reduce((s, m) => s + m.qtyIn - m.qtyOut, opening);
      expect(closing).toBe(mv[mv.length - 1].balanceAfter);
      expect(closing).toBe(await qty(clinicId, itemId));
    }
  });

  it("leaves no movement without a source reference or posting key", async () => {
    const mv = await prisma.stockMovement.findMany({ where: { clinicId: { in: [ids.clinicA, ids.clinicB] } } });
    expect(mv.length).toBeGreaterThan(0);
    for (const m of mv) {
      expect(m.reference).toBeTruthy();
      expect(m.postingKey).toBeTruthy();
      expect(m.sourceType).toBeTruthy();
      expect(m.createdById).toBe(ids.user);
      expect(m.period).toMatch(/^\d{4}-\d{2}$/);
    }
    expect(new Set(mv.map((m) => m.postingKey)).size).toBe(mv.length);
  });
});
