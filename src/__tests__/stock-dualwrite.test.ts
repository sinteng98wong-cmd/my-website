/**
 * Dual-write regression tests.
 *
 * Every existing stock mutation must append a ledger movement carrying a
 * meaningful type and source reference — not a blind copy of ClinicStock.
 * These call the real handlers with a mocked Prisma client and assert what
 * was written to StockMovement.
 */
const A = "clinic-a";

const mockSession = jest.fn();
jest.mock("next-auth", () => ({ getServerSession: () => mockSession() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/ref-generator", () => ({
  generatePurchaseOrderRef: async () => "PO-TEST-001",
  generatePoRef: async () => "POOL-TEST-001",
  generateDoRef: async () => "DO-TEST-001",
}));

const movements: any[] = [];
const stockRow = { quantity: 20, avgUnitCost: 5 };
let batchSeq = 0;

const prismaMock: any = {
  // Period-lock gate: postMovement checks this on the caller's client.
  // Unlocked by default here; the locked path is covered in stock-period tests.
  $executeRawUnsafe: jest.fn(async () => 1),
  stockPeriodLock: { findUnique: jest.fn(async () => null) },
  userClinic: { findMany: jest.fn(), findFirst: jest.fn() },
  clinicStock: { update: jest.fn(async () => ({})), findUnique: jest.fn(async () => stockRow) },
  stockBatch: {
    create:     jest.fn(async ({ data }: any) => ({ id: `batch-${++batchSeq}`, ...data })),
    findMany:   jest.fn(async () => [] as any[]),
    updateMany: jest.fn(async () => ({ count: 1 })),
  },
  dOLineBatch: { create: jest.fn(async ({ data }: any) => ({ id: `dlb-${data.doLineId}`, ...data })) },
  stockItem:   { findUnique: jest.fn(async () => ({ name: "Gloves" })) },
  stockMovement: {
    create: jest.fn(async ({ data }: any) => {
      if (movements.some((m) => m.postingKey === data.postingKey)) {
        const e: any = new Error("Unique constraint failed");
        e.code = "P2002";
        e.meta = { target: ["postingKey"] };
        throw e;
      }
      movements.push(data);
      return { id: `mv-${movements.length}`, ...data };
    }),
  },
  purchaseOrder: { findUnique: jest.fn(), update: jest.fn(async () => ({ id: "po-1", status: "RECEIVED" })) },
  pOLine:        { update: jest.fn(async () => ({})) },
  poolOrder:     { findUnique: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })), update: jest.fn(async () => ({})) },
  poolParticipant: { updateMany: jest.fn(async () => ({ count: 1 })), findUnique: jest.fn(async () => ({})), findMany: jest.fn(async () => []) },
  deliveryOrder: { findUnique: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })) },
  $queryRaw: jest.fn(async () => [{ quantity: stockRow.quantity, avgUnitCost: String(stockRow.avgUnitCost) }]),
  $transaction: jest.fn(async (fn: any) => (typeof fn === "function" ? fn(prismaMock) : [])),
};
jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PATCH as poStatus } from "@/app/api/purchase-orders/[id]/status/route";
import { PATCH as doStatus } from "@/app/api/delivery-orders/[id]/status/route";
import { PATCH as poolStatus } from "@/app/api/pool-orders/[id]/status/route";
import { POST as poolDirectReceive } from "@/app/api/pool-orders/[id]/direct-receive/route";

const req = (body?: unknown) => ({ nextUrl: new URL("http://x"), url: "http://x", json: async () => body }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  movements.length = 0;
  mockSession.mockResolvedValue({ user: { id: "user-1", role: "SUPER_ADMIN" } });
  prismaMock.userClinic.findMany.mockResolvedValue([{ clinicId: A }]);
  prismaMock.userClinic.findFirst.mockResolvedValue({ userId: "user-1", clinicId: A });
  prismaMock.$queryRaw.mockResolvedValue([{ quantity: stockRow.quantity, avgUnitCost: String(stockRow.avgUnitCost) }]);
  prismaMock.$transaction.mockImplementation(async (fn: any) => (typeof fn === "function" ? fn(prismaMock) : []));
});

const poLine = (over: any = {}) => ({
  id: "pol-1", itemId: "item-1", quantity: 10, receivedQty: null, postedQty: 0,
  unitCost: 5, batchNumber: null, expiryDate: null, ...over,
});

