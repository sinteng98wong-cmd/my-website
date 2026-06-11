/**
 * Tests for buildPaySlip() in src/lib/payroll.ts
 *
 * buildPaySlip reads from five Prisma models and delegates statutory
 * calculations to the pure functions already unit-tested in payroll.test.ts.
 * Here we verify the aggregation and wiring: that the right DB data is fetched,
 * combined correctly, and that gross/net totals are computed accurately.
 */

import { buildPaySlip } from "../lib/payroll";

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock("../lib/prisma", () => ({
  prisma: {
    staffProfile:     { findUnique: jest.fn() },
    attendanceRecord: { findMany:   jest.fn() },
    leaveApplication: { findMany:   jest.fn() },
    staffCommission:  { aggregate:  jest.fn() },
    staffClaim:       { findMany:   jest.fn() },
  },
}));

import { prisma } from "../lib/prisma";

const mockStaffProfile     = (prisma as any).staffProfile     as { findUnique: jest.Mock };
const mockAttendanceRecord = (prisma as any).attendanceRecord as { findMany:   jest.Mock };
const mockLeaveApplication = (prisma as any).leaveApplication as { findMany:   jest.Mock };
const mockStaffCommission  = (prisma as any).staffCommission  as { aggregate:  jest.Mock };
const mockStaffClaim       = (prisma as any).staffClaim       as { findMany:   jest.Mock };

// resetAllMocks clears both call tracking AND the mockResolvedValueOnce queue,
// preventing stale mock values from leaking between tests in this file.
beforeEach(() => jest.resetAllMocks());

// ── Fixture helpers ───────────────────────────────────────────────────────────

function setupDefaults(overrides: {
  basicSalary?: number;
  icNo?: string | null;
  attendance?: any[];
  leaves?: any[];
  commSum?: number;
  claims?: any[];
} = {}) {
  mockStaffProfile.findUnique.mockResolvedValueOnce({
    basicSalary: overrides.basicSalary ?? 3000,
    icNo: overrides.icNo ?? "850101075555", // age 41
  });
  mockAttendanceRecord.findMany.mockResolvedValueOnce(overrides.attendance ?? []);
  mockLeaveApplication.findMany.mockResolvedValueOnce(overrides.leaves ?? []);
  mockStaffCommission.aggregate.mockResolvedValueOnce({
    _sum: { proRatedComm: overrides.commSum ?? 0 },
  });
  mockStaffClaim.findMany.mockResolvedValueOnce(overrides.claims ?? []);
}

// ── Baseline: no attendance, no leave, no commission, no claims ───────────────

describe("buildPaySlip — baseline (no extras)", () => {
  test("returns staffProfileId as provided", async () => {
    setupDefaults();
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.staffProfileId).toBe("staff-1");
  });

  test("basicSalary taken from profile", async () => {
    setupDefaults({ basicSalary: 5000 });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.basicSalary).toBe(5000);
  });

  test("all attendance counters are zero when no records", async () => {
    setupDefaults();
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.daysWorked).toBe(0);
    expect(slip.daysAbsent).toBe(0);
    expect(slip.daysPublicHoliday).toBe(0);
    expect(slip.overtimeMinutes).toBe(0);
  });

  test("gross salary equals basicSalary when no extras", async () => {
    setupDefaults({ basicSalary: 3000 });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.grossSalary).toBe(3000);
  });

  test("net salary is gross minus all employee deductions", async () => {
    setupDefaults({ basicSalary: 3000 });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    // EPF: 3000 × 11% = 330; SOCSO: 3000 × 0.5% = 15; EIS: 3000 × 0.2% = 6; PCB: 30
    const expectedNet = 3000 - slip.epfEmployee - slip.socsoEmployee - slip.eisEmployee - slip.incomeTax - slip.unpaidLeaveDeduction;
    expect(slip.netSalary).toBeCloseTo(expectedNet, 2);
  });
});

// ── Attendance aggregation ────────────────────────────────────────────────────

