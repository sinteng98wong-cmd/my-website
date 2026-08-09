/**
 * Route-level access regression tests.
 *
 * These call the real Stock/Inventory handlers with a mocked session and a
 * mocked Prisma client, so they prove the guards are actually wired into the
 * endpoints — not merely that the rules in lib/clinic-access are correct.
 */
const A = "clinic-a";
const B = "clinic-b";

const mockSession = jest.fn();
jest.mock("next-auth", () => ({ getServerSession: () => mockSession() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/ref-generator", () => ({
  generatePurchaseOrderRef: async () => "PO-TEST-001",
  generatePoRef: async () => "POOL-TEST-001",
  generateDoRef: async () => "DO-TEST-001",
}));
jest.mock("@/lib/stock", () => ({
  receiveStock: jest.fn(async () => undefined),
  deductStock: jest.fn(async () => undefined),
  receivePoolStock: jest.fn(async () => undefined),
  generateDOsFromPoolOrder: jest.fn(async () => []),
}));

const prismaMock: any = {
  userClinic: { findMany: jest.fn(), findFirst: jest.fn() },
  clinicStock: { findMany: jest.fn() },
  stockBatch:  { findMany: jest.fn() },
  clinic:      { findMany: jest.fn() },
  purchaseOrder: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  poolOrder:     { findUnique: jest.fn(), create: jest.fn() },
  poolParticipant: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  deliveryOrder: { findMany: jest.fn() },
  $transaction: jest.fn(async (fn: any) => (typeof fn === "function" ? fn(prismaMock) : [])),
};
jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET as getStock } from "@/app/api/inventory/stock/route";
import { GET as getBatches } from "@/app/api/inventory/batches/route";
import { GET as getDOs } from "@/app/api/delivery-orders/route";
import { POST as createPO } from "@/app/api/purchase-orders/route";
import { PATCH as poStatus } from "@/app/api/purchase-orders/[id]/status/route";
import { POST as poolJoin } from "@/app/api/pool-orders/[id]/join/route";
import { POST as poolDirectReceive } from "@/app/api/pool-orders/[id]/direct-receive/route";

/** Minimal stand-in for NextRequest: the handlers use nextUrl and json(). */
const req = (url: string, body?: unknown) =>
  ({ nextUrl: new URL(url), url, json: async () => body }) as any;

const asUser = (role: string, clinicIds: string[]) => {
  mockSession.mockResolvedValue({ user: { id: "user-1", role } });
  prismaMock.userClinic.findMany.mockResolvedValue(clinicIds.map((clinicId) => ({ clinicId })));
};

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.clinicStock.findMany.mockResolvedValue([]);
  prismaMock.stockBatch.findMany.mockResolvedValue([]);
  prismaMock.clinic.findMany.mockResolvedValue([]);
  prismaMock.deliveryOrder.findMany.mockResolvedValue([]);
  prismaMock.purchaseOrder.create.mockResolvedValue({ id: "po-new" });
  prismaMock.$transaction.mockImplementation(async (fn: any) => (typeof fn === "function" ? fn(prismaMock) : []));
});

describe("Branch A cannot read Branch B stock", () => {
  it("refuses a cross-branch clinicId", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await getStock(req(`http://x/api/inventory/stock?clinicId=${B}`));
    expect(res.status).toBe(403);
    expect(prismaMock.clinicStock.findMany).not.toHaveBeenCalled();
  });

  it("allows its own branch and scopes the query to it", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await getStock(req(`http://x/api/inventory/stock?clinicId=${A}`));
    expect(res.status).toBe(200);
    expect(prismaMock.clinicStock.findMany.mock.calls[0][0].where).toEqual({ clinicId: { in: [A] } });
  });

  it("keeps clinical roles out entirely", async () => {
    asUser("RECEPTIONIST", [A]);
    const res = await getStock(req(`http://x/api/inventory/stock?clinicId=${A}`));
    expect(res.status).toBe(403);
  });

  it("lets an authorized group-wide user read any branch", async () => {
    asUser("SUPER_ADMIN", []);
    const res = await getStock(req(`http://x/api/inventory/stock?clinicId=${B}`));
    expect(res.status).toBe(200);
    expect(prismaMock.clinicStock.findMany.mock.calls[0][0].where).toEqual({ clinicId: { in: [B] } });
  });
});

describe("Branch A cannot read Branch B batches", () => {
  it("refuses a cross-branch clinicId", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await getBatches(req(`http://x/api/inventory/batches?clinicId=${B}`));
    expect(res.status).toBe(403);
    expect(prismaMock.stockBatch.findMany).not.toHaveBeenCalled();
  });

  it("allows its own branch", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await getBatches(req(`http://x/api/inventory/batches?clinicId=${A}`));
    expect(res.status).toBe(200);
    expect(prismaMock.stockBatch.findMany.mock.calls[0][0].where).toMatchObject({ clinicId: { in: [A] } });
  });

  it("refuses a doctor outright", async () => {
    asUser("DOCTOR", [A]);
    const res = await getBatches(req(`http://x/api/inventory/batches?clinicId=${A}`));
    expect(res.status).toBe(403);
  });
});

