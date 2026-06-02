/**
 * staff-commission.service.ts — unit tests
 *
 * Prisma is mocked via vi.mock so no real DB is needed.
 * Each test drives runStaffCommission() through a controlled scenario and
 * asserts the correct StaffCommission rows would be written.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommissionMethod } from "@prisma/client";

// ── Prisma mock ──────────────────────────────────────────────────────────────
// We construct a mock PrismaClient-shaped object and pass it as the optional
// `prisma` parameter so no module-level mock is needed.

type MockPrisma = {
  commissionConfig: { findFirst: ReturnType<typeof vi.fn> };
  staffProfile:     { findMany:  ReturnType<typeof vi.fn> };
  treatment:        { aggregate: ReturnType<typeof vi.fn> };
  attendance:       { findUnique: ReturnType<typeof vi.fn> };
  staffCommission:  { upsert: ReturnType<typeof vi.fn> };
};

function makeMockPrisma(): MockPrisma {
  return {
    commissionConfig: { findFirst:  vi.fn() },
    staffProfile:     { findMany:   vi.fn() },
    treatment:        { aggregate:  vi.fn() },
    attendance:       { findUnique: vi.fn() },
    staffCommission:  { upsert:     vi.fn() },
  };
}

// ── Fixture factories ────────────────────────────────────────────────────────

const TIERS_PROGRESSIVE = [
  { tierOrder: 1, floorAmount: "0",    ceilAmount: "8000",  rate: "5"  },
  { tierOrder: 2, floorAmount: "8000", ceilAmount: null,    rate: "8"  },
];

function makeConfig(overrides: Partial<{
  method: CommissionMethod;
  tierType: string;
  forfeitThreshold: number;
}> = {}) {
  return {
    method:           overrides.method           ?? CommissionMethod.INDIVIDUAL,
    tierType:         overrides.tierType         ?? "PROGRESSIVE",
    forfeitThreshold: overrides.forfeitThreshold ?? 5,
    tiers:            TIERS_PROGRESSIVE,
  };
}

function makeStaff(id: string, name: string) {
  return { id, user: { name } };
}

function makeAttendance(overrides: Partial<{
  totalWorkDays: number;
  mcDays: number;
  elDays: number;
  unpaidDays: number;
  timeSlipDays: number;
  alDays: number;
  lateCount: number;
}> = {}) {
  return {
    totalWorkDays: overrides.totalWorkDays ?? 26,
    mcDays:        overrides.mcDays        ?? 0,
    elDays:        overrides.elDays        ?? 0,
    unpaidDays:    overrides.unpaidDays    ?? 0,
    timeSlipDays:  overrides.timeSlipDays  ?? 0,
    alDays:        overrides.alDays        ?? 0,
    lateCount:     overrides.lateCount     ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

import { runStaffCommission } from "../staff-commission.service";

describe("runStaffCommission()", () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makeMockPrisma();
    // Default upsert returns a generated id
    prisma.staffCommission.upsert.mockResolvedValue({ id: "sc-001" });
  });

  // ── Happy path: single staff, full attendance, PROGRESSIVE tiers ──────────

  it("calculates correct proRatedCommission for fully-attended staff", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(makeConfig());
    prisma.staffProfile.findMany.mockResolvedValue([makeStaff("sp-1", "Alice")]);
    prisma.treatment.aggregate.mockResolvedValue({ _sum: { collectedAmount: "15000" } });
    prisma.attendance.findUnique.mockResolvedValue(makeAttendance());

    const result = await runStaffCommission("clinic-a", "2026-05", prisma as any);

    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    // 15 000 PROGRESSIVE: 8000×5%=400 + 7000×8%=560 → gross=960
    expect(r.grossCommission).toBe(960);
    // Full attendance → proRated = gross (26/26)
    expect(r.proRatedCommission).toBe(960);
    expect(r.forfeited).toBe(false);
    expect(r.attendedDays).toBe(26);
  });

  // ── Pro-ration with absences ───────────────────────────────────────────────

  it("pro-rates commission when staff has MC and EL absences", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(makeConfig());
    prisma.staffProfile.findMany.mockResolvedValue([makeStaff("sp-2", "Bob")]);
    prisma.treatment.aggregate.mockResolvedValue({ _sum: { collectedAmount: "15000" } });
    prisma.attendance.findUnique.mockResolvedValue(makeAttendance({ mcDays: 2, elDays: 1 }));

    const result = await runStaffCommission("clinic-a", "2026-05", prisma as any);
    const r = result.results[0];

    // attendedDays = 26 - 2 - 1 = 23
    expect(r.attendedDays).toBe(23);
    // proRated = 960 × (23/26) = 849.23
    expect(r.proRatedCommission).toBe(849.23);
  });

  // ── Annual leave does NOT reduce attended days ─────────────────────────────

  it("AL days do not reduce attended days", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(makeConfig());
    prisma.staffProfile.findMany.mockResolvedValue([makeStaff("sp-3", "Carol")]);
    prisma.treatment.aggregate.mockResolvedValue({ _sum: { collectedAmount: "15000" } });
    prisma.attendance.findUnique.mockResolvedValue(makeAttendance({ alDays: 5 }));

    const result = await runStaffCommission("clinic-a", "2026-05", prisma as any);
    const r = result.results[0];

    expect(r.attendedDays).toBe(26);         // AL does not deduct
    expect(r.proRatedCommission).toBe(960);  // full payout
  });

  // ── Forfeit rule ───────────────────────────────────────────────────────────

  it("forfeits commission when combined absences exceed threshold", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(makeConfig({ forfeitThreshold: 5 }));
    prisma.staffProfile.findMany.mockResolvedValue([makeStaff("sp-4", "Dan")]);
    prisma.treatment.aggregate.mockResolvedValue({ _sum: { collectedAmount: "15000" } });
    // MC=3, EL=2, late=1 → combined=6 > 5
    prisma.attendance.findUnique.mockResolvedValue(makeAttendance({ mcDays: 3, elDays: 2, lateCount: 1 }));

    const result = await runStaffCommission("clinic-a", "2026-05", prisma as any);
    const r = result.results[0];

    expect(r.forfeited).toBe(true);
    expect(r.proRatedCommission).toBe(0);
    expect(r.grossCommission).toBe(0);
    expect(r.forfeitReason).toMatch(/6.*threshold.*5/i);
  });

  it("does NOT forfeit when combined absences equal threshold exactly", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(makeConfig({ forfeitThreshold: 5 }));
    prisma.staffProfile.findMany.mockResolvedValue([makeStaff("sp-5", "Eve")]);
    prisma.treatment.aggregate.mockResolvedValue({ _sum: { collectedAmount: "15000" } });
    // MC=2, EL=1, late=2 → combined=5 = threshold (not exceeded)
    prisma.attendance.findUnique.mockResolvedValue(makeAttendance({ mcDays: 2, elDays: 1, lateCount: 2 }));

    const result = await runStaffCommission("clinic-a", "2026-05", prisma as any);
    expect(result.results[0].forfeited).toBe(false);
  });

  // ── Time slip deduction ────────────────────────────────────────────────────

  it("time slip of 0.5 day reduces attended days by 0.5", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(makeConfig());
    prisma.staffProfile.findMany.mockResolvedValue([makeStaff("sp-6", "Frank")]);
    prisma.treatment.aggregate.mockResolvedValue({ _sum: { collectedAmount: "15000" } });
    prisma.attendance.findUnique.mockResolvedValue(makeAttendance({ timeSlipDays: 0.5 }));

    const result = await runStaffCommission("clinic-a", "2026-05", prisma as any);
    const r = result.results[0];
    // attendedDays = 26 - 0.5 = 25.5
    expect(r.attendedDays).toBe(25.5);
    // proRated = 960 × (25.5/26) = 941.54
    expect(r.proRatedCommission).toBe(941.54);
  });

  // ── POOL_DIVIDE method ─────────────────────────────────────────────────────

  it("POOL_DIVIDE: splits clinic total evenly among staff before applying tiers", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(makeConfig({ method: CommissionMethod.POOL_DIVIDE }));
    prisma.staffProfile.findMany.mockResolvedValue([
      makeStaff("sp-7", "Grace"),
      makeStaff("sp-8", "Hana"),
    ]);
    // Clinic total = 20 000 → each gets 10 000
    prisma.treatment.aggregate.mockResolvedValue({ _sum: { collectedAmount: "20000" } });
    prisma.attendance.findUnique.mockResolvedValue(makeAttendance());

    const result = await runStaffCommission("clinic-a", "2026-05", prisma as any);

    expect(result.poolDivided).toBe(true);
    expect(result.results).toHaveLength(2);

    // Per-staff sales = 10 000
    // PROGRESSIVE: 8000×5%=400 + 2000×8%=160 → gross=560
    for (const r of result.results) {
      expect(r.totalSales).toBe(10000);
      expect(r.grossCommission).toBe(560);
    }
  });

  // ── No attendance record → treats as fully attended ───────────────────────

  it("uses default full-attendance when no Attendance row exists", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(makeConfig());
    prisma.staffProfile.findMany.mockResolvedValue([makeStaff("sp-9", "Ivan")]);
    prisma.treatment.aggregate.mockResolvedValue({ _sum: { collectedAmount: "5000" } });
    prisma.attendance.findUnique.mockResolvedValue(null);  // no record

    const result = await runStaffCommission("clinic-a", "2026-05", prisma as any);
    const r = result.results[0];

    // 5000 PROGRESSIVE → 5000×5% = 250; attendedDays=26 → proRated=250
    expect(r.grossCommission).toBe(250);
    expect(r.proRatedCommission).toBe(250);
    expect(r.forfeited).toBe(false);
  });

  // ── Empty staff list ──────────────────────────────────────────────────────

  it("returns empty results when no active staff at clinic", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(makeConfig());
    prisma.staffProfile.findMany.mockResolvedValue([]);

    const result = await runStaffCommission("clinic-a", "2026-05", prisma as any);

    expect(result.results).toHaveLength(0);
    expect(result.poolDivided).toBe(false);
    // treatment.aggregate should not have been called
    expect(prisma.treatment.aggregate).not.toHaveBeenCalled();
  });

  // ── No config → throws ────────────────────────────────────────────────────

  it("throws when no CommissionConfig exists for the clinic", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(null);

    await expect(
      runStaffCommission("clinic-missing", "2026-05", prisma as any)
    ).rejects.toThrow(/no commissionconfig/i);
  });

  // ── Upsert payload correctness ─────────────────────────────────────────────

  it("passes correct fields to staffCommission.upsert", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(makeConfig());
    prisma.staffProfile.findMany.mockResolvedValue([makeStaff("sp-10", "Jane")]);
    prisma.treatment.aggregate.mockResolvedValue({ _sum: { collectedAmount: "15000" } });
    prisma.attendance.findUnique.mockResolvedValue(makeAttendance({ mcDays: 1 }));

    await runStaffCommission("clinic-a", "2026-05", prisma as any);

    const upsertCall = prisma.staffCommission.upsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({ staffProfileId_month: { staffProfileId: "sp-10", month: "2026-05" } });
    expect(upsertCall.create.status).toBe("DRAFT");
    expect(upsertCall.update.status).toBe("DRAFT");
    // attendedDays = 26-1 = 25 → proRated = 960 × 25/26 = 923.08
    expect(upsertCall.create.proRatedComm).toBe(923.08);
  });

  // ── FLAT tier type ─────────────────────────────────────────────────────────

  it("applies FLAT tier correctly: highest tier rate on full sales amount", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(makeConfig({ tierType: "FLAT" }));
    prisma.staffProfile.findMany.mockResolvedValue([makeStaff("sp-11", "Karl")]);
    // 15 000 → reaches tier 2 (>8000) → 15000 × 8% = 1200
    prisma.treatment.aggregate.mockResolvedValue({ _sum: { collectedAmount: "15000" } });
    prisma.attendance.findUnique.mockResolvedValue(makeAttendance());

    const result = await runStaffCommission("clinic-a", "2026-05", prisma as any);
    expect(result.results[0].grossCommission).toBe(1200);
  });

  // ── Zero sales ─────────────────────────────────────────────────────────────

  it("produces zero commission when there are no collected sales", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(makeConfig());
    prisma.staffProfile.findMany.mockResolvedValue([makeStaff("sp-12", "Lily")]);
    prisma.treatment.aggregate.mockResolvedValue({ _sum: { collectedAmount: null } });
    prisma.attendance.findUnique.mockResolvedValue(makeAttendance());

    const result = await runStaffCommission("clinic-a", "2026-05", prisma as any);
    const r = result.results[0];
    expect(r.grossCommission).toBe(0);
    expect(r.proRatedCommission).toBe(0);
  });

  // ── Return shape ───────────────────────────────────────────────────────────

  it("result object contains clinicId, month, method, results", async () => {
    prisma.commissionConfig.findFirst.mockResolvedValue(makeConfig());
    prisma.staffProfile.findMany.mockResolvedValue([makeStaff("sp-13", "Mike")]);
    prisma.treatment.aggregate.mockResolvedValue({ _sum: { collectedAmount: "5000" } });
    prisma.attendance.findUnique.mockResolvedValue(makeAttendance());

    const result = await runStaffCommission("clinic-z", "2026-06", prisma as any);
    expect(result.clinicId).toBe("clinic-z");
    expect(result.month).toBe("2026-06");
    expect(result.method).toBe(CommissionMethod.INDIVIDUAL);
    expect(result.results[0].staffName).toBe("Mike");
    expect(result.results[0].commissionId).toBe("sc-001");
  });
});
