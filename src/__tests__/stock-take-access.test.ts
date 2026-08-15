/**
 * Clinic authorization for the Stock Take routes — real handlers, mocked
 * session and Prisma. Branch A must never reach Branch B's counts.
 */
const A = "clinic-a";
const B = "clinic-b";

const mockSession = jest.fn();
jest.mock("next-auth", () => ({ getServerSession: () => mockSession() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/services/stock-take.service", () => ({
  buildStockTakeLines: jest.fn(async (_c: string, ids: string[]) =>
    ids.map((itemId) => ({ itemId, systemQty: 0, avgUnitCost: "0.0000" }))),
  approveStockTake: jest.fn(async () => ({ ok: true, posted: 0, movements: 0, varianceQty: 0, varianceValue: 0 })),
  refreshStockTakeSnapshot: jest.fn(async () => undefined),
}));

const prismaMock: any = {
  userClinic:    { findMany: jest.fn() },
  stockItem:     { findMany: jest.fn(async () => [{ id: "item-1" }]) },
  stockTake:     { findMany: jest.fn(async () => []), findUnique: jest.fn(), create: jest.fn(async () => ({ id: "st-1" })), count: jest.fn(async () => 0), update: jest.fn(async () => ({ status: "REJECTED" })) },
  stockTakeLine: { findFirst: jest.fn(), update: jest.fn(async () => ({})) },
};
jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET as listTakes, POST as createTake } from "@/app/api/stock-takes/route";
import { GET as getTake } from "@/app/api/stock-takes/[id]/route";
import { PATCH as patchLine } from "@/app/api/stock-takes/[id]/lines/route";
import { POST as approveTake } from "@/app/api/stock-takes/[id]/approve/route";
import { approveStockTake } from "@/services/stock-take.service";

const req = (url: string, body?: unknown) =>
  ({ nextUrl: new URL(url), url, json: async () => body }) as any;

const asUser = (role: string, clinicIds: string[], id = "user-1") => {
  mockSession.mockResolvedValue({ user: { id, role } });
  prismaMock.userClinic.findMany.mockResolvedValue(clinicIds.map((clinicId) => ({ clinicId })));
};

const takeAt = (clinicId: string, over: any = {}) => ({
  id: "st-1", clinicId, status: "SUBMITTED", reference: "STK-202608-001",
  createdById: "user-counter", submittedById: "user-counter",
  clinic: { id: clinicId, picId: "user-pic", pic: { name: "PIC" } },
  lines: [], ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.stockTake.findMany.mockResolvedValue([]);
  prismaMock.stockItem.findMany.mockResolvedValue([{ id: "item-1" }]);
  prismaMock.stockTake.create.mockResolvedValue({ id: "st-1" });
  prismaMock.stockTake.count.mockResolvedValue(0);
});

describe("1+2. creating a stock take", () => {
  it("lets an authorized clinic raise one", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await createTake(req("http://x/api/stock-takes", { clinicId: A }));
    expect(res.status).toBe(201);
    expect(prismaMock.stockTake.create).toHaveBeenCalled();
  });

  it("refuses a clinic the user is not authorized for", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await createTake(req("http://x/api/stock-takes", { clinicId: B }));
    expect(res.status).toBe(403);
    expect(prismaMock.stockTake.create).not.toHaveBeenCalled();
  });

  it("refuses a clinical role outright", async () => {
    asUser("DOCTOR", [A]);
    const res = await createTake(req("http://x/api/stock-takes", { clinicId: A }));
    expect(res.status).toBe(403);
  });

  it("scopes the list to the caller's clinics", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await listTakes(req("http://x/api/stock-takes"));
    expect(res.status).toBe(200);
    expect(prismaMock.stockTake.findMany.mock.calls[0][0].where).toMatchObject({ clinicId: { in: [A] } });
  });

  it("refuses a cross-clinic filter rather than honouring it", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await listTakes(req(`http://x/api/stock-takes?clinicId=${B}`));
    expect(res.status).toBe(403);
    expect(prismaMock.stockTake.findMany).not.toHaveBeenCalled();
  });
});

describe("11. branch cannot touch another branch's stock take", () => {
  it("refuses to read it", async () => {
    asUser("STOREKEEPER", [A]);
    prismaMock.stockTake.findUnique.mockResolvedValue(takeAt(B));
    const res = await getTake(req("http://x"), { params: { id: "st-1" } });
    expect(res.status).toBe(403);
  });

  it("refuses to count on it", async () => {
    asUser("STOREKEEPER", [A]);
    prismaMock.stockTake.findUnique.mockResolvedValue({ id: "st-1", clinicId: B, status: "DRAFT" });
    const res = await patchLine(req("http://x", { lineId: "l1", physicalQty: 5 }), { params: { id: "st-1" } });
    expect(res.status).toBe(403);
    expect(prismaMock.stockTakeLine.update).not.toHaveBeenCalled();
  });

  it("refuses to approve it", async () => {
    asUser("CLINIC_MANAGER", [A], "user-pic");
    prismaMock.stockTake.findUnique.mockResolvedValue(takeAt(B));
    const res = await approveTake(req("http://x"), { params: { id: "st-1" } });
    expect(res.status).toBe(403);
    expect(approveStockTake).not.toHaveBeenCalled();
  });
});

describe("7+9. approval guards at the route", () => {
  it("lets the PIC of the right clinic approve", async () => {
    asUser("CLINIC_MANAGER", [A], "user-pic");
    prismaMock.stockTake.findUnique.mockResolvedValue(takeAt(A));
    const res = await approveTake(req("http://x"), { params: { id: "st-1" } });
    expect(res.status).toBe(200);
    expect(approveStockTake).toHaveBeenCalledWith("st-1", "user-pic");
  });

  it("refuses the person who raised the count", async () => {
    asUser("CLINIC_MANAGER", [A], "user-counter");
    prismaMock.stockTake.findUnique.mockResolvedValue(takeAt(A, { clinic: { picId: "user-counter" } }));
    const res = await approveTake(req("http://x"), { params: { id: "st-1" } });
    expect(res.status).toBe(403);
    expect(approveStockTake).not.toHaveBeenCalled();
  });

  it("refuses to approve an already approved take", async () => {
    asUser("CLINIC_MANAGER", [A], "user-pic");
    prismaMock.stockTake.findUnique.mockResolvedValue(takeAt(A, { status: "APPROVED" }));
    const res = await approveTake(req("http://x"), { params: { id: "st-1" } });
    expect(res.status).toBe(409);
    expect(approveStockTake).not.toHaveBeenCalled();
  });

  it("refuses to edit a line on an approved take", async () => {
    asUser("STOREKEEPER", [A]);
    prismaMock.stockTake.findUnique.mockResolvedValue({ id: "st-1", clinicId: A, status: "APPROVED" });
    const res = await patchLine(req("http://x", { lineId: "l1", physicalQty: 5 }), { params: { id: "st-1" } });
    expect(res.status).toBe(409);
    expect(prismaMock.stockTakeLine.update).not.toHaveBeenCalled();
  });
});
