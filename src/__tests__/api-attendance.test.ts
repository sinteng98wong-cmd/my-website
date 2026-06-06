/**
 * Tests for src/app/api/hr/attendance/route.ts
 *
 * GET: auth check, role-scoping (managers see all; others see own only)
 * POST: auth/role guard, field validation, upsert behaviour
 *
 * NextRequest is mocked as a plain object — no real HTTP layer needed.
 */

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    attendanceRecord: { findMany: jest.fn(), upsert: jest.fn() },
    staffProfile:     { findUnique: jest.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "../app/api/hr/attendance/route";

const mockSession   = getServerSession as jest.Mock;
const mockFindMany  = (prisma.attendanceRecord.findMany  as jest.Mock);
const mockUpsert    = (prisma.attendanceRecord.upsert    as jest.Mock);
const mockSPFindU   = (prisma.staffProfile.findUnique    as jest.Mock);

beforeEach(() => jest.resetAllMocks());

// ── Helpers ───────────────────────────────────────────────────────────────────

function session(role: string, id = "user-1") {
  return { user: { id, role, name: "Test User" } };
}

function makeGet(params: Record<string, string> = {}) {
  return {
    nextUrl: { searchParams: new URLSearchParams(params) },
  } as any;
}

function makePost(body: object) {
  return { json: () => Promise.resolve(body) } as any;
}

// ── GET ───────────────────────────────────────────────────────────────────────

describe("GET /api/hr/attendance — authentication", () => {
  test("returns 401 when no session", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Unauthenticated" });
  });
});

describe("GET /api/hr/attendance — role scoping", () => {
  test("CLINIC_MANAGER fetches all records without staffProfileId restriction", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    mockFindMany.mockResolvedValueOnce([]);
    await GET(makeGet({ clinicId: "c1" }));
    const where = mockFindMany.mock.calls[0][0].where;
    // Manager passes no staffProfileId restriction
    expect(where.staffProfileId).toBeUndefined();
  });

  test("SUPER_ADMIN fetches all records without staffProfileId restriction", async () => {
    mockSession.mockResolvedValueOnce(session("SUPER_ADMIN"));
    mockFindMany.mockResolvedValueOnce([]);
    await GET(makeGet());
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.staffProfileId).toBeUndefined();
  });

  test("NURSE scopes query to own staffProfileId", async () => {
    mockSession.mockResolvedValueOnce(session("NURSE", "user-99"));
    mockSPFindU.mockResolvedValueOnce({ id: "sp-99" });
    mockFindMany.mockResolvedValueOnce([]);
    await GET(makeGet());
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.staffProfileId).toBe("sp-99");
  });

  test("non-manager with no staffProfile uses __none__ sentinel", async () => {
    mockSession.mockResolvedValueOnce(session("NURSE", "user-99"));
    mockSPFindU.mockResolvedValueOnce(null);
    mockFindMany.mockResolvedValueOnce([]);
    await GET(makeGet());
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.staffProfileId).toBe("__none__");
  });
});

describe("GET /api/hr/attendance — query filters", () => {
  test("clinicId param is forwarded to findMany where clause", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    mockFindMany.mockResolvedValueOnce([]);
    await GET(makeGet({ clinicId: "clinic-42" }));
    expect(mockFindMany.mock.calls[0][0].where.clinicId).toBe("clinic-42");
  });

  test("date param produces a single-day range in where.date", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    mockFindMany.mockResolvedValueOnce([]);
    await GET(makeGet({ date: "2026-06-05" }));
    const { gte, lt } = mockFindMany.mock.calls[0][0].where.date;
    expect(gte).toBeInstanceOf(Date);
    expect(lt).toBeInstanceOf(Date);
    expect(lt.getTime() - gte.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  test("returns the records from Prisma as JSON", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    const records = [{ id: "ar-1", status: "PRESENT" }];
    mockFindMany.mockResolvedValueOnce(records);
    const res = await GET(makeGet());
    expect(await res.json()).toEqual(records);
  });
});

// ── POST ──────────────────────────────────────────────────────────────────────

describe("POST /api/hr/attendance — authentication & authorisation", () => {
  test("returns 401 when no session", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(makePost({}));
    expect(res.status).toBe(401);
  });

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
});

describe("POST /api/hr/attendance — validation", () => {
  test("returns 422 when staffProfileId is missing", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    const res = await POST(makePost({ clinicId: "c1", date: "2026-06-05" }));
    expect(res.status).toBe(422);
  });

  test("returns 422 when clinicId is missing", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    const res = await POST(makePost({ staffProfileId: "s1", date: "2026-06-05" }));
    expect(res.status).toBe(422);
  });

  test("returns 422 when date is missing", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER"));
    const res = await POST(makePost({ staffProfileId: "s1", clinicId: "c1" }));
    expect(res.status).toBe(422);
  });
});

describe("POST /api/hr/attendance — success", () => {
  test("returns 201 and the upserted record", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER", "user-1"));
    const record = { id: "ar-1", status: "PRESENT", staffProfileId: "s1" };
    mockUpsert.mockResolvedValueOnce(record);
    const res = await POST(makePost({
      staffProfileId: "s1", clinicId: "c1", date: "2026-06-05", status: "PRESENT",
    }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(record);
  });

  test("defaults status to PRESENT when not provided", async () => {
    mockSession.mockResolvedValueOnce(session("CLINIC_MANAGER", "user-1"));
    mockUpsert.mockResolvedValueOnce({ id: "ar-1" });
    await POST(makePost({ staffProfileId: "s1", clinicId: "c1", date: "2026-06-05" }));
    const upsertArg = mockUpsert.mock.calls[0][0];
    expect(upsertArg.create.status).toBe("PRESENT");
    expect(upsertArg.update.status).toBe("PRESENT");
  });

  test("recordedById is set to the session user id", async () => {
    mockSession.mockResolvedValueOnce(session("SUPER_ADMIN", "user-42"));
    mockUpsert.mockResolvedValueOnce({ id: "ar-1" });
    await POST(makePost({ staffProfileId: "s1", clinicId: "c1", date: "2026-06-05" }));
    const upsertArg = mockUpsert.mock.calls[0][0];
    expect(upsertArg.create.recordedById).toBe("user-42");
  });

  test("SUPER_ADMIN is also allowed to POST", async () => {
    mockSession.mockResolvedValueOnce(session("SUPER_ADMIN"));
    mockUpsert.mockResolvedValueOnce({ id: "ar-1" });
    const res = await POST(makePost({ staffProfileId: "s1", clinicId: "c1", date: "2026-06-05" }));
    expect(res.status).toBe(201);
  });
});