describe("PO receipt dual-writes", () => {
  it("posts a RECEIPT_PO movement referencing the purchase order", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      id: "po-1", clinicId: A, status: "CONFIRMED", poRef: "PO-2026-001", lines: [poLine()],
    });
    const res = await poStatus(req({ status: "RECEIVED" }), { params: { id: "po-1" } });
    expect(res.status).toBe(200);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: "RECEIPT_PO", direction: "IN", qtyIn: 10, qtyOut: 0,
      sourceType: "PURCHASE_ORDER", sourceId: "po-1", reference: "PO-2026-001",
      sourceLineId: "pol-1", createdById: "user-1",
    });
    expect(movements[0].postingKey).toBe("PO:pol-1:RECEIPT:0");
  });

  it("splits free goods into their own zero-cost movement", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      id: "po-1", clinicId: A, status: "CONFIRMED", poRef: "PO-2026-001",
      lines: [poLine({ receivedQty: 12 })],
    });
    await poStatus(req({ status: "RECEIVED" }), { params: { id: "po-1" } });
    expect(movements.map((m) => m.type)).toEqual(["RECEIPT_PO", "RECEIPT_FOC"]);
    expect(movements[0].qtyIn).toBe(10);
    expect(movements[1].qtyIn).toBe(2);
    expect(Number(movements[1].unitCost)).toBe(0);
    expect(Number(movements[1].valueDelta)).toBe(0);
  });

  it("posts only the remainder when completing a partial receipt", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      id: "po-1", clinicId: A, status: "PARTIAL", poRef: "PO-2026-001",
      lines: [poLine({ receivedQty: 10, postedQty: 4 })],
    });
    await poStatus(req({ status: "RECEIVED" }), { params: { id: "po-1" } });
    expect(movements).toHaveLength(1);
    expect(movements[0].qtyIn).toBe(6);
    expect(movements[0].postingKey).toBe("PO:pol-1:RECEIPT:4");
  });

  it("writes nothing to the ledger when the receipt is a no-op", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      id: "po-1", clinicId: A, status: "PARTIAL", poRef: "PO-2026-001",
      lines: [poLine({ receivedQty: 10, postedQty: 10 })],
    });
    await poStatus(req({ status: "RECEIVED" }), { params: { id: "po-1" } });
    expect(movements).toHaveLength(0);
  });
});

describe("delivery order dual-writes", () => {
  const doLine = (over: any = {}) => ({
    id: "dol-1", itemId: "item-1", quantity: 10, receivedQty: null, unitCost: 5,
    batchNumber: null, expiryDate: null, batchAllocations: [], ...over,
  });
  const doOrder = (over: any = {}) => ({
    id: "do-1", doRef: "DO-2026-001", fromClinicId: A, toClinicId: "clinic-b", status: "APPROVED",
    fromClinic: { entity: { id: "e1" } },
    lines: [doLine()],
    ...over,
  });

  it("posts TRANSFER_OUT at the dispatching branch", async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue(doOrder());
    const res = await doStatus(req({ status: "IN_TRANSIT" }), { params: { id: "do-1" } });
    expect(res.status).toBe(200);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: "TRANSFER_OUT", direction: "OUT", qtyOut: 10, clinicId: A,
      sourceType: "DELIVERY_ORDER", sourceId: "do-1", reference: "DO-2026-001",
      postingKey: "DO:dol-1:TRANSFER_OUT",
    });
  });

  it("values the transfer out at the average cost in force", async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue(doOrder());
    await doStatus(req({ status: "IN_TRANSIT" }), { params: { id: "do-1" } });
    expect(Number(movements[0].valueDelta)).toBe(-50); // 10 @ avg 5
  });

  it("posts TRANSFER_IN at the receiving branch", async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue(doOrder({ status: "IN_TRANSIT" }));
    const res = await doStatus(req({ status: "RECEIVED" }), { params: { id: "do-1" } });
    expect(res.status).toBe(200);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: "TRANSFER_IN", direction: "IN", qtyIn: 10, clinicId: "clinic-b",
      postingKey: "DO:dol-1:TRANSFER_IN",
    });
  });

  it("records a short delivery as an explicit variance instead of losing it", async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue(doOrder({
      status: "IN_TRANSIT",
      lines: [doLine({ receivedQty: 8 })],
    }));
    await doStatus(req({ status: "RECEIVED" }), { params: { id: "do-1" } });
    expect(movements.map((m) => m.type)).toEqual(["TRANSFER_IN", "TRANSFER_VARIANCE_OUT"]);
    expect(movements[0].qtyIn).toBe(10);
    expect(movements[1].qtyOut).toBe(2);
    // the shortfall is owned by the receiving branch
    expect(movements[1].clinicId).toBe("clinic-b");
    expect(movements[1].note).toContain("dispatched 10, received 8");
    expect(movements[1].postingKey).toBe("DO:dol-1:VARIANCE");
  });

  it("posts no variance when the delivery arrives complete", async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue(doOrder({
      status: "IN_TRANSIT",
      lines: [doLine({ receivedQty: 10 })],
    }));
    await doStatus(req({ status: "RECEIVED" }), { params: { id: "do-1" } });
    expect(movements.map((m) => m.type)).toEqual(["TRANSFER_IN"]);
  });
});

