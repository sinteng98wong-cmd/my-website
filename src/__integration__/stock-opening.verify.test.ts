/**
 * Opening Balance end-to-end verification (requires a live database).
 *
 *   npx jest --config jest.integration.config.ts
 *
 * Drives the real route handlers against real Postgres. Proves the posting
 * establishes the position correctly, that the guards actually hold, and that
 * a refused approval leaves nothing behind.
 */
const session = { user: { id: "", role: "STOREKEEPER" } as any };
jest.mock("next-auth", () => ({ getServerSession: async () => ({ user: session.user }) }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { periodOf, postingKeys } from "@/lib/stock-ledger";
import { receiveStock } from "@/lib/stock";
import { lockPeriod, unlockPeriod } from "@/lib/stock-period";
import { runDriftDetection } from "@/lib/stock-drift";
import { POST as createDoc, GET as listDocs } from "@/app/api/stock-opening/route";
import { GET as getDoc, DELETE as deleteDoc } from "@/app/api/stock-opening/[id]/route";
import { PATCH as patchLine } from "@/app/api/stock-opening/[id]/lines/route";
import { POST as submitDoc } from "@/app/api/stock-opening/[id]/submit/route";
import { POST as approveDoc } from "@/app/api/stock-opening/[id]/approve/route";
import { POST as rejectDoc } from "@/app/api/stock-opening/[id]/reject/route";

const TAG = `ob-${Date.now()}`;
const req = (body?: unknown, url = "http://t") =>
  ({ nextUrl: new URL(url), url, json: async () => body }) as any;

const ids = {
  entity: "", clinicA: "", clinicB: "",
  branch: "", manager: "", admin: "",
  plain: "", batched: "", zero: "", used: "",
};
const NOW = () => periodOf(new Date());
const ctx = (id: string) => ({ params: { id } });

const stock = (clinicId: string, itemId: string) =>
  prisma.clinicStock.findUnique({ where: { clinicId_itemId: { clinicId, itemId } } });
const moves = (clinicId: string, itemId: string) =>
  prisma.stockMovement.findMany({ where: { clinicId, itemId }, orderBy: { seq: "asc" } });

/** Raise a draft as the branch user and return its id. */
async function draft(clinicId: string, itemIds: string[]) {
  session.user = { id: ids.branch, role: "STOREKEEPER" };
  const res = await createDoc(req({ clinicId, itemIds }));
  expect(res.status).toBe(201);
  return (await res.json()).id as string;
}

async function setLine(docId: string, itemId: string, patch: Record<string, unknown>) {
  const full = await prisma.openingBalance.findUniqueOrThrow({ where: { id: docId }, include: { lines: true } });
  const line = full.lines.find((l) => l.itemId === itemId)!;
  return patchLine(req({ lineId: line.id, ...patch }), ctx(docId));
}

beforeAll(async () => {
  const entity = await prisma.entity.create({ data: { legalName: `${TAG}-entity` } });
  const [clinicA, clinicB] = await Promise.all([
    prisma.clinic.create({ data: { name: `${TAG}-A`, entityId: entity.id } }),
    prisma.clinic.create({ data: { name: `${TAG}-B`, entityId: entity.id } }),
  ]);
  const [branch, manager, admin] = await Promise.all([
    prisma.user.create({ data: { name: `${TAG}-branch`, email: `${TAG}-b@verify.local`, passwordHash: "x", role: "STOREKEEPER" } }),
    prisma.user.create({ data: { name: `${TAG}-mgr`,    email: `${TAG}-m@verify.local`, passwordHash: "x", role: "CLINIC_MANAGER" } }),
    prisma.user.create({ data: { name: `${TAG}-admin`,  email: `${TAG}-a@verify.local`, passwordHash: "x", role: "SUPER_ADMIN" } }),
  ]);
  await prisma.userClinic.createMany({
    data: [
      { userId: branch.id,  clinicId: clinicA.id },
      { userId: manager.id, clinicId: clinicA.id },
    ],
  });
  const mk = (n: string) => prisma.stockItem.create({ data: { sku: `${TAG}-${n}`, name: `${TAG} ${n}`, category: "Verify" } });
  Object.assign(ids, {
    entity: entity.id, clinicA: clinicA.id, clinicB: clinicB.id,
    branch: branch.id, manager: manager.id, admin: admin.id,
    plain: (await mk("plain")).id, batched: (await mk("batched")).id,
    zero: (await mk("zero")).id,   used: (await mk("used")).id,
  });

  // One item deliberately already carries ledger history.
  session.user = { id: ids.admin, role: "SUPER_ADMIN" };
  await receiveStock(
    ids.clinicA,
    [{ itemId: ids.used, receivedQty: 5, unitCost: 3, postingKey: `${TAG}:pre-existing` }],
    { type: "RECEIPT_PO", sourceType: "PURCHASE_ORDER", reference: `${TAG}-PRE`, userId: ids.admin }
  );
});

afterAll(async () => {
  if (ids.clinicA) {
    const clinics = [ids.clinicA, ids.clinicB];
    await prisma.openingBalanceLine.deleteMany({ where: { openingBalance: { clinicId: { in: clinics } } } });
    await prisma.openingBalance.deleteMany({ where: { clinicId: { in: clinics } } });
    await prisma.stockPeriodLock.deleteMany({ where: { clinicId: { in: clinics } } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "dentalos.ledger_maintenance" = 'on'`);
      await tx.stockMovement.deleteMany({ where: { clinicId: { in: clinics } } });
    });
    await prisma.stockBatch.deleteMany({ where: { clinicId: { in: clinics } } });
    await prisma.clinicStock.deleteMany({ where: { clinicId: { in: clinics } } });
    await prisma.userClinic.deleteMany({ where: { clinicId: { in: clinics } } });
    await prisma.stockItem.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
    await prisma.clinic.deleteMany({ where: { id: { in: clinics } } });
    await prisma.entity.deleteMany({ where: { id: ids.entity } });
  }
  await prisma.$disconnect();
});

// ── 1-11. The happy path ────────────────────────────────────────────────────

describe("1-11. draft → submit → approve → post", () => {
  let docId = "";

  it("1-3. creates a draft with blank figures and saves entered values", async () => {
    docId = await draft(ids.clinicA, [ids.plain, ids.batched, ids.zero]);

    const fresh = await prisma.openingBalance.findUniqueOrThrow({ where: { id: docId }, include: { lines: true } });
    expect(fresh.status).toBe("DRAFT");
    expect(fresh.lines).toHaveLength(3);
    // Nothing is pre-populated — no invented quantities or costs.
    expect(fresh.lines.every((l) => l.quantity === null && l.unitCost === null)).toBe(true);

    expect((await setLine(docId, ids.plain,   { quantity: 20, unitCost: 4.5 })).status).toBe(200);
    expect((await setLine(docId, ids.batched, { quantity: 10, unitCost: 2, batchNumber: "B-77", expiryDate: "2027-06-30" })).status).toBe(200);
    expect((await setLine(docId, ids.zero,    { quantity: 0 })).status).toBe(200);
  });

  it("4. submits for review", async () => {
    const res = await submitDoc(req(), ctx(docId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("SUBMITTED");
    expect(body.quantity).toBe(30);          // 20 + 10 + 0
    expect(body.value).toBe(110);            // 20×4.5 + 10×2
  });

  it("5. is visible to an authorised reviewer", async () => {
    session.user = { id: ids.manager, role: "CLINIC_MANAGER" };
    const res = await listDocs(req(undefined, `http://t?clinicId=${ids.clinicA}&status=SUBMITTED`));
    expect(res.status).toBe(200);
    expect((await res.json()).some((d: any) => d.id === docId)).toBe(true);
  });

  it("6-11. approves, posting the ledger and the balances", async () => {
    session.user = { id: ids.manager, role: "CLINIC_MANAGER" };
    const res = await approveDoc(req(), ctx(docId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("APPROVED");
    expect(body.postedLines).toBe(2);        // the zero line posts nothing

    // 7. movement created, with the expected shape
    const mv = await moves(ids.clinicA, ids.plain);
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({
      type: "OPENING_BALANCE", direction: "IN", qtyIn: 20, qtyOut: 0,
      sourceType: "OPENING_BALANCE", balanceAfter: 20,
    });

    // 8/9. balance and cost basis established from the entered figures
    const cs = await stock(ids.clinicA, ids.plain);
    expect(cs!.quantity).toBe(20);
    expect(Number(cs!.avgUnitCost)).toBeCloseTo(4.5, 4);

    // 10. value
    expect(Number(mv[0].valueDelta)).toBeCloseTo(90, 2);   // 20 × 4.5
    expect(Number(mv[0].avgCostAfter)).toBeCloseTo(4.5, 4);

    // 11. deterministic posting key
    expect(mv[0].postingKey).toBe(postingKeys.opening(ids.clinicA, ids.plain));

    // 23. current MYT period
    expect(mv[0].period).toBe(NOW());
  });

  it("15. creates no movement for the counted zero", async () => {
    expect(await moves(ids.clinicA, ids.zero)).toHaveLength(0);
    // and no ClinicStock row was conjured for it either
    expect(await stock(ids.clinicA, ids.zero)).toBeNull();
  });

  it("24. preserves supplied batch information", async () => {
    const batch = await prisma.stockBatch.findFirst({ where: { clinicId: ids.clinicA, itemId: ids.batched } });
    expect(batch).not.toBeNull();
    expect(batch!.batchNumber).toBe("B-77");
    expect(batch!.quantity).toBe(10);
    expect(batch!.remainingQty).toBe(10);
    expect(Number(batch!.unitCost)).toBeCloseTo(2, 4);
    expect(batch!.expiryDate?.toISOString().slice(0, 10)).toBe("2027-06-30");
  });

  it("25. leaves unbatched opening stock unbatched", async () => {
    // No batch number or expiry was given for the plain item — none is invented.
    expect(await prisma.stockBatch.count({ where: { clinicId: ids.clinicA, itemId: ids.plain } })).toBe(0);
  });

  it("12. refuses a second opening balance for the same clinic and item", async () => {
    const second = await draft(ids.clinicA, [ids.plain]);
    await setLine(second, ids.plain, { quantity: 5, unitCost: 1 });
    const res = await submitDoc(req(), ctx(second));
    // The item now has ledger history, so it is caught at submission.
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already have stock movements/i);

    // and nothing changed
    const cs = await stock(ids.clinicA, ids.plain);
    expect(cs!.quantity).toBe(20);
    await prisma.openingBalance.delete({ where: { id: second } });
  });
});

// ── 13-17. Guards ───────────────────────────────────────────────────────────

describe("13-17. guards", () => {
  it("13. refuses an item that already has stock movements", async () => {
    const d = await draft(ids.clinicA, [ids.used]);
    await setLine(d, ids.used, { quantity: 9, unitCost: 2 });
    const res = await submitDoc(req(), ctx(d));
    expect(res.status).toBe(409);

    const cs = await stock(ids.clinicA, ids.used);
    expect(cs!.quantity).toBe(5);     // untouched by the attempt
    await prisma.openingBalance.delete({ where: { id: d } });
  });

  it("14. refuses a positive quantity with no cost", async () => {
    const item = await prisma.stockItem.create({ data: { sku: `${TAG}-nc`, name: `${TAG} nocost`, category: "Verify" } });
    const d = await draft(ids.clinicA, [item.id]);
    await setLine(d, item.id, { quantity: 12 });        // cost deliberately absent
    const res = await submitDoc(req(), ctx(d));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/unit cost is required/i);
    await prisma.openingBalance.delete({ where: { id: d } });
  });

  it("16/17. refuses negative quantity and non-positive cost at the line", async () => {
    const item = await prisma.stockItem.create({ data: { sku: `${TAG}-neg`, name: `${TAG} neg`, category: "Verify" } });
    const d = await draft(ids.clinicA, [item.id]);
    expect((await setLine(d, item.id, { quantity: -3 })).status).toBe(422);
    expect((await setLine(d, item.id, { quantity: 5, unitCost: 0 })).status).toBe(422);
    expect((await setLine(d, item.id, { quantity: 5, unitCost: -2 })).status).toBe(422);
    await prisma.openingBalance.delete({ where: { id: d } });
  });
});

// ── 18-21. Access, authority, rejection ─────────────────────────────────────

describe("18-21. access and authority", () => {
  it("18. refuses a branch user reaching another clinic", async () => {
    session.user = { id: ids.branch, role: "STOREKEEPER" };
    const res = await createDoc(req({ clinicId: ids.clinicB, itemIds: [ids.plain] }));
    expect(res.status).toBe(403);
  });

  it("18. refuses reading another clinic's document", async () => {
    session.user = { id: ids.admin, role: "SUPER_ADMIN" };
    const other = (await createDoc(req({ clinicId: ids.clinicB, itemIds: [ids.plain] })).then((r) => r.json())).id;
    session.user = { id: ids.branch, role: "STOREKEEPER" };
    const res = await getDoc(req(), ctx(other));
    expect(res.status).toBe(403);
    await prisma.openingBalance.delete({ where: { id: other } });
  });

  it("19. refuses approval by a storekeeper", async () => {
    const d = await draft(ids.clinicA, [ids.zero]);
    await setLine(d, ids.zero, { quantity: 3, unitCost: 1 });
    await submitDoc(req(), ctx(d));
    session.user = { id: ids.branch, role: "STOREKEEPER" };
    const res = await approveDoc(req(), ctx(d));
    expect(res.status).toBe(403);
    expect(await moves(ids.clinicA, ids.zero)).toHaveLength(0);
    await prisma.openingBalance.delete({ where: { id: d } });
  });

  it("19. refuses approval by the person who raised and submitted it", async () => {
    const d = await draft(ids.clinicA, [ids.zero]);
    await setLine(d, ids.zero, { quantity: 3, unitCost: 1 });
    await submitDoc(req(), ctx(d));
    // Same user, but now wearing a reviewer role — separation of duties still applies.
    session.user = { id: ids.branch, role: "CLINIC_MANAGER" };
    const res = await approveDoc(req(), ctx(d));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/raised or submitted/i);
    await prisma.openingBalance.delete({ where: { id: d } });
  });

  it("20. a rejected opening balance alters no stock", async () => {
    const d = await draft(ids.clinicA, [ids.zero]);
    await setLine(d, ids.zero, { quantity: 7, unitCost: 2 });
    await submitDoc(req(), ctx(d));

    session.user = { id: ids.manager, role: "CLINIC_MANAGER" };
    const res = await rejectDoc(req({ reason: "recount the shelf" }), ctx(d));
    expect(res.status).toBe(200);

    const doc = await prisma.openingBalance.findUniqueOrThrow({ where: { id: d } });
    expect(doc.status).toBe("REJECTED");
    expect(doc.reviewNote).toBe("recount the shelf");
    expect(await moves(ids.clinicA, ids.zero)).toHaveLength(0);
    expect(await stock(ids.clinicA, ids.zero)).toBeNull();
    await prisma.openingBalance.delete({ where: { id: d } });
  });

  it("21. a failed approval posts nothing at all", async () => {
    // Two items, one of which already has history: the whole document is refused.
    const d = await draft(ids.clinicA, [ids.zero, ids.used]);
    await setLine(d, ids.zero, { quantity: 4, unitCost: 1 });
    await setLine(d, ids.used, { quantity: 4, unitCost: 1 });
    await prisma.openingBalance.update({ where: { id: d }, data: { status: "SUBMITTED", submittedById: ids.branch } });

    session.user = { id: ids.manager, role: "CLINIC_MANAGER" };
    const res = await approveDoc(req(), ctx(d));
    expect(res.status).toBe(409);

    // Neither line posted — the good one did not sneak through.
    expect(await moves(ids.clinicA, ids.zero)).toHaveLength(0);
    expect(await stock(ids.clinicA, ids.zero)).toBeNull();
    expect((await prisma.openingBalance.findUniqueOrThrow({ where: { id: d } })).status).toBe("SUBMITTED");
    await prisma.openingBalance.delete({ where: { id: d } });
  });
});

// ── 22. Period lock ─────────────────────────────────────────────────────────

describe("22. a locked period prevents posting", () => {
  it("refuses with 409 and leaves stock untouched", async () => {
    const item = await prisma.stockItem.create({ data: { sku: `${TAG}-lk`, name: `${TAG} locked`, category: "Verify" } });
    const d = await draft(ids.clinicA, [item.id]);
    await setLine(d, item.id, { quantity: 6, unitCost: 3 });
    await submitDoc(req(), ctx(d));

    await lockPeriod({ clinicId: ids.clinicA, period: NOW(), userId: ids.admin, notes: "verify" });

    session.user = { id: ids.manager, role: "CLINIC_MANAGER" };
    const res = await approveDoc(req(), ctx(d));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("PERIOD_LOCKED");

    expect(await moves(ids.clinicA, item.id)).toHaveLength(0);
    expect(await stock(ids.clinicA, item.id)).toBeNull();
    expect((await prisma.openingBalance.findUniqueOrThrow({ where: { id: d } })).status).toBe("SUBMITTED");

    // Reopening lets the same document post.
    await unlockPeriod({ clinicId: ids.clinicA, period: NOW(), userId: ids.admin, reason: "verify" });
    const after = await approveDoc(req(), ctx(d));
    expect(after.status).toBe(200);
    expect((await stock(ids.clinicA, item.id))!.quantity).toBe(6);
  }, 30_000);
});

// ── 26. Drift ───────────────────────────────────────────────────────────────

describe("26. drift after a valid opening balance", () => {
  it("stays clean", async () => {
    const report = await runDriftDetection([ids.clinicA, ids.clinicB]);
    expect(report.findings.filter((f) => f.severity === "ERROR")).toEqual([]);
  }, 30_000);
});