describe("buildPaySlip — attendance aggregation", () => {
  test("PRESENT, LATE, REMOTE each count as a worked day", async () => {
    setupDefaults({
      attendance: [
        { status: "PRESENT",       overtimeMinutes: 0 },
        { status: "LATE",          overtimeMinutes: 0 },
        { status: "REMOTE",        overtimeMinutes: 0 },
      ],
    });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.daysWorked).toBe(3);
    expect(slip.daysAbsent).toBe(0);
  });

  test("ABSENT increments daysAbsent, not daysWorked", async () => {
    setupDefaults({
      attendance: [
        { status: "ABSENT",        overtimeMinutes: 0 },
        { status: "ABSENT",        overtimeMinutes: 0 },
      ],
    });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.daysAbsent).toBe(2);
    expect(slip.daysWorked).toBe(0);
  });

  test("PUBLIC_HOLIDAY increments daysPublicHoliday", async () => {
    setupDefaults({
      attendance: [
        { status: "PUBLIC_HOLIDAY", overtimeMinutes: 0 },
        { status: "PUBLIC_HOLIDAY", overtimeMinutes: 0 },
      ],
    });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.daysPublicHoliday).toBe(2);
  });

  test("overtimeMinutes sums across all records", async () => {
    setupDefaults({
      attendance: [
        { status: "PRESENT", overtimeMinutes: 60  },
        { status: "PRESENT", overtimeMinutes: 90  },
        { status: "PRESENT", overtimeMinutes: null }, // null handled safely
      ],
    });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.overtimeMinutes).toBe(150);
  });

  test("overtime pay is included in grossSalary", async () => {
    setupDefaults({
      basicSalary: 3000,
      attendance: [{ status: "PRESENT", overtimeMinutes: 60 }],
    });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    // OT: 3000/26/8 × 1h × 1.5 = 21.63
    expect(slip.overtime).toBe(21.63);
    expect(slip.grossSalary).toBeCloseTo(3000 + 21.63, 2);
  });
});

// ── Leave handling ────────────────────────────────────────────────────────────

describe("buildPaySlip — leave handling", () => {
  test("approved ANNUAL leave adds to daysLeave", async () => {
    setupDefaults({
      leaves: [{ leaveType: "ANNUAL", totalDays: 2, status: "APPROVED" }],
    });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.daysLeave).toBe(2);
    expect(slip.unpaidLeaveDeduction).toBe(0);
  });

  test("UNPAID leave adds both to daysLeave and unpaidLeaveDeduction", async () => {
    setupDefaults({
      basicSalary: 3000,
      leaves: [{ leaveType: "UNPAID", totalDays: 2, status: "APPROVED" }],
    });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.daysLeave).toBe(2);
    // (3000 / 26) × 2 = 230.77
    expect(slip.unpaidLeaveDeduction).toBe(230.77);
  });

  test("multiple leave records are summed", async () => {
    setupDefaults({
      leaves: [
        { leaveType: "ANNUAL", totalDays: 1, status: "APPROVED" },
        { leaveType: "ANNUAL", totalDays: 2, status: "APPROVED" },
        { leaveType: "MEDICAL", totalDays: 1, status: "APPROVED" },
      ],
    });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.daysLeave).toBe(4);
  });
});

// ── Commission ────────────────────────────────────────────────────────────────

describe("buildPaySlip — commission", () => {
  test("commission from aggregate is included in grossSalary", async () => {
    setupDefaults({ basicSalary: 3000, commSum: 960 });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.commission).toBe(960);
    expect(slip.grossSalary).toBeCloseTo(3000 + 960, 2);
  });

  test("null aggregate sum is treated as 0", async () => {
    mockStaffProfile.findUnique.mockResolvedValueOnce({ basicSalary: 3000, icNo: "850101075555" });
    mockAttendanceRecord.findMany.mockResolvedValueOnce([]);
    mockLeaveApplication.findMany.mockResolvedValueOnce([]);
    mockStaffCommission.aggregate.mockResolvedValueOnce({ _sum: { proRatedComm: null } });
    mockStaffClaim.findMany.mockResolvedValueOnce([]);
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.commission).toBe(0);
  });
});

