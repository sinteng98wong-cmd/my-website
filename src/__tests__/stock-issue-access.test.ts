/**
 * Clinic authorization for the Stock Issue routes — real handlers, mocked
 * session and Prisma.
 */
const A = "clinic-a";
const B = "clinic-b";

const mockSession = jest.fn();
jest.mock("next-auth", () => ({ getServerSession: () => mockSession() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/services/stock-issue.service", () => ({
  postStockIssue: jest.fn(async () => ({ ok: true, movements: 1, totalQty: 2, totalValue: 10 })),
  checkLineAvailability: jest.fn(async () => ({ ok: true })),
}));

const prismaMock: any = {
  userClinic: { findMany: jest.fn() },
  stockIssue: {
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(),
    create: jest.fn(async () => ({ id: "si-1", lines: [] })),
    count: jest.fn(async () => 0),
    update: jest.fn(async () => ({ status: "PENDING_APPROVAL" })),
  },
  stockBatch: { findFirst: jest.fn(async () => ({ id: "b1" })), findMany: jest.fn(async () => []) },
  clinicStock: { findMany: jest.fn(async () => []) },
  stockMovement: { findMany: jest.fn(async () => []) },
};
jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET as listIssues, POST as createIssue } from "@/app/api/stock-issues/route";
import { GET as getIssue } from "@/app/api/stock-issues/[id]/route";
import { POST as submitIssue } from "@/app/api/stock-issues/[id]/submit/route";
import { POST as approveIssue } from "@/app/api/stock-issues/[id]/approve/route";
import { GET as expiring } from "@/app/api/inventory/expiring/route";
import { postStockIssue, checkLineAvailability } from "@/services/stock-issue.service";

const req = (url: string, body?: unknown) =>
  ({ nextUrl: new URL(url), url, json: async () => body }) as any;

const asUser = (role: string, clinicIds: string[], id = "user-1") => {
  mockSession.mockResolvedValue({ user: { id, role } });
  prismaMock.userClinic.findMany.mockResolvedValue(clinicIds.map((clinicId) => ({ clinicId })));
};

const issueAt = (clinicId: string, over: any = {}) => ({
  id: "si-1", clinicId, reference: "ISS-202608-001", status: "DRAFT", reason: "CLINICAL_CONSUMPTION",
  createdById: "user-store", submittedById: null,
  clinic: { id: clinicId, picId: "user-pic", pic: { name: "PIC" } },
  lines: [], ...over,
});

const body = (clinicId: string, reason = "CLINICAL_CONSUMPTION") => ({
  clinicId, reason, lines: [{ itemId: "item-1", quantity: 2 }],
});

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.stockIssue.findMany.mockResolvedValue([]);
  prismaMock.stockIssue.create.mockResolvedValue({ id: "si-1", lines: [] });
  prismaMock.stockIssue.count.mockResolvedValue(0);
  (checkLineAvailability as jest.Mock).mockResolvedValue({ ok: true });
});

describe("1/2. creating a stock issue", () => {
  it("lets an authorized clinic issue stock", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await createIssue(req("http://x/api/stock-issues", body(A)));
    expect(res.status).toBe(201);
    expect(prismaMock.stockIssue.create).toHaveBeenCalled();
  });

  it("refuses a clinic the user is not authorized for", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await createIssue(req("http://x/api/stock-issues", body(B)));
    expect(res.status).toBe(403);
    expect(prismaMock.stockIssue.create).not.toHaveBeenCalled();
  });

  it("refuses a clinical role outright", async () => {
    asUser("NURSE", [A]);
    const res = await createIssue(req("http://x/api/stock-issues", body(A)));
    expect(res.status).toBe(403);
  });

  it("3. refuses a quantity greater than available", async () => {
    asUser("STOREKEEPER", [A]);
    (checkLineAvailability as jest.Mock).mockResolvedValue({ ok: false, status: 409, error: "Insufficient stock" });
    const res = await createIssue(req("http://x/api/stock-issues", body(A)));
    expect(res.status).toBe(409);
    expect(prismaMock.stockIssue.create).not.toHaveBeenCalled();
  });

  it("refuses a batch that belongs to another clinic or item", async () => {
    asUser("STOREKEEPER", [A]);
    prismaMock.stockBatch.findFirst.mockResolvedValue(null);
    const res = await createIssue(req("http://x/api/stock-issues", {
      clinicId: A, reason: "EXPIRED", lines: [{ itemId: "item-1", quantity: 2, batchId: "b-other" }],
    }));
    expect(res.status).toBe(422);
  });

  it("scopes the list to the caller's clinics", async () => {
    asUser("STOREKEEPER", [A]);
    await listIssues(req("http://x/api/stock-issues"));
    expect(prismaMock.stockIssue.findMany.mock.calls[0][0].where).toMatchObject({ clinicId: { in: [A] } });
  });

  it("refuses a cross-clinic filter", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await listIssues(req(`http://x/api/stock-issues?clinicId=${B}`));
    expect(res.status).toBe(403);
    expect(prismaMock.stockIssue.findMany).not.toHaveBeenCalled();
  });
});