describe("Branch A cannot create or receive a PO for Branch B", () => {
  const poBody = (clinicId: string) => ({
    clinicId, supplierId: "sup-1", lines: [{ itemId: "item-1", quantity: 5, unitCost: 2 }],
  });

  it("refuses creating a PO for another branch", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await createPO(req("http://x/api/purchase-orders", poBody(B)));
    expect(res.status).toBe(403);
    expect(prismaMock.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it("allows creating a PO for its own branch", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await createPO(req("http://x/api/purchase-orders", poBody(A)));
    expect(res.status).toBe(201);
    expect(prismaMock.purchaseOrder.create).toHaveBeenCalled();
  });

  it("refuses receiving another branch's PO", async () => {
    asUser("STOREKEEPER", [A]);
    prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      id: "po-1", clinicId: B, status: "CONFIRMED",
      lines: [{ id: "l1", itemId: "i1", quantity: 5, receivedQty: null, postedQty: 0, unitCost: 2 }],
    });
    const res = await poStatus(req("http://x", { status: "RECEIVED" }), { params: { id: "po-1" } });
    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("lets a group-wide user receive any branch's PO", async () => {
    asUser("FINANCE", []);
    prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      id: "po-1", clinicId: B, status: "CONFIRMED",
      lines: [{ id: "l1", itemId: "i1", quantity: 5, receivedQty: null, postedQty: 0, unitCost: 2 }],
    });
    prismaMock.pOLine = { update: jest.fn().mockResolvedValue({}) };
    prismaMock.purchaseOrder.update = jest.fn().mockResolvedValue({ id: "po-1", status: "RECEIVED" });
    const res = await poStatus(req("http://x", { status: "RECEIVED" }), { params: { id: "po-1" } });
    expect(res.status).toBe(200);
  });
});

describe("Branch A cannot join Branch B to a pool", () => {
  beforeEach(() => {
    prismaMock.poolOrder.findUnique.mockResolvedValue({ id: "pool-1", status: "OPEN" });
    prismaMock.poolParticipant.findUnique.mockResolvedValue(null);
    prismaMock.poolParticipant.findMany.mockResolvedValue([]);
    prismaMock.poolParticipant.create.mockResolvedValue({ id: "p1", items: [] });
    prismaMock.poolOrderLine = { updateMany: jest.fn().mockResolvedValue({ count: 0 }) };
  });

  const joinBody = (clinicId: string) => ({
    clinicId, items: [{ itemId: "item-1", requestedQty: 2, unitCost: 3 }],
  });

  it("refuses committing another branch to a pool", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await poolJoin(req("http://x", joinBody(B)), { params: { id: "pool-1" } });
    expect(res.status).toBe(403);
    expect(prismaMock.poolParticipant.create).not.toHaveBeenCalled();
  });

  it("allows joining its own branch", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await poolJoin(req("http://x", joinBody(A)), { params: { id: "pool-1" } });
    expect(res.status).toBe(201);
    expect(prismaMock.poolParticipant.create).toHaveBeenCalled();
  });
});

describe("Branch A cannot direct-receive into Branch B", () => {
  beforeEach(() => {
    prismaMock.poolOrder.findUnique.mockResolvedValue({
      id: "pool-1", status: "DELIVERED", deliveryMode: "DIRECT",
      participants: [{ id: "p-b", clinicId: B, receivedAt: null, items: [{ itemId: "item-1" }] }],
    });
  });

  it("refuses receiving into another branch", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await poolDirectReceive(
      req("http://x", { clinicId: B, lines: [{ itemId: "item-1", receivedQty: 3 }] }),
      { params: { id: "pool-1" } }
    );
    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses even when the caller has no clinic links at all", async () => {
    asUser("STOREKEEPER", []);
    const res = await poolDirectReceive(
      req("http://x", { clinicId: B, lines: [{ itemId: "item-1", receivedQty: 3 }] }),
      { params: { id: "pool-1" } }
    );
    expect(res.status).toBe(403);
  });
});

describe("clinicId query parameters cannot bypass authorization", () => {
  it("delivery orders: a foreign clinicId is refused, not honoured", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await getDOs(req(`http://x/api/delivery-orders?clinicId=${B}`));
    expect(res.status).toBe(403);
    expect(prismaMock.deliveryOrder.findMany).not.toHaveBeenCalled();
  });

  it("delivery orders: no clinicId still scopes to the user's clinics", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await getDOs(req("http://x/api/delivery-orders"));
    expect(res.status).toBe(200);
    const where = prismaMock.deliveryOrder.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { fromClinicId: { in: [A] } },
      { toClinicId:   { in: [A] } },
    ]);
  });

  it("delivery orders: an authorized multi-clinic manager keeps both branches", async () => {
    asUser("CLINIC_MANAGER", [A, B]);
    const res = await getDOs(req("http://x/api/delivery-orders"));
    expect(res.status).toBe(200);
    const where = prismaMock.deliveryOrder.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { fromClinicId: { in: [A, B] } },
      { toClinicId:   { in: [A, B] } },
    ]);
  });

  it("delivery orders: a group-wide role is unfiltered", async () => {
    asUser("SUPER_ADMIN", []);
    const res = await getDOs(req("http://x/api/delivery-orders"));
    expect(res.status).toBe(200);
    expect(prismaMock.deliveryOrder.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });
});
