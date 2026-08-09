/**
 * H-5 at the ledger boundary.
 *
 * stock-ppv.test.ts proves the arithmetic. This proves what the supplier
 * invoice route actually posts: movement types, direction, zero quantity,
 * distinct deterministic posting keys, current period, that ClinicStock
 * quantity is never touched by a revaluation, and that a rejected invoice
 * posts nothing at all.
 *
 * Real route handler, mocked session and Prisma — the same shape as
 * stock-invoice-guard.test.ts.
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
    findUnique: jest.fn(async () => ({ quantity: 40, avgUnitCost: 5 })),
    update:     jest.fn(async (args: any) => { stockWrites.push(args); return {}; }),
  },
  stockMovement: {
    create:    jest.fn(async ({ data }: any) => { movements.push(data); return { id: `mv-${movements.length}`, ...data }; }),
    aggregate: jest.fn(async () => ({ _sum: { qtyIn: 100 } })),
  },
  deliveryOrder: { findMany: jest.fn(async () => []) },
  $transaction:  jest.fn(async (fn: any) => (typeof fn === "function" ? fn(prismaMock) : [])),
};
jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST as createInvoice } from "@/app/api/stock-invoices/route";
import { periodOf } from "@/lib/stock-ledger";

const req = (body: unknown) => ({ nextUrl: new URL("http://x"), url: "http://x", json: async () => body }) as any;

/** The approved example: 100 ordered @ RM5, all received. */
const po = (over: any = {}) => ({
  id: "po-1", poRef: "PO-2026-001", clinicId: A, status: "RECEIVED",
  stockInvoice: null,
  lines: [{ id: "pol-1", itemId: "item-1", quantity: 100, receivedQty: 100, unitCost: 5, item: { id: "item-1", name: "Gloves" } }],
  clinic: { id: A },
  ...over,
});

const invoiceBody = (ref = "SINV-001", cost = 6) => ({
  source: "SUPPLIER", invoiceRef: ref, month: "2026-08",
  purchaseOrderId: "po-1", supplierId: "sup-1",
  lineUpdates: [{ lineId: "pol-1", invoicedUnitCost: cost }],
});

const byType = (t: string) => movements.filter((m) => m.type === t);
const reval  = () => byType("REVALUATION")[0];
const ppv    = () => byType("PURCHASE_PRICE_VARIANCE")[0];

beforeEach(() => {
  jest.clearAllMocks();
  movements.length = 0;
  stockWrites.length = 0;
  mockSession.mockResolvedValue({ user: { id: "user-1", role: "FINANCE" } });
  prismaMock.stockInvoice.findUnique.mockResolvedValue(null);
  prismaMock.stockInvoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv-1", ...data }));
  prismaMock.purchaseOrder.findUnique.mockResolvedValue(po());
  prismaMock.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.clinicStock.findUnique.mockResolvedValue({ quantity: 40, avgUnitCost: 5 });
  prismaMock.stockMovement.aggregate.mockResolvedValue({ _sum: { qtyIn: 100 } });
  prismaMock.$transaction.mockImplementation(async (fn: any) => (typeof fn === "function" ? fn(prismaMock) : []));
});

describe("the approved worked example — 100 @ RM5, 60 consumed, invoiced RM6", () => {
  it("posts both halves of the correction", async () => {
    const res = await createInvoice(req(invoiceBody()));
    expect(res.status).toBe(201);
    expect(byType("REVALUATION")).toHaveLength(1);
    expect(byType("PURCHASE_PRICE_VARIANCE")).toHaveLength(1);
  });

  it("splits RM40 to inventory and RM60 to purchase price variance", async () => {
    await createInvoice(req(invoiceBody()));
    expect(Number(reval().valueDelta)).toBe(40);
    expect(Number(ppv().valueDelta)).toBe(60);
  });

  it("keeps the two halves summing to the total correction", async () => {
    await createInvoice(req(invoiceBody()));
    const total = Number(reval().valueDelta) + Number(ppv().valueDelta);
    expect(total).toBe(100); // RM1 × 100 invoiced units
  });
});