// ── Claims split: allowances vs reimbursements ───────────────────────────────

describe("buildPaySlip — claims split", () => {
  test("MEAL, TRANSPORT, TELEPHONE are classified as allowances", async () => {
    setupDefaults({
      basicSalary: 3000,
      claims: [
        { claimType: "MEAL",      amount: 100 },
        { claimType: "TRANSPORT", amount:  50 },
        { claimType: "TELEPHONE", amount:  30 },
      ],
    });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.allowances).toBe(180);
    expect(slip.claims).toBe(0);
  });

  test("non-allowance claim types (e.g. MEDICAL) are reimbursements", async () => {
    setupDefaults({
      claims: [
        { claimType: "MEDICAL", amount: 200 },
        { claimType: "OTHER",   amount:  50 },
      ],
    });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.claims).toBe(250);
    expect(slip.allowances).toBe(0);
  });

  test("mixed claims split correctly", async () => {
    setupDefaults({
      claims: [
        { claimType: "MEAL",    amount: 100 },
        { claimType: "MEDICAL", amount: 200 },
      ],
    });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.allowances).toBe(100);
    expect(slip.claims).toBe(200);
  });

  test("allowances increase PCB chargeable income", async () => {
    setupDefaults({ basicSalary: 3000 });
    const slipNoAllowance = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");

    setupDefaults({ basicSalary: 3000, claims: [{ claimType: "MEAL", amount: 500 }] });
    const slipWithAllowance = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");

    // MEAL:500/month allowance raises annual chargeable income → higher PCB
    expect(slipWithAllowance.incomeTax).toBeGreaterThan(slipNoAllowance.incomeTax);
  });
});

// ── Gross and net totals ──────────────────────────────────────────────────────

describe("buildPaySlip — gross/net computation", () => {
  test("gross = basic + allowances + overtime + commission + claims", async () => {
    setupDefaults({
      basicSalary: 3000,
      attendance: [{ status: "PRESENT", overtimeMinutes: 60 }],
      commSum: 500,
      claims: [
        { claimType: "MEAL",    amount: 100 },
        { claimType: "MEDICAL", amount:  50 },
      ],
    });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    const expected = 3000 + 100 + slip.overtime + 500 + 50;
    expect(slip.grossSalary).toBeCloseTo(expected, 2);
  });

  test("net = gross − (epf + socso + eis + pcb + unpaid deduction)", async () => {
    setupDefaults({ basicSalary: 3000, commSum: 500 });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    const expectedNet =
      slip.grossSalary
      - slip.epfEmployee
      - slip.socsoEmployee
      - slip.eisEmployee
      - slip.incomeTax
      - slip.unpaidLeaveDeduction;
    expect(slip.netSalary).toBeCloseTo(expectedNet, 2);
  });

  test("age > 60 (from IC) results in reduced EPF rates", async () => {
    // IC 650101 → age 61
    setupDefaults({ basicSalary: 3000, icNo: "650101075555" });
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    // age > 60: 5.5% employee
    expect(slip.epfEmployee).toBe(165); // 3000 × 5.5%
    expect(slip.epfEmployer).toBe(195); // 3000 × 6.5%
  });

  test("missing profile defaults to basicSalary=0 and age=35", async () => {
    mockStaffProfile.findUnique.mockResolvedValueOnce(null);
    mockAttendanceRecord.findMany.mockResolvedValueOnce([]);
    mockLeaveApplication.findMany.mockResolvedValueOnce([]);
    mockStaffCommission.aggregate.mockResolvedValueOnce({ _sum: { proRatedComm: 0 } });
    mockStaffClaim.findMany.mockResolvedValueOnce([]);
    const slip = await buildPaySlip("staff-1", "clinic-1", "2026-05", "run-1");
    expect(slip.basicSalary).toBe(0);
    expect(slip.grossSalary).toBe(0);
    expect(slip.netSalary).toBe(0);
  });
});
