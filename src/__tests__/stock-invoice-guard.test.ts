/**
 * C-1 — a purchase order carries exactly one supplier invoice.
 *
 * A second invoice would reprice the same receipt again and silently inflate
 * stock value. Real route handler, mocked session and Prisma; the concurrency
 * half of the guard is proven against a real database in
 * src/__integration__/stock-batch-integrity.verify.test.ts.
 */
const A = "clinic-a";

const mockSession = jest.fn();
jest.mock("next-auth", () => ({ getServerSession: () => mockSession() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));

const movements: any[] = [];
const stockWrites: any[] = [];

const prismaMock: any = {
  userClinic:    { findMany: jest.fn(async () => [{ clinicId: A }]) },
  stockInvoice:  { findUnique: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => ({ id: "inv-1", ...data })) },
  purchaseOrder: { findUnique: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })) },
  pOLine:        { update: jest.fn(async () => ({})) },
  clinic:        { findUnique: jest.fn(async () => ({ id: A, entity: { id: "e1" } })) },
  clinicStock: {
    findUnique: jest.fn(async () => ({ quantity: 10, avgUnitCost: 5 })),
    update:     jest.fn(async (args: any) => { stockWrites.push(args); return {}; }),
  },
  stockMovement: {
    create: jest.fn(async ({ data }: any) => { movements.push(data); return { id: `mv-${movements.length}`, ...data }; }),
    // Paid receipt pool for the H-5 correction split. Everything received is
    // still on hand in this fixture, so the whole correction stays in inventory
    // and the C-1 assertions below are unaffected.
    aggregate: jest.fn(async () => ({ _sum: { qtyIn: 10 } })),
  },
  deliveryOrder: { findMany: jest.fn(async () => []) },
  $transaction:  jest.fn(async (fn: any) => (typeof fn === "function" ? fn(prismaMock) : [])),
};
jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST as createInvoice } from "@/app/api/stock-invoices/route";

const req = (body: unknown) => ({ nextUrl: new URL("http://x"), url: "http://x", json: async () => body }) as any;

const po = (over: any = {}) => ({
  id: "po-1", poRef: "PO-2026-001", clinicId: A, status: "RECEIVED",
  stockInvoice: null,
  lines: [{ id: "pol-1", itemId: "item-1", quantity: 10, receivedQty: 10, unitCost: 5, item: { id: "item-1", name: "Gloves" } }],
  clinic: { id: A },
  ...over,
});

const invoiceBody = (ref = "SINV-001", cost = 6) => ({
  source: "SUPPLIER", invoiceRef: ref, month: "2026-08",
  purchaseOrderId: "po-1", supplierId: "sup-1",
  lineUpdates: [{ lineId: "pol-1", invoicedUnitCost: cost }],
});

beforeEach(() => {
  jest.clearAllMocks();
  movements.length = 0;
  stockWrites.length = 0;
  mockSession.mockResolvedValue({ user: { id: "user-1", role: "FINANCE" } });
  prismaMock.stockInvoice.findUnique.mockResolvedValue(null);
  prismaMock.stockInvoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv-1", ...data }));
  prismaMock.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.clinicStock.findUnique.mockResolvedValue({ quantity: 10, avgUnitCost: 5 });
  prismaMock.stockMovement.aggregate.mockResolvedValue({ _sum: { qtyIn: 10 } });
  prismaMock.$transaction.mockImplementation(async (fn: any) => (typeof fn === "function" ? fn(prismaMock) : []));
});

describe("1. the first supplier invoice on a purchase order", () => {
  it("is accepted and revalues the receipt once", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(po());
    const res = await createInvoice(req(invoiceBody()));
    expect(res.status).toBe(201);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "REVALUATION", direction: "NONE" });
    expect(movements[0].postingKey).toBe("REVAL:PO:SINV-001:pol-1");
    // 10 units repriced from 5 to 6 → +10 on a balance of 10 at avg 5 → 6
    expect(Number(movements[0].valueDelta)).toBe(10);
    expect(stockWrites[0].data.avgUnitCost).toBe(6);
  });

  it("claims the purchase order before posting anything", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(po());
    await createInvoice(req(invoiceBody()));
    expect(prismaMock.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "po-1", status: { in: ["RECEIVED", "PARTIAL"] } },
      data:  { status: "INVOICED" },
    });
  });
});

describe("2/3. a second supplier invoice on the same purchase order", () => {
  it("2. is rejected", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(po({ stockInvoice: { invoiceRef: "SINV-001" } }));
    const res = await createInvoice(req(invoiceBody("SINV-002")));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("SINV-001");
  });

  it("3. creates no stock movement and changes no stock", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(po({ stockInvoice: { invoiceRef: "SINV-001" } }));
    await createInvoice(req(invoiceBody("SINV-002")));
    expect(movements).toHaveLength(0);
    expect(stockWrites).toHaveLength(0);
    expect(prismaMock.pOLine.update).not.toHaveBeenCalled();
    expect(prismaMock.stockInvoice.create).not.toHaveBeenCalled();
  });

  it("3. rejects before claiming, so the purchase order is left alone", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(po({ stockInvoice: { invoiceRef: "SINV-001" } }));
    await createInvoice(req(invoiceBody("SINV-002")));
    expect(prismaMock.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });
});

describe("4/24. two invoices arriving together", () => {
  it("refuses the one that loses the claim, with nothing posted", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(po());
    // Both read a RECEIVED purchase order; the claim is what separates them.
    prismaMock.purchaseOrder.updateMany.mockResolvedValue({ count: 0 });
    const res = await createInvoice(req(invoiceBody("SINV-002")));
    expect(res.status).toBe(409);
    expect(movements).toHaveLength(0);
    expect(stockWrites).toHaveLength(0);
    expect(prismaMock.stockInvoice.create).not.toHaveBeenCalled();
  });

  it("refuses a race that slips past the claim, on the unique constraint", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(po());
    prismaMock.stockInvoice.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: ["purchaseOrderId"] } })
    );
    const res = await createInvoice(req(invoiceBody("SINV-002")));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("already been invoiced");
  });
});

describe("the guard does not disturb the rest of the path", () => {
  it("still refuses a purchase order that was never received", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(po({ status: "CONFIRMED" }));
    const res = await createInvoice(req(invoiceBody()));
    expect(res.status).toBe(400);
    expect(prismaMock.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it("still refuses a duplicate invoice number", async () => {
    prismaMock.stockInvoice.findUnique.mockResolvedValue({ id: "inv-0" });
    const res = await createInvoice(req(invoiceBody()));
    expect(res.status).toBe(400);
  });

  it("posts nothing when the invoiced price matches the ordered price", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(po());
    const res = await createInvoice(req(invoiceBody("SINV-003", 5)));
    expect(res.status).toBe(201);
    expect(movements).toHaveLength(0);
  });
});