describe("pool order dual-writes", () => {
  it("posts RECEIPT_POOL with the actual invoiced cost when the pool is centralised", async () => {
    prismaMock.poolOrder.findUnique.mockResolvedValue({
      id: "pool-1", poRef: "POOL-2026-001", status: "SUBMITTED", deliveryMode: "CENTRALISED",
      initiatingClinicId: A,
      lines: [{ id: "pl-1", itemId: "item-1", totalQty: 20, unitCost: 5, actualUnitCost: 4.5 }],
      participants: [],
    });
    const res = await poolStatus(req({ status: "DELIVERED" }), { params: { id: "pool-1" } });
    expect(res.status).toBe(200);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: "RECEIPT_POOL", direction: "IN", qtyIn: 20, clinicId: A,
      sourceType: "POOL_ORDER", sourceId: "pool-1", reference: "POOL-2026-001",
    });
    expect(Number(movements[0].unitCost)).toBe(4.5);
  });

  it("falls back to the ordered cost, never zero", async () => {
    prismaMock.poolOrder.findUnique.mockResolvedValue({
      id: "pool-1", poRef: "POOL-2026-001", status: "SUBMITTED", deliveryMode: "CENTRALISED",
      initiatingClinicId: A,
      lines: [{ id: "pl-1", itemId: "item-1", totalQty: 20, unitCost: 5, actualUnitCost: null }],
      participants: [],
    });
    await poolStatus(req({ status: "DELIVERED" }), { params: { id: "pool-1" } });
    expect(Number(movements[0].unitCost)).toBe(5);
  });

  it("posts RECEIPT_POOL on a direct receipt into the participating branch", async () => {
    prismaMock.poolOrder.findUnique.mockResolvedValue({
      id: "pool-1", poRef: "POOL-2026-001", status: "DELIVERED", deliveryMode: "DIRECT",
      lines: [{ itemId: "item-1", unitCost: 5, actualUnitCost: null }],
      participants: [{ id: "part-1", clinicId: A, receivedAt: null, items: [{ itemId: "item-1", unitCost: 5 }] }],
    });
    const res = await poolDirectReceive(
      req({ clinicId: A, lines: [{ itemId: "item-1", receivedQty: 7 }] }),
      { params: { id: "pool-1" } }
    );
    expect(res.status).toBe(200);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: "RECEIPT_POOL", qtyIn: 7, clinicId: A, postingKey: "POOLD:part-1:item-1:RECEIPT",
    });
    expect(Number(movements[0].unitCost)).toBe(5);
  });
});

describe("idempotency at the ledger", () => {
  it("refuses a replayed posting key", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      id: "po-1", clinicId: A, status: "CONFIRMED", poRef: "PO-2026-001", lines: [poLine()],
    });
    await poStatus(req({ status: "RECEIVED" }), { params: { id: "po-1" } });
    expect(movements).toHaveLength(1);

    // Same PO, same postedQty baseline — the second attempt collides.
    await expect(
      poStatus(req({ status: "RECEIVED" }), { params: { id: "po-1" } })
    ).rejects.toMatchObject({ code: "P2002" });
    expect(movements).toHaveLength(1);
  });

  it("does not collide across the steps of a partial receipt", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      id: "po-1", clinicId: A, status: "CONFIRMED", poRef: "PO-2026-001",
      lines: [poLine({ receivedQty: 4 })],
    });
    await poStatus(req({ status: "PARTIAL" }), { params: { id: "po-1" } });

    prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      id: "po-1", clinicId: A, status: "PARTIAL", poRef: "PO-2026-001",
      lines: [poLine({ receivedQty: 10, postedQty: 4 })],
    });
    await poStatus(req({ status: "RECEIVED" }), { params: { id: "po-1" } });

    expect(movements.map((m) => m.qtyIn)).toEqual([4, 6]);
    expect(new Set(movements.map((m) => m.postingKey)).size).toBe(2);
  });
});