describe("cross-clinic access is refused everywhere", () => {
  it("refuses to read another branch's issue", async () => {
    asUser("STOREKEEPER", [A]);
    prismaMock.stockIssue.findUnique.mockResolvedValue(issueAt(B));
    const res = await getIssue(req("http://x"), { params: { id: "si-1" } });
    expect(res.status).toBe(403);
  });

  it("refuses to submit another branch's issue", async () => {
    asUser("STOREKEEPER", [A]);
    prismaMock.stockIssue.findUnique.mockResolvedValue(issueAt(B));
    const res = await submitIssue(req("http://x"), { params: { id: "si-1" } });
    expect(res.status).toBe(403);
    expect(postStockIssue).not.toHaveBeenCalled();
  });

  it("refuses to approve another branch's write-off", async () => {
    asUser("CLINIC_MANAGER", [A], "user-pic");
    prismaMock.stockIssue.findUnique.mockResolvedValue(issueAt(B, { status: "PENDING_APPROVAL", reason: "EXPIRED" }));
    const res = await approveIssue(req("http://x"), { params: { id: "si-1" } });
    expect(res.status).toBe(403);
    expect(postStockIssue).not.toHaveBeenCalled();
  });

  it("scopes the expiring-stock view", async () => {
    asUser("STOREKEEPER", [A]);
    prismaMock.stockBatch.findMany.mockResolvedValue([]);
    await expiring(req("http://x/api/inventory/expiring"));
    expect(prismaMock.stockBatch.findMany.mock.calls[0][0].where).toMatchObject({ clinicId: { in: [A] } });
  });

  it("refuses a cross-clinic expiring filter", async () => {
    asUser("STOREKEEPER", [A]);
    const res = await expiring(req(`http://x/api/inventory/expiring?clinicId=${B}`));
    expect(res.status).toBe(403);
  });
});

describe("consumption posts, write-offs wait for the PIC", () => {
  it("posts consumption straight away on submit", async () => {
    asUser("STOREKEEPER", [A], "user-store");
    prismaMock.stockIssue.findUnique.mockResolvedValue(issueAt(A));
    const res = await submitIssue(req("http://x"), { params: { id: "si-1" } });
    expect(res.status).toBe(200);
    expect(postStockIssue).toHaveBeenCalledWith("si-1", "user-store");
  });

  it("holds a write-off for approval instead of posting", async () => {
    asUser("STOREKEEPER", [A], "user-store");
    prismaMock.stockIssue.findUnique.mockResolvedValue(issueAt(A, { reason: "EXPIRED" }));
    const res = await submitIssue(req("http://x"), { params: { id: "si-1" } });
    expect(res.status).toBe(200);
    expect((await res.json()).awaitingApproval).toBe(true);
    expect(postStockIssue).not.toHaveBeenCalled();
  });

  it("lets the PIC approve and post a write-off", async () => {
    asUser("CLINIC_MANAGER", [A], "user-pic");
    prismaMock.stockIssue.findUnique.mockResolvedValue(
      issueAt(A, { status: "PENDING_APPROVAL", reason: "EXPIRED", submittedById: "user-store" })
    );
    const res = await approveIssue(req("http://x"), { params: { id: "si-1" } });
    expect(res.status).toBe(200);
    expect(postStockIssue).toHaveBeenCalledWith("si-1", "user-pic");
  });

  it("refuses the raiser approving their own write-off", async () => {
    asUser("CLINIC_MANAGER", [A], "user-store");
    prismaMock.stockIssue.findUnique.mockResolvedValue(
      issueAt(A, { status: "PENDING_APPROVAL", reason: "EXPIRED", clinic: { picId: "user-store" } })
    );
    const res = await approveIssue(req("http://x"), { params: { id: "si-1" } });
    expect(res.status).toBe(403);
    expect(postStockIssue).not.toHaveBeenCalled();
  });

  it("refuses to submit an already posted issue", async () => {
    asUser("STOREKEEPER", [A], "user-store");
    prismaMock.stockIssue.findUnique.mockResolvedValue(issueAt(A, { status: "POSTED" }));
    const res = await submitIssue(req("http://x"), { params: { id: "si-1" } });
    expect(res.status).toBe(409);
    expect(postStockIssue).not.toHaveBeenCalled();
  });
});
