/**
 * Stock Take end-to-end verification (requires a live database).
 *
 *   npx jest --config jest.integration.config.ts
 *
 * Drives the real route handlers against the real database. Only the session
 * is mocked. Covers what unit tests cannot: that approval really posts through
 * the atomic mutation path, that ClinicStock and the ledger stay reconciled,
 * that a repeat approval cannot duplicate movements, and that stock moving
 * mid-count blocks the posting.
 */
const session = { user: { id: "", role: "STOREKEEPER" } as any };
jest.mock("next-auth", () => ({ getServerSession: async () => ({ user: session.user }) }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { postingKeys } from "@/lib/stock-ledger";
import { receiveStock } from "@/lib/stock";
import { runDriftDetection } from "@/lib/stock-drift";
import { POST as createTake } from "@/app/api/stock-takes/route";
import { PATCH as patchLine } from "@/app/api/stock-takes/[id]/lines/route";
import { POST as submitTake } from "@/app/api/stock-takes/[id]/submit/route";
import { POST as approveTake } from "@/app/api/stock-takes/[id]/approve/route";

const TAG = `stk-${Date.now()}`;
const req = (body?: unknown) => ({ nextUrl: new URL("http://t"), url: "http://t", json: async () => body }) as any;

const ids = { entity: "", clinic: "", counter: "", pic: "", up: "", down: "", same: "" };

const qty = async (itemId: string) =>
  (await prisma.clinicStock.findUnique({ where: { clinicId_itemId: { clinicId: ids.clinic, itemId } } }))?.quantity ?? 0;
const moves = (itemId: string) =>
  prisma.stockMovement.findMany({ where: { clinicId: ids.clinic, itemId }, orderBy: { seq: "asc" } });

async function seedStock(itemId: string, quantity: number, unitCost: number, key: string) {
  await receiveStock(
    ids.clinic,
    [{ itemId, receivedQty: quantity, unitCost, postingKey: `${TAG}:seed:${key}` }],
    { type: "RECEIPT_PO", sourceType: "PURCHASE_ORDER", reference: `${TAG}-SEED`, userId: ids.counter }
  );
}

beforeAll(async () => {
  const entity = await prisma.entity.create({ data: { legalName: `${TAG}-entity` } });
  const clinic = await prisma.clinic.create({ data: { name: `${TAG}-clinic`, entityId: entity.id } });
  const counter = await prisma.user.create({
    data: { name: `${TAG}-counter`, email: `${TAG}-c@verify.local`, passwordHash: "x", role: "STOREKEEPER" },
  });
  const pic = await prisma.user.create({
    data: { name: `${TAG}-pic`, email: `${TAG}-p@verify.local`, passwordHash: "x", role: "CLINIC_MANAGER" },
  });
  await prisma.userClinic.createMany({
    data: [{ userId: counter.id, clinicId: clinic.id }, { userId: pic.id, clinicId: clinic.id }],
  });
  await prisma.clinic.update({ where: { id: clinic.id }, data: { picId: pic.id } });

  const mk = (n: string) => prisma.stockItem.create({
    data: { sku: `${TAG}-${n}`, name: `${TAG} ${n}`, category: "Verify" },
  });
  Object.assign(ids, {
    entity: entity.id, clinic: clinic.id, counter: counter.id, pic: pic.id,
    up: (await mk("up")).id, down: (await mk("down")).id, same: (await mk("same")).id,
  });

  session.user = { id: counter.id, role: "STOREKEEPER" };
  await seedStock(ids.up, 10, 5, "up");
  await seedStock(ids.down, 10, 4, "down");
  await seedStock(ids.same, 10, 3, "same");
});

afterAll(async () => {
  if (ids.clinic) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "dentalos.ledger_maintenance" = 'on'`);
      await tx.stockMovement.deleteMany({ where: { clinicId: ids.clinic } });
    });
    await prisma.stockTakeLine.deleteMany({ where: { stockTake: { clinicId: ids.clinic } } });
    await prisma.stockTake.deleteMany({ where: { clinicId: ids.clinic } });
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

/** Raise a count over the three fixture items and enter physical quantities. */
async function raiseCount(physical: Record<string, number | null>, reason = "STOCK_COUNT_VARIANCE") {
  session.user = { id: ids.counter, role: "STOREKEEPER" };
  const res = await createTake(req({ clinicId: ids.clinic, itemIds: [ids.up, ids.down, ids.same] }));
  const take = await res.json();

  const full = await prisma.stockTake.findUniqueOrThrow({ where: { id: take.id }, include: { lines: true } });
  for (const line of full.lines) {
    const p = physical[line.itemId];
    if (p === undefined) continue;
    await patchLine(
      req({ lineId: line.id, physicalQty: p, reason: p !== null && p !== line.systemQty ? reason : null }),
      { params: { id: take.id } }
    );
  }
  return take.id as string;
}

describe("3/4/5. approval posts the right movement per variance", () => {
  let takeId = "";

  it("submits a count with an increase, a decrease and a match", async () => {
    takeId = await raiseCount({ [ids.up]: 13, [ids.down]: 7, [ids.same]: 10 });
    const res = await submitTake(req(), { params: { id: takeId } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("SUBMITTED");
    // +3 @5 = +15, -3 @4 = -12, 0 → net variance 0 qty, +3.00 value
    expect(body.varianceQty).toBe(0);
    expect(body.varianceValue).toBe(3);
  });

  it("posts ADJUSTMENT_IN for the higher count and moves stock", async () => {
    session.user = { id: ids.pic, role: "CLINIC_MANAGER" };
    const res = await approveTake(req(), { params: { id: takeId } });
    expect(res.status).toBe(200);
    expect((await res.json()).movements).toBe(2);

    expect(await qty(ids.up)).toBe(13);
    const mv = (await moves(ids.up)).filter((m) => m.type === "ADJUSTMENT_IN");
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({
      direction: "IN", qtyIn: 3, balanceAfter: 13,
      sourceType: "STOCK_TAKE", sourceId: takeId, createdById: ids.pic,
    });
    expect(Number(mv[0].unitCost)).toBe(5);
    expect(Number(mv[0].valueDelta)).toBe(15);
    expect(mv[0].period).toMatch(/^\d{4}-\d{2}$/);
    // found stock enters at the average in force, so costing is unmoved
    expect(Number(mv[0].avgCostAfter)).toBe(5);
  });

  it("posts ADJUSTMENT_OUT for the lower count", async () => {
    expect(await qty(ids.down)).toBe(7);
    const mv = (await moves(ids.down)).filter((m) => m.type === "ADJUSTMENT_OUT");
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ direction: "OUT", qtyOut: 3, balanceAfter: 7, sourceType: "STOCK_TAKE" });
    expect(Number(mv[0].valueDelta)).toBe(-12);
  });

  it("posts nothing at all for the matching line", async () => {
    expect(await qty(ids.same)).toBe(10);
    const adj = (await moves(ids.same)).filter((m) => m.type.startsWith("ADJUSTMENT"));
    expect(adj).toHaveLength(0);
  });

  it("links each posted line back to its movement and freezes what was posted", async () => {
    const lines = await prisma.stockTakeLine.findMany({ where: { stockTakeId: takeId } });
    const up = lines.find((l) => l.itemId === ids.up)!;
    expect(up.postedVarianceQty).toBe(3);
    expect(Number(up.postedUnitCost)).toBe(5);
    expect(up.movementId).toBeTruthy();
    const same = lines.find((l) => l.itemId === ids.same)!;
    expect(same.movementId).toBeNull();
  });

  it("8. a repeated approval cannot duplicate the movements", async () => {
    const before = (await moves(ids.up)).length;
    session.user = { id: ids.pic, role: "CLINIC_MANAGER" };
    const res = await approveTake(req(), { params: { id: takeId } });
    expect(res.status).toBe(409);
    expect(await moves(ids.up)).toHaveLength(before);
    expect(await qty(ids.up)).toBe(13);
  });

  it("9. an approved take can no longer be counted on", async () => {
    session.user = { id: ids.counter, role: "STOREKEEPER" };
    const line = await prisma.stockTakeLine.findFirstOrThrow({ where: { stockTakeId: takeId } });
    const res = await patchLine(req({ lineId: line.id, physicalQty: 99 }), { params: { id: takeId } });
    expect(res.status).toBe(409);
  });

  it("uses a deterministic posting key per line", async () => {
    const line = await prisma.stockTakeLine.findFirstOrThrow({ where: { stockTakeId: takeId, itemId: ids.up } });
    const mv = await prisma.stockMovement.findUnique({ where: { postingKey: postingKeys.stockTake(line.id) } });
    expect(mv).toBeTruthy();
    expect(mv!.sourceLineId).toBe(line.id);
  });
});

describe("10. stock moving after the count blocks approval", () => {
  it("refuses to post and sends the take back for a recount", async () => {
    const takeId = await raiseCount({ [ids.up]: 20, [ids.down]: 7, [ids.same]: 10 });
    await submitTake(req(), { params: { id: takeId } });

    // A real receipt lands while the count is awaiting approval.
    const before = await qty(ids.up);
    await seedStock(ids.up, 5, 5, "drift");
    expect(await qty(ids.up)).toBe(before + 5);

    session.user = { id: ids.pic, role: "CLINIC_MANAGER" };
    const res = await approveTake(req(), { params: { id: takeId } });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.drifted).toHaveLength(1);
    expect(body.drifted[0]).toMatchObject({ countedSystemQty: before, currentSystemQty: before + 5 });

    // No adjustment was posted, and the take is waiting to be re-counted.
    const adj = (await moves(ids.up)).filter((m) => m.type === "ADJUSTMENT_IN");
    expect(adj).toHaveLength(1); // only the earlier approved one
    const take = await prisma.stockTake.findUniqueOrThrow({ where: { id: takeId }, include: { lines: true } });
    expect(take.status).toBe("RECOUNT_REQUIRED");
    const refreshed = take.lines.find((l) => l.itemId === ids.up)!;
    expect(refreshed.systemQty).toBe(before + 5);
    expect(refreshed.physicalQty).toBeNull();
  });
});

describe("12. stock and ledger stay reconciled", () => {
  it("reports no drift over the clinic after all adjustments", async () => {
    const report = await runDriftDetection([ids.clinic]);
    expect(report.findings.filter((f) => f.severity === "ERROR")).toEqual([]);
    expect(report.clean).toBe(true);
  });

  it("reconciles every touched item: opening + in - out = closing", async () => {
    for (const itemId of [ids.up, ids.down, ids.same]) {
      const mv = await moves(itemId);
      const opening = mv[0].balanceAfter - (mv[0].qtyIn - mv[0].qtyOut);
      const closing = mv.reduce((s, m) => s + m.qtyIn - m.qtyOut, opening);
      expect(closing).toBe(mv[mv.length - 1].balanceAfter);
      expect(closing).toBe(await qty(itemId));
    }
  });
});
