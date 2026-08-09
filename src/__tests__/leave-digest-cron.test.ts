/**
 * Authentication regression tests for the weekly leave digest cron.
 *
 * The route was previously unauthenticated and publicly callable, so anyone
 * could trigger email to every clinic's managers. These pin the guard.
 */
const sentEmails: any[] = [];
jest.mock("resend", () => ({
  Resend: class {
    emails = { send: async (payload: any) => { sentEmails.push(payload); return { id: "email-1" }; } };
  },
}));

const prismaMock: any = {
  clinic: { findMany: jest.fn(async () => []) },
  leaveApplication: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
};
jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
jest.mock("@/lib/leave-email", () => ({ clinicManagerEmails: jest.fn(async () => []) }));
jest.mock("@/lib/staff-alert", () => ({ getStaffingStatus: jest.fn(async () => []) }));

const SECRET = "leave-digest-secret";
process.env.CRON_SECRET = SECRET;
process.env.RESEND_API_KEY = "re_test";

import { GET as leaveDigest } from "@/app/api/cron/leave-digest/route";

const req = (headers: Record<string, string> = {}) =>
  ({ headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  sentEmails.length = 0;
  process.env.CRON_SECRET = SECRET;
  prismaMock.clinic.findMany.mockResolvedValue([]);
});

describe("leave digest cron authentication", () => {
  it("refuses an unauthenticated request", async () => {
    const res = await leaveDigest(req());
    expect(res.status).toBe(401);
    // and does no work at all
    expect(prismaMock.clinic.findMany).not.toHaveBeenCalled();
    expect(sentEmails).toHaveLength(0);
  });

  it("refuses a wrong secret", async () => {
    const res = await leaveDigest(req({ "x-cron-secret": "wrong" }));
    expect(res.status).toBe(401);
    expect(prismaMock.clinic.findMany).not.toHaveBeenCalled();
  });

  it("refuses a bearer token that is not the secret", async () => {
    const res = await leaveDigest(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(prismaMock.clinic.findMany).not.toHaveBeenCalled();
  });

  it("refuses a bare secret sent without the Bearer scheme", async () => {
    const res = await leaveDigest(req({ authorization: SECRET }));
    expect(res.status).toBe(401);
  });

  it("accepts this repo's x-cron-secret header", async () => {
    const res = await leaveDigest(req({ "x-cron-secret": SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(prismaMock.clinic.findMany).toHaveBeenCalled();
  });

  it("accepts the Authorization bearer header Vercel Cron sends", async () => {
    const res = await leaveDigest(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(prismaMock.clinic.findMany).toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await leaveDigest(req({ "x-cron-secret": "anything" }));
    expect(res.status).toBe(401);
    expect(prismaMock.clinic.findMany).not.toHaveBeenCalled();
  });

  it("does not treat an empty secret as a match", async () => {
    process.env.CRON_SECRET = "";
    const res = await leaveDigest(req({ "x-cron-secret": "" }));
    expect(res.status).toBe(401);
  });
});

describe("leave digest business logic is unchanged", () => {
  it("still reports how many clinics were notified", async () => {
    prismaMock.clinic.findMany.mockResolvedValue([]);
    const res = await leaveDigest(req({ "x-cron-secret": SECRET }));
    expect(await res.json()).toEqual({ ok: true, clinicsNotified: 0 });
  });
});
