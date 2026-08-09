/**
 * Stock Issue / FEFO / write-off verification (requires a live database).
 *
 *   npx jest --config jest.integration.config.ts
 *
 * Real route handlers, real database, only the session mocked. Covers what
 * unit tests cannot: real batch depletion, concurrency, idempotency and
 * ledger reconciliation.
 */
const session = { user: { id: "", role: "STOREKEEPER" } as any };
jest.mock("next-auth", () => ({ getServerSession: async () => ({ user: session.user }) }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { receiveStock } from "@/lib/stock";
import { postingKeys } from "@/lib/stock-ledger";
import { runDriftDetection } from "@/lib/stock-drift";
import { POST as createIssue } from "@/app/api/stock-issues/route";
import { POST as submitIssue } from "@/app/api/stock-issues/[id]/submit/route";
import { POST as approveIssue } from "@/app/api/stock-issues/[id]/approve/route";

const TAG = `iss-${Date.now()}`;
const req = (body?: unknown) => ({ nextUrl: new URL("http://t"), url: "http://t", json: async () => body }) as any;

const ids = { entity: "", clinic: "", store: "", pic: "", fefo: "", exp: "", plain: "", race: "" };

const qty = async (itemId: string) =>
  (await prisma.clinicStock.findUnique({ where: { clinicId_itemId: { clinicId: ids.clinic, itemId } } }))?.quantity ?? 0;
const moves = (itemId: string) =>
  prisma.stockMovement.findMany({ where: { clinicId: ids.clinic, itemId }, orderBy: { seq: "asc" } });
const batchesOf = (itemId: string) =>
  prisma.stockBatch.findMany({ where: { clinicId: ids.clinic, itemId }, orderBy: { expiryDate: "asc" } });

/** Receive stock, optionally as a dated batch. */
async function receive(itemId: string, quantity: number, cost: number, key: string, batch?: { no: string; expiry: Date }) {
  await receiveStock(
    ids.clinic,
    [{
      itemId, receivedQty: quantity, unitCost: cost, postingKey: `${TAG}:recv:${key}`,
      ...(batch ? { batchNumber: batch.no, expiryDate: batch.expiry } : {}),
    }],
    { type: "RECEIPT_PO", sourceType: "PURCHASE_ORDER", reference: `${TAG}-RECV`, userId: ids.store }
  );
}

async function issue(body: any) {
  session.user = { id: ids.store, role: "STOREKEEPER" };
  const res = await createIssue(req({ clinicId: ids.clinic, ...body }));
  const d = await res.json();
  return { status: res.status, id: d.id as string, body: d };
}

beforeAll(async () => {
  const entity = await prisma.entity.create({ data: { legalName: `${TAG}-entity` } });
  const clinic = await prisma.clinic.create({ data: { name: `${TAG}-clinic`, entityId: entity.id } });
  const store = await prisma.user.create({
    data: { name: `${TAG}-store`, email: `${TAG}-s@verify.local`, passwordHash: "x", role: "STOREKEEPER" },
  });
  const pic = await prisma.user.create({
    data: { name: `${TAG}-pic`, email: `${TAG}-p@verify.local`, passwordHash: "x", role: "CLINIC_MANAGER" },
  });
  await prisma.userClinic.createMany({
    data: [{ userId: store.id, clinicId: clinic.id }, { userId: pic.id, clinicId: clinic.id }],
  });
  await prisma.clinic.update({ where: { id: clinic.id }, data: { picId: pic.id } });

  const mk = (n: string) => prisma.stockItem.create({ data: { sku: `${TAG}-${n}`, name: `${TAG} ${n}`, category: "Verify" } });
  Object.assign(ids, {
    entity: entity.id, clinic: clinic.id, store: store.id, pic: pic.id,
    fefo: (await mk("fefo")).id, exp: (await mk("exp")).id,
    plain: (await mk("plain")).id, race: (await mk("race")).id,
  });

  const soon = new Date(); soon.setDate(soon.getDate() + 30);
  const later = new Date(); later.setDate(later.getDate() + 200);
  const past = new Date(); past.setDate(past.getDate() - 10);

  // FEFO item: 10 expiring soon, 20 expiring later
  await receive(ids.fefo, 10, 5, "fefo-a", { no: "BATCH-A", expiry: soon });
  await receive(ids.fefo, 20, 5, "fefo-b", { no: "BATCH-B", expiry: later });
  // Expiry item: 8 already expired, 5 good
  await receive(ids.exp, 8, 4, "exp-old", { no: "OLD", expiry: past });
  await receive(ids.exp, 5, 4, "exp-new", { no: "NEW", expiry: later });
  // Unbatched item: no batch records at all
  await receive(ids.plain, 12, 3, "plain");
  // Concurrency item
  await receive(ids.race, 10, 2, "race");
});

afterAll(async () => {
  if (ids.clinic) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "dentalos.ledger_maintenance" = 'on'`);
      await tx.stockMovement.deleteMany({ where: { clinicId: ids.clinic } });
    });
    await prisma.stockIssueAllocation.deleteMany({ where: { line: { stockIssue: { clinicId: ids.clinic } } } });
    await prisma.stockIssueLine.deleteMany({ where: { stockIssue: { clinicId: ids.clinic } } });
    await prisma.stockIssue.deleteMany({ where: { clinicId: ids.clinic } });
    await prisma.stockBatch.deleteMany({ where: { clinicId: ids.clinic } });
    await prisma.clinicStock.deleteMany({ where: { clinicId: ids.clinic } });
    await prisma.clinic.update({ where: { id: ids.clinic }, data: { picId: null } });
    await prisma.userClinic.deleteMany({ where: { clinicId: ids.clinic } });
    await prisma.stockItem.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
    await prisma.clinic.deleteMany({ where: { id: ids.clinic } });
    await prisma.entity.deleteMany({ where: { id: ids.entity } });
  }
  await prisma.$disconnect();
});

describe("1/5/8. issuing stock posts a consumption movement", () => {
  it("9/10/11. consumes earliest expiry first across two batches", async () => {
    const { id } = await issue({ reason: "CLINICAL_CONSUMPTION", lines: [{ itemId: ids.fefo, quantity: 15 }] });
    const res = await submitIssue(req(), { params: { id } });
    expect(res.status).toBe(200);

    expect(await qty(ids.fefo)).toBe(15); // 30 - 15

    const batches = await batchesOf(ids.fefo);
    const a = batches.find((b) => b.batchNumber === "BATCH-A")!;
    const b = batches.find((b) => b.batchNumber === "BATCH-B")!;
    expect(a.remainingQty).toBe(0);   // fully consumed first
    expect(b.remainingQty).toBe(15);  // 20 - 5

    const line = await prisma.stockIssueLine.findFirstOrThrow({
      where: { stockIssueId: id }, include: { allocations: { orderBy: { quantity: "desc" } } },
    });
    expect(line.allocations.map((x) => [x.batchNumber, x.quantity])).toEqual([["BATCH-A", 10], ["BATCH-B", 5]]);
    expect(line.allocations.reduce((s, x) => s + x.quantity, 0)).toBe(15);

    const mv = (await moves(ids.fefo)).filter((m) => m.type === "CONSUMPTION");
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({
      direction: "OUT", qtyOut: 15, qtyIn: 0, balanceAfter: 15,
      sourceType: "STOCK_ISSUE", sourceId: id, createdById: ids.store,
    });
    expect(Number(mv[0].unitCost)).toBe(5);
    expect(Number(mv[0].valueDelta)).toBe(-75);
    expect(mv[0].period).toMatch(/^\d{4}-\d{2}$/);
    // issuing never moves the weighted average
    expect(Number(mv[0].avgCostAfter)).toBe(5);
  });

  it("6. a repeated submit cannot post twice", async () => {
    const { id } = await issue({ reason: "GENERAL_USAGE", lines: [{ itemId: ids.fefo, quantity: 2 }] });
    await submitIssue(req(), { params: { id } });
    const before = await qty(ids.fefo);
    const movesBefore = (await moves(ids.fefo)).length;

    const again = await submitIssue(req(), { params: { id } });
    expect(again.status).toBe(409);
    expect(await qty(ids.fefo)).toBe(before);
    expect(await moves(ids.fefo)).toHaveLength(movesBefore);
  });

  it("3. refuses more than is available and leaves stock untouched", async () => {
    const before = await qty(ids.fefo);
    const r = await issue({ reason: "GENERAL_USAGE", lines: [{ itemId: ids.fefo, quantity: before + 1 }] });
    expect(r.status).toBe(409);
    expect(await qty(ids.fefo)).toBe(before);
  });
});

describe("12/13. expired batches and unbatched fallback", () => {
  it("does not consume expired stock for ordinary usage", async () => {
    // 13 on hand but only 5 unexpired; asking for 8 must not reach the expired batch.
    const { id } = await issue({ reason: "CLINICAL_CONSUMPTION", lines: [{ itemId: ids.exp, quantity: 8 }] });
    const res = await submitIssue(req(), { params: { id } });
    expect(res.status).toBe(409);

    const batches = await batchesOf(ids.exp);
    expect(batches.find((b) => b.batchNumber === "OLD")!.remainingQty).toBe(8);  // untouched
    expect(await qty(ids.exp)).toBe(13);
  });

  it("13. falls back to an explicit unbatched allocation", async () => {
    const { id } = await issue({ reason: "GENERAL_USAGE", lines: [{ itemId: ids.plain, quantity: 4 }] });
    const res = await submitIssue(req(), { params: { id } });
    expect(res.status).toBe(200);
    expect(await qty(ids.plain)).toBe(8);

    const line = await prisma.stockIssueLine.findFirstOrThrow({
      where: { stockIssueId: id }, include: { allocations: true },
    });
    expect(line.allocations).toHaveLength(1);
    expect(line.allocations[0].batchId).toBeNull();
    expect(line.allocations[0].batchNumber).toBeNull();
    expect(line.allocations[0].quantity).toBe(4);
  });
});

describe("15-19. expiry write-off", () => {
  let writeOffId = "";

  it("18. holds the write-off for PIC approval instead of posting", async () => {
    const oldBatch = (await batchesOf(ids.exp)).find((b) => b.batchNumber === "OLD")!;
    const r = await issue({
      reason: "EXPIRED",
      lines: [{ itemId: ids.exp, quantity: 8, batchId: oldBatch.id }],
    });
    writeOffId = r.id;

    const res = await submitIssue(req(), { params: { id: writeOffId } });
    expect(res.status).toBe(200);
    expect((await res.json()).awaitingApproval).toBe(true);
    // nothing moved yet
    expect(await qty(ids.exp)).toBe(13);
  });

  it("refuses the raiser approving their own write-off", async () => {
    session.user = { id: ids.store, role: "STOREKEEPER" };
    const res = await approveIssue(req(), { params: { id: writeOffId } });
    expect(res.status).toBe(403);
    expect(await qty(ids.exp)).toBe(13);
  });

  it("15/16/17. PIC approval depletes the batch, the stock and posts the movement", async () => {
    session.user = { id: ids.pic, role: "CLINIC_MANAGER" };
    const res = await approveIssue(req(), { params: { id: writeOffId } });
    expect(res.status).toBe(200);

    expect(await qty(ids.exp)).toBe(5);
    const batches = await batchesOf(ids.exp);
    expect(batches.find((b) => b.batchNumber === "OLD")!.remainingQty).toBe(0);
    expect(batches.find((b) => b.batchNumber === "NEW")!.remainingQty).toBe(5);

    const mv = (await moves(ids.exp)).filter((m) => m.type === "WRITE_OFF_EXPIRY");
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({
      direction: "OUT", qtyOut: 8, balanceAfter: 5, sourceType: "WRITE_OFF", createdById: ids.pic,
    });
    expect(Number(mv[0].valueDelta)).toBe(-32); // 8 @ 4.00
  });

  it("19. a repeated approval cannot write the stock off twice", async () => {
    session.user = { id: ids.pic, role: "CLINIC_MANAGER" };
    const res = await approveIssue(req(), { params: { id: writeOffId } });
    expect(res.status).toBe(409);
    expect(await qty(ids.exp)).toBe(5);
    expect((await moves(ids.exp)).filter((m) => m.type === "WRITE_OFF_EXPIRY")).toHaveLength(1);
  });

  it("uses a deterministic posting key linked to the line", async () => {
    const line = await prisma.stockIssueLine.findFirstOrThrow({ where: { stockIssueId: writeOffId } });
    const mv = await prisma.stockMovement.findUnique({ where: { postingKey: postingKeys.stockIssue(line.id) } });
    expect(mv).toBeTruthy();
    expect(mv!.sourceLineId).toBe(line.id);
  });
});

describe("4/7. concurrency cannot overspend stock", () => {
  it("lets only one of two competing issues succeed", async () => {
    expect(await qty(ids.race)).toBe(10);

    const a = await issue({ reason: "GENERAL_USAGE", lines: [{ itemId: ids.race, quantity: 8 }] });
    const b = await issue({ reason: "GENERAL_USAGE", lines: [{ itemId: ids.race, quantity: 8 }] });

    const [ra, rb] = await Promise.all([
      submitIssue(req(), { params: { id: a.id } }),
      submitIssue(req(), { params: { id: b.id } }),
    ]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([200, 409]);

    expect(await qty(ids.race)).toBe(2);
    const out = (await moves(ids.race)).filter((m) => m.direction === "OUT");
    expect(out).toHaveLength(1);
    expect(out[0].qtyOut).toBe(8);
    expect(out[0].balanceAfter).toBe(2);
  });

  it("never drives a batch below zero under contention", async () => {
    const batches = await prisma.stockBatch.findMany({ where: { clinicId: ids.clinic } });
    for (const b of batches) expect(b.remainingQty).toBeGreaterThanOrEqual(0);
  });
});

describe("20/21. reconciliation", () => {
  it("reports no drift for the clinic", async () => {
    const report = await runDriftDetection([ids.clinic]);
    expect(report.findings.filter((f) => f.severity === "ERROR")).toEqual([]);
    expect(report.clean).toBe(true);
  });

  it("reconciles every item: opening + in - out = closing = ClinicStock", async () => {
    for (const itemId of [ids.fefo, ids.exp, ids.plain, ids.race]) {
      const mv = await moves(itemId);
      const opening = mv[0].balanceAfter - (mv[0].qtyIn - mv[0].qtyOut);
      const closing = mv.reduce((s, m) => s + m.qtyIn - m.qtyOut, opening);
      expect(closing).toBe(mv[mv.length - 1].balanceAfter);
      expect(closing).toBe(await qty(itemId));
    }
  });

  it("14. batch allocations reconcile to the quantity issued", async () => {
    const lines = await prisma.stockIssueLine.findMany({
      where: { stockIssue: { clinicId: ids.clinic, status: "POSTED" } },
      include: { allocations: true },
    });
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.allocations.reduce((s, a) => s + a.quantity, 0)).toBe(l.quantity);
    }
  });

  it("batch remaining never exceeds stock on hand", async () => {
    for (const itemId of [ids.fefo, ids.exp, ids.plain]) {
      const batched = (await batchesOf(itemId)).reduce((s, b) => s + b.remainingQty, 0);
      expect(batched).toBeLessThanOrEqual(await qty(itemId));
    }
  });
});
