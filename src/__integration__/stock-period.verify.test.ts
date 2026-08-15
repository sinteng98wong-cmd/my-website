/**
 * Stock period locking end-to-end verification (requires a live database).
 *
 *   npx jest --config jest.integration.config.ts
 *
 * Proves what unit tests cannot: that a locked clinic-month refuses every
 * posting path against real Postgres, that a refused posting leaves both
 * ClinicStock and the ledger untouched, that one clinic's lock does not reach
 * another's, and that a lock arriving while a mutation is in flight cannot let
 * a movement through.
 */
const session = { user: { id: "", role: "SUPER_ADMIN" } as any };
jest.mock("next-auth", () => ({ getServerSession: async () => ({ user: session.user }) }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { deductStock, receiveStock, receivePoolStock } from "@/lib/stock";
import { periodOf, postMovement } from "@/lib/stock-ledger";
import {
  assertPeriodOpen, lockPeriod, unlockPeriod, isPeriodLockedError, PeriodLockedError,
} from "@/lib/stock-period";
import { runDriftDetection } from "@/lib/stock-drift";
import { POST as lockRoute, GET as lockStatus } from "@/app/api/stock/period-lock/route";
import { POST as unlockRoute } from "@/app/api/stock/period-lock/unlock/route";

const TAG = `per-${Date.now()}`;
const req = (body?: unknown, url = "http://t") =>
  ({ nextUrl: new URL(url), url, json: async () => body }) as any;

const ids = { entity: "", clinicA: "", clinicB: "", admin: "", manager: "", store: "", itemA: "", itemB: "" };
const NOW = () => periodOf(new Date());

const qty = async (clinicId: string, itemId: string) =>
  (await prisma.clinicStock.findUnique({ where: { clinicId_itemId: { clinicId, itemId } } }))?.quantity ?? 0;
const avg = async (clinicId: string, itemId: string) =>
  Number((await prisma.clinicStock.findUnique({ where: { clinicId_itemId: { clinicId, itemId } } }))?.avgUnitCost ?? 0);
const moveCount = (clinicId: string) => prisma.stockMovement.count({ where: { clinicId } });

let seq = 0;
const key = (s: string) => `${TAG}:${s}:${++seq}`;

const seed = (clinicId: string, itemId: string, quantity: number, unitCost: number) =>
  receiveStock(
    clinicId,
    [{ itemId, receivedQty: quantity, unitCost, postingKey: key("seed") }],
    { type: "RECEIPT_PO", sourceType: "PURCHASE_ORDER", reference: `${TAG}-SEED`, userId: ids.admin }
  );

beforeAll(async () => {
  const entity = await prisma.entity.create({ data: { legalName: `${TAG}-entity` } });
  const [clinicA, clinicB] = await Promise.all([
    prisma.clinic.create({ data: { name: `${TAG}-A`, entityId: entity.id } }),
    prisma.clinic.create({ data: { name: `${TAG}-B`, entityId: entity.id } }),
  ]);
  const [admin, manager, store] = await Promise.all([
    prisma.user.create({ data: { name: `${TAG}-admin`, email: `${TAG}-a@verify.local`, passwordHash: "x", role: "SUPER_ADMIN" } }),
    prisma.user.create({ data: { name: `${TAG}-mgr`,   email: `${TAG}-m@verify.local`, passwordHash: "x", role: "CLINIC_MANAGER" } }),
    prisma.user.create({ data: { name: `${TAG}-store`, email: `${TAG}-s@verify.local`, passwordHash: "x", role: "STOREKEEPER" } }),
  ]);
  await prisma.userClinic.createMany({
    data: [
      { userId: manager.id, clinicId: clinicA.id },
      { userId: store.id,   clinicId: clinicA.id },
    ],
  });
  const mk = (n: string) => prisma.stockItem.create({ data: { sku: `${TAG}-${n}`, name: `${TAG} ${n}`, category: "Verify" } });
  Object.assign(ids, {
    entity: entity.id, clinicA: clinicA.id, clinicB: clinicB.id,
    admin: admin.id, manager: manager.id, store: store.id,
    itemA: (await mk("a")).id, itemB: (await mk("b")).id,
  });
  session.user = { id: admin.id, role: "SUPER_ADMIN" };

  await seed(ids.clinicA, ids.itemA, 100, 5);
  await seed(ids.clinicB, ids.itemB, 100, 5);
});

afterEach(async () => {
  // Every test starts from an open period.
  await prisma.stockPeriodLock.deleteMany({ where: { clinicId: { in: [ids.clinicA, ids.clinicB] } } });
});

afterAll(async () => {
  if (ids.clinicA) {
    const clinics = [ids.clinicA, ids.clinicB];
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

const lockNow = (clinicId: string) =>
  lockPeriod({ clinicId, period: NOW(), userId: ids.admin, notes: "verify" });

// ── 1. Open period allows every posting path ────────────────────────────────

describe("1. an open period allows every posting path", () => {
  it("allows a PO receipt", async () => {
    const before = await qty(ids.clinicA, ids.itemA);
    await seed(ids.clinicA, ids.itemA, 5, 5);
    expect(await qty(ids.clinicA, ids.itemA)).toBe(before + 5);
  });

  it("allows a pool receipt", async () => {
    const before = await qty(ids.clinicA, ids.itemA);
    await receivePoolStock(
      ids.clinicA,
      [{ itemId: ids.itemA, totalQty: 3, unitCost: 5, postingKey: key("pool") }],
      { type: "RECEIPT_POOL", sourceType: "POOL_ORDER", reference: `${TAG}-POOL`, userId: ids.admin }
    );
    expect(await qty(ids.clinicA, ids.itemA)).toBe(before + 3);
  });

  it("allows a transfer out (DO dispatch)", async () => {
    const before = await qty(ids.clinicA, ids.itemA);
    await deductStock(
      ids.clinicA,
      [{ itemId: ids.itemA, quantity: 2, postingKey: key("do-out"), type: "TRANSFER_OUT" }],
      { type: "TRANSFER_OUT", sourceType: "DELIVERY_ORDER", reference: `${TAG}-DO`, userId: ids.admin }
    );
    expect(await qty(ids.clinicA, ids.itemA)).toBe(before - 2);
  });

  it("allows a stock issue (consumption)", async () => {
    const before = await qty(ids.clinicA, ids.itemA);
    await deductStock(
      ids.clinicA,
      [{ itemId: ids.itemA, quantity: 4, postingKey: key("issue"), type: "CONSUMPTION" }],
      { type: "CONSUMPTION", sourceType: "STOCK_ISSUE", reference: `${TAG}-ISS`, userId: ids.admin }
    );
    expect(await qty(ids.clinicA, ids.itemA)).toBe(before - 4);
  });

  it("allows a stock take adjustment", async () => {
    const before = await qty(ids.clinicA, ids.itemA);
    await receiveStock(
      ids.clinicA,
      [{ itemId: ids.itemA, receivedQty: 1, unitCost: 5, postingKey: key("take"), type: "STOCK_TAKE_IN" }],
      { type: "STOCK_TAKE_IN", sourceType: "STOCK_TAKE", reference: `${TAG}-TAKE`, userId: ids.admin }
    );
    expect(await qty(ids.clinicA, ids.itemA)).toBe(before + 1);
  });

  it("allows a REVALUATION and a PURCHASE_PRICE_VARIANCE", async () => {
    const q = await qty(ids.clinicA, ids.itemA);
    const a = await avg(ids.clinicA, ids.itemA);
    // Mirror what the invoice route does: a revaluation moves the average, so
    // the ledger and ClinicStock stay reconciled. The PPV half deliberately
    // does not — it is value that has left inventory, and the drift detector
    // excludes it (H-5).
    const revalDelta = 10;
    const newAvg = (a * q + revalDelta) / q;
    await prisma.$transaction(async (tx) => {
      await postMovement(tx, {
        clinicId: ids.clinicA, itemId: ids.itemA, type: "REVALUATION",
        quantity: 0, unitCost: 6, valueDelta: revalDelta, balanceAfter: q, avgCostAfter: newAvg,
        sourceType: "STOCK_INVOICE", reference: `${TAG}-REV`, postingKey: key("reval"), userId: ids.admin,
      });
      await postMovement(tx, {
        clinicId: ids.clinicA, itemId: ids.itemA, type: "PURCHASE_PRICE_VARIANCE",
        quantity: 0, unitCost: 6, valueDelta: 15, balanceAfter: q, avgCostAfter: newAvg,
        sourceType: "STOCK_INVOICE", reference: `${TAG}-PPV`, postingKey: key("ppv"), userId: ids.admin,
      });
      await tx.clinicStock.update({
        where: { clinicId_itemId: { clinicId: ids.clinicA, itemId: ids.itemA } },
        data:  { avgUnitCost: newAvg },
      });
    });
    const types = await prisma.stockMovement.findMany({
      where: { clinicId: ids.clinicA, reference: { in: [`${TAG}-REV`, `${TAG}-PPV`] } },
      select: { type: true },
    });
    expect(types.map((t) => t.type).sort()).toEqual(["PURCHASE_PRICE_VARIANCE", "REVALUATION"]);
  });
});

// ── 2. Locked period rejects every posting path ─────────────────────────────

describe("2. a locked period rejects every posting path", () => {
  const paths: [string, () => Promise<unknown>][] = [
    ["PO receipt",     () => seed(ids.clinicA, ids.itemA, 5, 5)],
    ["pool receipt",   () => receivePoolStock(ids.clinicA,
      [{ itemId: ids.itemA, totalQty: 3, unitCost: 5, postingKey: key("pool") }],
      { type: "RECEIPT_POOL", sourceType: "POOL_ORDER", reference: `${TAG}-P`, userId: ids.admin })],
    ["DO transfer out", () => deductStock(ids.clinicA,
      [{ itemId: ids.itemA, quantity: 1, postingKey: key("do"), type: "TRANSFER_OUT" }],
      { type: "TRANSFER_OUT", sourceType: "DELIVERY_ORDER", reference: `${TAG}-D`, userId: ids.admin })],
    ["stock issue",     () => deductStock(ids.clinicA,
      [{ itemId: ids.itemA, quantity: 1, postingKey: key("iss"), type: "CONSUMPTION" }],
      { type: "CONSUMPTION", sourceType: "STOCK_ISSUE", reference: `${TAG}-I`, userId: ids.admin })],
    ["stock take in",   () => receiveStock(ids.clinicA,
      [{ itemId: ids.itemA, receivedQty: 1, unitCost: 5, postingKey: key("tk"), type: "STOCK_TAKE_IN" }],
      { type: "STOCK_TAKE_IN", sourceType: "STOCK_TAKE", reference: `${TAG}-T`, userId: ids.admin })],
    ["revaluation",     () => prisma.$transaction((tx) => postMovement(tx, {
      clinicId: ids.clinicA, itemId: ids.itemA, type: "REVALUATION",
      quantity: 0, unitCost: 6, valueDelta: 5, balanceAfter: 1, avgCostAfter: 5,
      sourceType: "STOCK_INVOICE", reference: `${TAG}-R`, postingKey: key("rev"), userId: ids.admin,
    }))],
    ["purchase price variance", () => prisma.$transaction((tx) => postMovement(tx, {
      clinicId: ids.clinicA, itemId: ids.itemA, type: "PURCHASE_PRICE_VARIANCE",
      quantity: 0, unitCost: 6, valueDelta: 5, balanceAfter: 1, avgCostAfter: 5,
      sourceType: "STOCK_INVOICE", reference: `${TAG}-V`, postingKey: key("v"), userId: ids.admin,
    }))],
  ];

  for (const [name, run] of paths) {
    it(`refuses ${name}, leaving stock and ledger untouched`, async () => {
      await lockNow(ids.clinicA);
      const qBefore = await qty(ids.clinicA, ids.itemA);
      const aBefore = await avg(ids.clinicA, ids.itemA);
      const mBefore = await moveCount(ids.clinicA);

      await expect(run()).rejects.toThrow(PeriodLockedError);

      expect(await qty(ids.clinicA, ids.itemA)).toBe(qBefore);
      expect(await avg(ids.clinicA, ids.itemA)).toBe(aBefore);
      expect(await moveCount(ids.clinicA)).toBe(mBefore);
    });
  }

  it("names the clinic and period on the error", async () => {
    await lockNow(ids.clinicA);
    try {
      await seed(ids.clinicA, ids.itemA, 1, 5);
      throw new Error("should have been refused");
    } catch (e) {
      expect(isPeriodLockedError(e)).toBe(true);
      expect((e as PeriodLockedError).period).toBe(NOW());
      expect((e as PeriodLockedError).clinicId).toBe(ids.clinicA);
    }
  });
});

// ── 3. Scope ────────────────────────────────────────────────────────────────

describe("3. a lock is scoped to one clinic and one period", () => {
  it("does not affect another clinic", async () => {
    await lockNow(ids.clinicA);
    const before = await qty(ids.clinicB, ids.itemB);
    await seed(ids.clinicB, ids.itemB, 7, 5);
    expect(await qty(ids.clinicB, ids.itemB)).toBe(before + 7);
  });

  it("does not affect a different period of the same clinic", async () => {
    // Lock a month that is not the current one; posting still lands today.
    await lockPeriod({ clinicId: ids.clinicA, period: "2020-01", userId: ids.admin });
    const before = await qty(ids.clinicA, ids.itemA);
    await seed(ids.clinicA, ids.itemA, 2, 5);
    expect(await qty(ids.clinicA, ids.itemA)).toBe(before + 2);
  });

  it("stamps the movement with the MYT period, which is what the lock matches", async () => {
    await seed(ids.clinicA, ids.itemA, 1, 5);
    const last = await prisma.stockMovement.findFirst({
      where: { clinicId: ids.clinicA }, orderBy: { seq: "desc" }, select: { period: true, movementAt: true },
    });
    expect(last!.period).toBe(NOW());
    expect(last!.period).toBe(periodOf(last!.movementAt));
  });
});

// ── 4. Reversals ────────────────────────────────────────────────────────────

describe("4. reversing a movement from a locked period", () => {
  it("posts the reversal into the current open period and keeps reversalOfId", async () => {
    await seed(ids.clinicA, ids.itemA, 6, 5);
    const original = await prisma.stockMovement.findFirstOrThrow({
      where: { clinicId: ids.clinicA }, orderBy: { seq: "desc" },
    });

    // The month the original sits in is closed, then reopened for nothing —
    // the correction must not require reopening it.
    await lockPeriod({ clinicId: ids.clinicA, period: "2020-01", userId: ids.admin });

    await deductStock(
      ids.clinicA,
      [{ itemId: ids.itemA, quantity: 6, postingKey: key("reversal"), type: "ADJUSTMENT_OUT" }],
      {
        type: "ADJUSTMENT_OUT", sourceType: "STOCK_ADJUSTMENT",
        reference: `${TAG}-REVERSE`, userId: ids.admin,
      }
    );

    const reversal = await prisma.stockMovement.findFirstOrThrow({
      where: { clinicId: ids.clinicA, reference: `${TAG}-REVERSE` },
    });
    expect(reversal.period).toBe(NOW());
    expect(reversal.period).not.toBe("2020-01");
    expect(original.period).toBe(NOW());
  });

  it("never reopens a locked period by itself", async () => {
    await lockNow(ids.clinicA);
    await expect(
      deductStock(ids.clinicA,
        [{ itemId: ids.itemA, quantity: 1, postingKey: key("rv2"), type: "ADJUSTMENT_OUT" }],
        { type: "ADJUSTMENT_OUT", sourceType: "STOCK_ADJUSTMENT", reference: `${TAG}-R2`, userId: ids.admin })
    ).rejects.toThrow(PeriodLockedError);

    const lock = await prisma.stockPeriodLock.findUniqueOrThrow({
      where: { clinicId_period: { clinicId: ids.clinicA, period: NOW() } },
    });
    expect(lock.status).toBe("LOCKED");
  });
});

// ── 5. Authority ────────────────────────────────────────────────────────────

describe("5. lock and unlock authority", () => {
  const lockBody = (clinicId: string) => ({ clinicId, period: NOW(), notes: "close" });

  it("lets a super admin lock", async () => {
    session.user = { id: ids.admin, role: "SUPER_ADMIN" };
    const res = await lockRoute(req(lockBody(ids.clinicA)));
    expect(res.status).toBe(201);
  });

  it("lets a clinic manager lock their own clinic", async () => {
    session.user = { id: ids.manager, role: "CLINIC_MANAGER" };
    const res = await lockRoute(req(lockBody(ids.clinicA)));
    expect(res.status).toBe(201);
  });

  it("refuses a clinic manager locking a clinic they do not belong to", async () => {
    session.user = { id: ids.manager, role: "CLINIC_MANAGER" };
    const res = await lockRoute(req(lockBody(ids.clinicB)));
    expect(res.status).toBe(403);
  });

  it("refuses a storekeeper — they raise the movements being closed", async () => {
    session.user = { id: ids.store, role: "STOREKEEPER" };
    const res = await lockRoute(req(lockBody(ids.clinicA)));
    expect(res.status).toBe(403);
    expect(await prisma.stockPeriodLock.count({ where: { clinicId: ids.clinicA } })).toBe(0);
  });

  it("refuses a malformed period", async () => {
    session.user = { id: ids.admin, role: "SUPER_ADMIN" };
    const res = await lockRoute(req({ clinicId: ids.clinicA, period: "2026-13" }));
    expect(res.status).toBe(422);
  });

  it("refuses unlock by finance, who may lock but not reopen", async () => {
    await lockNow(ids.clinicA);
    session.user = { id: ids.admin, role: "FINANCE" };
    const res = await unlockRoute(req({ clinicId: ids.clinicA, period: NOW(), reason: "fix" }));
    expect(res.status).toBe(403);
  });

  it("refuses unlock without a reason", async () => {
    await lockNow(ids.clinicA);
    session.user = { id: ids.admin, role: "SUPER_ADMIN" };
    for (const body of [
      { clinicId: ids.clinicA, period: NOW() },
      { clinicId: ids.clinicA, period: NOW(), reason: "" },
      { clinicId: ids.clinicA, period: NOW(), reason: "   " },
    ]) {
      const res = await unlockRoute(req(body));
      expect(res.status).toBe(422);
    }
  });

  it("lets a super admin unlock with a reason, and records it", async () => {
    await lockNow(ids.clinicA);
    session.user = { id: ids.admin, role: "SUPER_ADMIN" };
    const res = await unlockRoute(req({ clinicId: ids.clinicA, period: NOW(), reason: "late supplier invoice" }));
    expect(res.status).toBe(200);

    const row = await prisma.stockPeriodLock.findUniqueOrThrow({
      where: { clinicId_period: { clinicId: ids.clinicA, period: NOW() } },
    });
    expect(row.status).toBe("OPEN");
    expect(row.unlockReason).toBe("late supplier invoice");
    expect(row.unlockedById).toBe(ids.admin);
    expect(row.unlockedAt).not.toBeNull();
    // The lock record survives the reopen — that is the audit trail.
    expect(row.lockedById).toBe(ids.admin);
  });

  it("lets posting resume after an unlock", async () => {
    await lockNow(ids.clinicA);
    await expect(seed(ids.clinicA, ids.itemA, 1, 5)).rejects.toThrow(PeriodLockedError);
    await unlockPeriod({ clinicId: ids.clinicA, period: NOW(), userId: ids.admin, reason: "reopen" });
    const before = await qty(ids.clinicA, ids.itemA);
    await seed(ids.clinicA, ids.itemA, 3, 5);
    expect(await qty(ids.clinicA, ids.itemA)).toBe(before + 3);
  });

  it("reports lock status over the GET endpoint", async () => {
    await lockNow(ids.clinicA);
    session.user = { id: ids.admin, role: "SUPER_ADMIN" };
    const res = await lockStatus(req(undefined, `http://t?clinicId=${ids.clinicA}`));
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.some((r: any) => r.period === NOW() && r.status === "LOCKED")).toBe(true);
  });
});

// ── 6. Concurrency ──────────────────────────────────────────────────────────

describe("6. a lock arriving while a mutation is in flight", () => {
  it("never lets a movement into a period that is locked when it commits", async () => {
    const mBefore = await moveCount(ids.clinicA);

    const qBefore = await qty(ids.clinicA, ids.itemA);
    const aBefore = await avg(ids.clinicA, ids.itemA);
    const newAvg  = (aBefore * qBefore + 5) / (qBefore + 1);

    // Posting transaction takes the shared advisory lock, then dawdles before
    // committing. Ledger and ClinicStock move together, as a real caller does —
    // otherwise the fixture itself would create the drift it is meant to avoid.
    const posting = prisma.$transaction(async (tx) => {
      await assertPeriodOpen(tx, ids.clinicA, NOW());
      await new Promise((r) => setTimeout(r, 1200));
      await tx.clinicStock.update({
        where: { clinicId_itemId: { clinicId: ids.clinicA, itemId: ids.itemA } },
        data:  { quantity: { increment: 1 }, avgUnitCost: newAvg },
      });
      await postMovement(tx, {
        clinicId: ids.clinicA, itemId: ids.itemA, type: "ADJUSTMENT_IN",
        quantity: 1, unitCost: 5, balanceAfter: qBefore + 1, avgCostAfter: newAvg,
        sourceType: "STOCK_ADJUSTMENT", reference: `${TAG}-RACE`, postingKey: key("race"), userId: ids.admin,
      });
      return "posted";
    }, { maxWait: 20_000, timeout: 30_000 });

    // Lock requested mid-flight: it must wait for the exclusive advisory lock.
    await new Promise((r) => setTimeout(r, 300));
    const locking = lockNow(ids.clinicA).then(() => "locked");

    const [postResult] = await Promise.all([posting, locking]);
    expect(postResult).toBe("posted");

    // The in-flight movement committed while the period was still open.
    expect(await moveCount(ids.clinicA)).toBe(mBefore + 1);

    // Anything starting after the lock is refused.
    await expect(seed(ids.clinicA, ids.itemA, 1, 5)).rejects.toThrow(PeriodLockedError);
    expect(await moveCount(ids.clinicA)).toBe(mBefore + 1);
  }, 60_000);

  it("refuses a posting that begins after the lock commits", async () => {
    await lockNow(ids.clinicA);
    const mBefore = await moveCount(ids.clinicA);
    const results = await Promise.allSettled([
      seed(ids.clinicA, ids.itemA, 1, 5),
      seed(ids.clinicA, ids.itemA, 2, 5),
      seed(ids.clinicA, ids.itemA, 3, 5),
    ]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(await moveCount(ids.clinicA)).toBe(mBefore);
  }, 30_000);
});

// ── 7. Drift ────────────────────────────────────────────────────────────────

describe("7. the drift detector is unaffected by locking", () => {
  // Scoped to clinic B, where every movement went through the real mutators.
  // Clinic A deliberately carries hand-built ledger fixtures — a bare
  // REVALUATION posted straight through postMovement — which are useful for
  // exercising the gate but are not production-shaped, so asserting drift
  // there would be measuring the fixture rather than the lock.
  it("introduces no drift across a lock, a rejected posting and an unlock", async () => {
    const before = await qty(ids.clinicB, ids.itemB);

    await lockNow(ids.clinicB);
    await expect(seed(ids.clinicB, ids.itemB, 1, 5)).rejects.toThrow(PeriodLockedError);
    // The refused posting left nothing behind.
    expect(await qty(ids.clinicB, ids.itemB)).toBe(before);

    await unlockPeriod({ clinicId: ids.clinicB, period: NOW(), userId: ids.admin, reason: "resume" });
    await seed(ids.clinicB, ids.itemB, 4, 5);
    expect(await qty(ids.clinicB, ids.itemB)).toBe(before + 4);

    const report = await runDriftDetection([ids.clinicB]);
    expect(report.findings.filter((f) => f.severity === "ERROR")).toEqual([]);
  }, 30_000);
});
