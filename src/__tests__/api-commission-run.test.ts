/**
 * Tests for src/app/api/commission/staff/run/route.ts
 *
 * POST /api/commission/staff/run
 * Verifies: authentication, role guard, input validation,
 * successful delegation to runStaffCommission, and error propagation.
 */

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({}));
jest.mock("@/services/staff-commission.service", () => ({
  runStaffCommission: jest.fn(),
}));

import { getServerSession } from "next-auth";
import { runStaffCommission } from "@/services/staff-commission.service";
import { POST } from "../app/api/commission/staff/run/route";

const mockSession = getServerSession as jest.Mock;
const mockRun     = runStaffCommission as jest.Mock;

beforeEach(() => jest.resetAllMocks());

// ── Helpers ───────────────────────────────────────────────────────────────────

function session(role: string) {
  return { user: { id: "user-1", role, name: "Test" } };
}

function makePost(body: object) {
  return { json: () => Promise.resolve(body) } as any;
}

// ── Authentication ────────────────────────────────────────────────────────────

describe("POST /api/commission/staff/run — authentication", () => {
  test("returns 401 when no session", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(makePost({}));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Unauthenticated" });
  });
});

// ── Authorisation ─────────────────────────────────────────────────────────────

describe("POST /api/commission/staff/run — authorisation", () => {
  test("returns 403 for DOCTOR role", async () => {
    mockSession.mockResolvedValueOnce(session("DOCTOR"));
    const res = await POST(makePost({}));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "Forbidden" });
  });

  test("returns 403 for NURSE role", async () => {
    mockSession.mockResolvedValueOnce(session("NURSE"));
    const res = await POST(makePost({}));
    expect(res.status).toBe(403);
  });

  test("returns 403 for RECEPTIONIST role", async () => {
    mockSession.mockResolvedValueOnce(session("RECEPTIONIST"));
    const res = await POST(makePost({}));
    expect(res.status).toBe(403);
  });

  test("CLINIC_MANAGER is permitted", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    mockRun.mockResolvedValueOnce([]);
    const res = await POST(makePost({ clinicId: "c1", month: "2026-05" }));
    expect(res.status).toBe(200);
  });

  test("FINANCE is permitted", async () => {
    mockSession.mockResolvedValueOnce(session("FINANCE"));
    mockRun.mockResolvedValueOnce([]);
    const res = await POST(makePost({ clinicId: "c1", month: "2026-05" }));
    expect(res.status).toBe(200);
  });

  test("SUPER_ADMIN is permitted", async () => {
    mockSession.mockResolvedValueOnce(session("SUPER_ADMIN"));
    mockRun.mockResolvedValueOnce([]);
    const res = await POST(makePost({ clinicId: "c1", month: "2026-05" }));
    expect(res.status).toBe(200);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe("POST /api/commission/staff/run — validation", () => {
  test("returns 422 when clinicId is missing", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    const res = await POST(makePost({ month: "2026-05" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("required") });
  });

  test("returns 422 when month is missing", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    const res = await POST(makePost({ clinicId: "c1" }));
    expect(res.status).toBe(422);
  });

  test("returns 422 when month format is wrong (not YYYY-MM)", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    const res = await POST(makePost({ clinicId: "c1", month: "May-2026" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("YYYY-MM") });
  });

  test("returns 422 when month is a plain year (no month part)", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    const res = await POST(makePost({ clinicId: "c1", month: "2026" }));
    expect(res.status).toBe(422);
  });
});

// ── Success & error propagation ───────────────────────────────────────────────

describe("POST /api/commission/staff/run — success and errors", () => {
  test("returns 200 and delegates to runStaffCommission", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    const commResult = [{ staffProfileId: "s1", proRatedComm: 800 }];
    mockRun.mockResolvedValueOnce(commResult);
    const res = await POST(makePost({ clinicId: "c1", month: "2026-05" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(commResult);
  });

  test("passes clinicId and month through to runStaffCommission", async () => {
    mockSession.mockResolvedValueOnce(session("SUPER_ADMIN"));
    mockRun.mockResolvedValueOnce([]);
    await POST(makePost({ clinicId: "clinic-99", month: "2026-11" }));
    expect(mockRun).toHaveBeenCalledWith("clinic-99", "2026-11");
  });

  test("returns 422 with error message when runStaffCommission throws", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    mockRun.mockRejectedValueOnce(new Error("Config not found for clinic"));
    const res = await POST(makePost({ clinicId: "c1", month: "2026-05" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "Config not found for clinic" });
  });

  test("invalid JSON body is treated as empty object (no crash)", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    // Simulate json() throwing (malformed body)
    const req = { json: () => Promise.reject(new Error("bad json")) } as any;
    const res = await POST(req);
    expect(res.status).toBe(422); // missing clinicId/month
  });
});
