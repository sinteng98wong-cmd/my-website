/**
 * Cron endpoint regression tests: authentication, and that each outcome is
 * recorded and alerted on correctly.
 */
jest.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockRun = jest.fn();
jest.mock("@/lib/stock-drift-run", () => {
  const actual = jest.requireActual("@/lib/stock-drift-run");
  return { ...actual, runAndRecordDrift: (...args: any[]) => mockRun(...args) };
});

const sentEmails: any[] = [];
jest.mock("resend", () => ({
  Resend: class {
    emails = { send: async (payload: any) => { sentEmails.push(payload); return { id: "email-1" }; } };
  },
}));

const prismaMock: any = {
  user: { findMany: jest.fn(async () => [{ email: "admin@dentalos.my" }]) },
  stockDriftRun: { update: jest.fn(async () => ({})) },
};
jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const SECRET = "test-cron-secret";
process.env.CRON_SECRET = SECRET;
process.env.RESEND_API_KEY = "re_test";

import { GET as cron } from "@/app/api/cron/stock-drift/route";

const req = (headers: Record<string, string> = {}) =>
  ({ headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } }) as any;

const summary = (over: any = {}) => ({
  runId: "run-1", status: "SUCCESS", outcome: "CLEAN", clean: true,
  startedAt: new Date(), finishedAt: new Date(), durationMs: 1200,
  positions: 29, movements: 140, errorCount: 0, warningCount: 0, infoCount: 26,
  findings: [], needsAlert: false, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  sentEmails.length = 0;
  mockRun.mockResolvedValue(summary());
});

describe("cron authentication", () => {
  it("refuses an unauthenticated call", async () => {
    const res = await cron(req());
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("refuses a wrong secret", async () => {
    const res = await cron(req({ "x-cron-secret": "nope" }));
    expect(res.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("accepts this repo's x-cron-secret header", async () => {
    const res = await cron(req({ "x-cron-secret": SECRET }));
    expect(res.status).toBe(200);
    expect(mockRun).toHaveBeenCalledWith({ trigger: "CRON" });
  });

  it("accepts the Authorization bearer header a scheduler sends", async () => {
    const res = await cron(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(mockRun).toHaveBeenCalled();
  });
});

describe("cron outcomes", () => {
  it("reports a clean run and alerts nobody", async () => {
    const res = await cron(req({ "x-cron-secret": SECRET }));
    const body = await res.json();
    expect(body).toMatchObject({ status: "SUCCESS", clean: true, errors: 0, infos: 26, needsAlert: false, alerted: false });
    expect(sentEmails).toHaveLength(0);
  });

  it("does not alert on an informational-only run", async () => {
    mockRun.mockResolvedValue(summary({ infoCount: 250 }));
    const res = await cron(req({ "x-cron-secret": SECRET }));
    const body = await res.json();
    expect(body.clean).toBe(true);
    expect(body.alerted).toBe(false);
    expect(sentEmails).toHaveLength(0);
  });

  it("emails administrators when the ledger stops reconciling", async () => {
    mockRun.mockResolvedValue(summary({
      outcome: "ERRORS", clean: false, errorCount: 3, needsAlert: true,
      findings: [{ code: "BALANCE_MISMATCH", severity: "ERROR", detail: "mismatch", clinicName: "Clinic A", itemName: "Gloves" }],
    }));
    const res = await cron(req({ "x-cron-secret": SECRET }));
    const body = await res.json();
    expect(body.needsAlert).toBe(true);
    expect(body.alerted).toBe(true);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].subject).toContain("3 error");
    expect(sentEmails[0].html).toContain("BALANCE_MISMATCH");
    expect(prismaMock.stockDriftRun.update).toHaveBeenCalled();
  });

  it("emails administrators when the run itself fails", async () => {
    mockRun.mockResolvedValue(summary({
      status: "FAILED", outcome: "FAILED", clean: false, needsAlert: true,
      errorMessage: "database unavailable",
    }));
    const res = await cron(req({ "x-cron-secret": SECRET }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("FAILED");
    expect(sentEmails[0].subject).toContain("failed");
  });

  it("only notifies group-wide roles", async () => {
    mockRun.mockResolvedValue(summary({ clean: false, errorCount: 1, needsAlert: true }));
    await cron(req({ "x-cron-secret": SECRET }));
    expect(prismaMock.user.findMany.mock.calls[0][0].where.role.in).toEqual(["SUPER_ADMIN", "FINANCE"]);
  });

  it("still reports the drift when administrators cannot be notified", async () => {
    prismaMock.user.findMany.mockRejectedValueOnce(new Error("db down"));
    mockRun.mockResolvedValue(summary({ clean: false, errorCount: 1, needsAlert: true }));
    const res = await cron(req({ "x-cron-secret": SECRET }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // the run outcome survives a failed notification, and says it went unsent
    expect(body).toMatchObject({ errors: 1, clean: false, needsAlert: true, alerted: false });
  });
});