describe("movement shape", () => {
  beforeEach(async () => { await createInvoice(req(invoiceBody())); });

  it("posts PPV with direction NONE", () => {
    expect(ppv().direction).toBe("NONE");
  });

  it("posts PPV with zero quantity on both sides", () => {
    expect(ppv().qtyIn).toBe(0);
    expect(ppv().qtyOut).toBe(0);
  });

  it("posts the revaluation with zero quantity too", () => {
    expect(reval().qtyIn).toBe(0);
    expect(reval().qtyOut).toBe(0);
    expect(reval().direction).toBe("NONE");
  });

  it("gives the two halves distinct deterministic posting keys", () => {
    expect(reval().postingKey).toBe("REVAL:PO:SINV-001:pol-1");
    expect(ppv().postingKey).toBe("PPV:PO:SINV-001:pol-1");
    expect(ppv().postingKey).not.toBe(reval().postingKey);
  });

  it("uses the current period, not the original receipt period", () => {
    expect(ppv().period).toBe(periodOf(new Date()));
    expect(reval().period).toBe(periodOf(new Date()));
  });

  it("attributes both halves to the supplier invoice and PO line", () => {
    for (const m of [reval(), ppv()]) {
      expect(m.sourceType).toBe("STOCK_INVOICE");
      expect(m.sourceId).toBe("po-1");
      expect(m.sourceLineId).toBe("pol-1");
      expect(m.reference).toBe("SINV-001");
    }
  });

  it("describes each half as a valuation allocation, not batch attribution", () => {
    expect(reval().note).toMatch(/weighted-average inventory allocation/i);
    expect(ppv().note).toMatch(/purchase price variance/i);
    for (const m of [reval(), ppv()]) expect(m.note).toMatch(/not physical batch attribution/i);
  });
});

describe("ClinicStock is revalued, never re-quantified", () => {
  it("writes only avgUnitCost — quantity is never in the update", async () => {
    await createInvoice(req(invoiceBody()));
    expect(stockWrites).toHaveLength(1);
    expect(stockWrites[0].data).toHaveProperty("avgUnitCost");
    expect(stockWrites[0].data).not.toHaveProperty("quantity");
  });

  it("moves the average by the inventory share only", async () => {
    await createInvoice(req(invoiceBody()));
    // 40 held at avg 5 = 200, +40 correction = 240 over 40 units = 6.00
    expect(stockWrites[0].data.avgUnitCost).toBeCloseTo(6, 10);
  });

  it("does not touch stock at all when nothing remains", async () => {
    prismaMock.clinicStock.findUnique.mockResolvedValue({ quantity: 0, avgUnitCost: 5 });
    await createInvoice(req(invoiceBody()));
    expect(stockWrites).toHaveLength(0);
  });
});

describe("zero stock — the whole correction becomes PPV", () => {
  beforeEach(() => prismaMock.clinicStock.findUnique.mockResolvedValue({ quantity: 0, avgUnitCost: 5 }));

  it("posts PPV only, and never silently drops the correction", async () => {
    await createInvoice(req(invoiceBody()));
    expect(byType("REVALUATION")).toHaveLength(0);
    expect(byType("PURCHASE_PRICE_VARIANCE")).toHaveLength(1);
    expect(Number(ppv().valueDelta)).toBe(100);
  });

  it("still posts the full credit when the invoice price is lower", async () => {
    await createInvoice(req(invoiceBody("SINV-002", 4)));
    expect(Number(ppv().valueDelta)).toBe(-100);
  });
});

describe("all stock remains — the whole correction is inventory", () => {
  beforeEach(() => prismaMock.clinicStock.findUnique.mockResolvedValue({ quantity: 100, avgUnitCost: 5 }));

  it("posts a revaluation and no PPV", async () => {
    await createInvoice(req(invoiceBody()));
    expect(byType("REVALUATION")).toHaveLength(1);
    expect(byType("PURCHASE_PRICE_VARIANCE")).toHaveLength(0);
    expect(Number(reval().valueDelta)).toBe(100);
  });
});

describe("a lower invoice price keeps its sign on both halves", () => {
  it("posts a negative revaluation and a negative PPV", async () => {
    await createInvoice(req(invoiceBody("SINV-003", 4)));
    expect(Number(reval().valueDelta)).toBe(-40);
    expect(Number(ppv().valueDelta)).toBe(-60);
    expect(Number(reval().valueDelta) + Number(ppv().valueDelta)).toBe(-100);
  });

  it("lowers the weighted average rather than flooring it", async () => {
    await createInvoice(req(invoiceBody("SINV-003", 4)));
    // 40 held at avg 5 = 200, −40 = 160 over 40 units = 4.00
    expect(stockWrites[0].data.avgUnitCost).toBeCloseTo(4, 10);
    expect(stockWrites[0].data.avgUnitCost).toBeGreaterThan(0);
  });
});

describe("free goods", () => {
  it("are excluded from the correction base", async () => {
    // 100 ordered, 120 received — 20 free. Pool counts paid receipts only.
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(
      po({ lines: [{ id: "pol-1", itemId: "item-1", quantity: 100, receivedQty: 120, unitCost: 5, item: { id: "item-1", name: "Gloves" } }] })
    );
    prismaMock.clinicStock.findUnique.mockResolvedValue({ quantity: 120, avgUnitCost: 5 });
    await createInvoice(req(invoiceBody()));
    // RM1 × 100 invoiced units, not 120.
    const total = movements.reduce((s, m) => s + Number(m.valueDelta), 0);
    expect(total).toBe(100);
  });
});

describe("multiple purchase orders for the same item", () => {
  it("measures the correction against the shared paid pool", async () => {
    // 200 received across two POs, 40 on hand → 20% inventory share.
    prismaMock.stockMovement.aggregate.mockResolvedValue({ _sum: { qtyIn: 200 } });
    await createInvoice(req(invoiceBody()));
    expect(Number(reval().valueDelta)).toBe(20);
    expect(Number(ppv().valueDelta)).toBe(80);
    expect(Number(reval().valueDelta) + Number(ppv().valueDelta)).toBe(100);
  });
});

describe("no price difference", () => {
  it("posts neither a revaluation nor a PPV", async () => {
    const res = await createInvoice(req(invoiceBody("SINV-004", 5)));
    expect(res.status).toBe(201);
    expect(movements).toHaveLength(0);
    expect(stockWrites).toHaveLength(0);
  });
});

describe("C-1 remains intact — a rejected invoice posts nothing", () => {
  it("creates no PPV and no revaluation when the PO is already invoiced", async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(po({ stockInvoice: { invoiceRef: "SINV-001" } }));
    const res = await createInvoice(req(invoiceBody("SINV-002")));
    expect(res.status).toBe(409);
    expect(byType("PURCHASE_PRICE_VARIANCE")).toHaveLength(0);
    expect(byType("REVALUATION")).toHaveLength(0);
    expect(stockWrites).toHaveLength(0);
  });

  it("creates no PPV when a concurrent invoice loses the atomic claim", async () => {
    prismaMock.purchaseOrder.updateMany.mockResolvedValue({ count: 0 });
    const res = await createInvoice(req(invoiceBody("SINV-002")));
    expect(res.status).toBe(409);
    expect(movements).toHaveLength(0);
    expect(stockWrites).toHaveLength(0);
    expect(prismaMock.stockInvoice.create).not.toHaveBeenCalled();
  });

  it("creates no PPV when the unique constraint rejects a race", async () => {
    prismaMock.stockInvoice.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: ["purchaseOrderId"] } })
    );
    const res = await createInvoice(req(invoiceBody("SINV-002")));
    expect(res.status).toBe(409);
    // The transaction is rolled back by Prisma; the route must not have
    // returned success or reported a posted correction.
    expect((await res.json()).error).toContain("already been invoiced");
  });
});
