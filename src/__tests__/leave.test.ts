/**
 * Tests for src/lib/leave.ts
 *
 * Pure functions (calculateLeaveDays, calculateEntitlement) are tested directly.
 * DB-dependent functions use a jest.mock of the prisma module.
 */

import {
  calculateLeaveDays,
  calculateEntitlement,
  deductLeaveBalance,
  restoreLeaveBalance,
  processYearEndCarryOver,
} from "../lib/leave";

// ── Prisma mock ───────────────────────────────────────────────────────────────
// jest.mock is hoisted above variable declarations, so mock fns must be defined
// inside the factory. We then access them via the mocked prisma import.

jest.mock("../lib/prisma", () => ({
  prisma: {
    leaveBalance: {
      findUnique: jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
    },
    staffProfile: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma";

const mockLeaveBalance  = prisma.leaveBalance  as jest.Mocked<typeof prisma.leaveBalance>;
const mockStaffProfile  = prisma.staffProfile  as jest.Mocked<typeof prisma.staffProfile>;

beforeEach(() => jest.clearAllMocks());

// ── calculateLeaveDays ────────────────────────────────────────────────────────

describe("calculateLeaveDays", () => {
  test("single Monday returns 1 day", async () => {
    // 2026-06-01 is a Monday
    const days = await calculateLeaveDays(
      new Date("2026-06-01"),
      new Date("2026-06-01"),
      "clinic-a"
    );
    expect(days).toBe(1);
  });

  test("Mon–Fri span = 5 days", async () => {
    const days = await calculateLeaveDays(
      new Date("2026-06-01"),
      new Date("2026-06-05"),
      "clinic-a"
    );
    expect(days).toBe(5);
  });

  test("full week Mon–Sun = 6 days (Sunday excluded)", async () => {
    const days = await calculateLeaveDays(
      new Date("2026-06-01"),
      new Date("2026-06-07"),
      "clinic-a"
    );
    expect(days).toBe(6);
  });

  test("Labour Day (01 May) is excluded as public holiday", async () => {
    // 2026-05-01 is a Friday (Labour Day)
    const days = await calculateLeaveDays(
      new Date("2026-04-30"),
      new Date("2026-05-02"),
      "clinic-a"
    );
    // Thu 30 Apr + Fri 1 May (holiday) + Sat 2 May → Thu=1, Fri=holiday, Sat=working
    // Actually 2026-05-02 is a Saturday, which is NOT Sunday, so it counts
    // Thu(1) + Fri(holiday=0) + Sat(1) = 2
    expect(days).toBe(2);
  });

  test("Merdeka Day (31 Aug) is excluded as public holiday", async () => {
    // 2026-08-31 is a Monday (Merdeka Day)
    const days = await calculateLeaveDays(
      new Date("2026-08-31"),
      new Date("2026-08-31"),
      "clinic-a"
    );
    expect(days).toBe(0);
  });

  test("end before start returns 0", async () => {
    const days = await calculateLeaveDays(
      new Date("2026-06-05"),
      new Date("2026-06-01"),
      "clinic-a"
    );
    expect(days).toBe(0);
  });

  test("same start and end on a Sunday returns 0", async () => {
    // 2026-06-07 is a Sunday
    const days = await calculateLeaveDays(
      new Date("2026-06-07"),
      new Date("2026-06-07"),
      "clinic-a"
    );
    expect(days).toBe(0);
  });
});

// ── calculateEntitlement ──────────────────────────────────────────────────────

describe("calculateEntitlement — ANNUAL", () => {
  const dec31 = (y: number) => new Date(y, 11, 31);

  test("< 2 years service → 8 days", () => {
    expect(calculateEntitlement("ANNUAL", new Date("2025-01-01"), dec31(2026))).toBe(8);
  });

  test("exactly 2 years → 12 days", () => {
    expect(calculateEntitlement("ANNUAL", new Date("2024-12-31"), dec31(2026))).toBe(12);
  });

  test("5 years → 12 days (boundary)", () => {
    expect(calculateEntitlement("ANNUAL", new Date("2021-12-31"), dec31(2026))).toBe(12);
  });

  test("6 years → 16 days", () => {
    expect(calculateEntitlement("ANNUAL", new Date("2020-12-31"), dec31(2026))).toBe(16);
  });
});

describe("calculateEntitlement — MEDICAL", () => {
  const dec31 = (y: number) => new Date(y, 11, 31);

  test("< 2 years → 14 days", () => {
    expect(calculateEntitlement("MEDICAL", new Date("2025-06-01"), dec31(2026))).toBe(14);
  });

  test("2–5 years → 18 days", () => {
    expect(calculateEntitlement("MEDICAL", new Date("2023-01-01"), dec31(2026))).toBe(18);
  });

  test("> 5 years → 22 days", () => {
    expect(calculateEntitlement("MEDICAL", new Date("2019-01-01"), dec31(2026))).toBe(22);
  });
});

describe("calculateEntitlement — statutory fixed amounts", () => {
  const ref = new Date("2026-06-01");
  const join = new Date("2020-01-01");

  test("MATERNITY = 98 days (2023 amendment)", () => {
    expect(calculateEntitlement("MATERNITY", join, ref)).toBe(98);
  });

  test("PATERNITY = 7 days", () => {
    expect(calculateEntitlement("PATERNITY", join, ref)).toBe(7);
  });

  test("HOSPITALISATION = 60 days", () => {
    expect(calculateEntitlement("HOSPITALISATION", join, ref)).toBe(60);
  });

  test("COMPASSIONATE = 3 days", () => {
    expect(calculateEntitlement("COMPASSIONATE", join, ref)).toBe(3);
  });

  test("UNPAID = 0 (no statutory entitlement)", () => {
    expect(calculateEntitlement("UNPAID", join, ref)).toBe(0);
  });

  test("REPLACEMENT = 0 (earned, not entitled by default)", () => {
    expect(calculateEntitlement("REPLACEMENT", join, ref)).toBe(0);
  });
});

// ── deductLeaveBalance ────────────────────────────────────────────────────────

describe("deductLeaveBalance", () => {
  const EXISTING_BALANCE = {
    id: "bal-1",
    staffProfileId: "staff-1",
    year: 2026,
    leaveType: "ANNUAL" as const,
    entitled: 12,
    taken: 2,
    pending: 3,
    carriedOver: 0,
    forfeited: 0,
    balance: 7,
  };

  test("moves days from pending to taken and recomputes balance", async () => {
    mockLeaveBalance.findUnique.mockResolvedValueOnce(EXISTING_BALANCE);
    mockLeaveBalance.update.mockResolvedValueOnce({});

    await deductLeaveBalance("staff-1", "ANNUAL", 3, 2026);

    expect(mockLeaveBalance.update).toHaveBeenCalledWith({
      where: { id: "bal-1" },
      data: {
        taken:   5,   // 2 + 3
        pending: 0,   // 3 - 3
        balance: 7,   // 12 + 0 - 5 - 0 = 7
      },
    });
  });

  test("pending never goes below zero when deducting more than pending", async () => {
    mockLeaveBalance.findUnique.mockResolvedValueOnce({ ...EXISTING_BALANCE, pending: 1 });
    mockLeaveBalance.update.mockResolvedValueOnce({});

    await deductLeaveBalance("staff-1", "ANNUAL", 3, 2026);

    const call = mockLeaveBalance.update.mock.calls[0][0];
    expect(call.data.pending).toBe(0);
  });

  test("creates balance record when none exists", async () => {
    mockLeaveBalance.findUnique.mockResolvedValueOnce(null); // getLeaveBalance → no existing
    mockStaffProfile.findUnique.mockResolvedValueOnce({ joinDate: new Date("2020-01-01") });
    const createdBalance = { ...EXISTING_BALANCE, taken: 0, pending: 0 };
    mockLeaveBalance.create.mockResolvedValueOnce(createdBalance);
    mockLeaveBalance.update.mockResolvedValueOnce({});

    await deductLeaveBalance("staff-1", "ANNUAL", 2, 2026);

    expect(mockLeaveBalance.create).toHaveBeenCalled();
    expect(mockLeaveBalance.update).toHaveBeenCalled();
  });
});

// ── restoreLeaveBalance ───────────────────────────────────────────────────────

describe("restoreLeaveBalance", () => {
  const BALANCE = {
    id: "bal-2",
    staffProfileId: "staff-2",
    year: 2026,
    leaveType: "MEDICAL" as const,
    entitled: 18,
    taken: 4,
    pending: 2,
    carriedOver: 0,
    forfeited: 0,
    balance: 12,
  };

  test("fromTaken=false restores from pending", async () => {
    mockLeaveBalance.findUnique.mockResolvedValueOnce(BALANCE);
    mockLeaveBalance.update.mockResolvedValueOnce({});

    await restoreLeaveBalance("staff-2", "MEDICAL", 2, 2026, false);

    expect(mockLeaveBalance.update).toHaveBeenCalledWith({
      where: { id: "bal-2" },
      data: {
        taken:   4,   // unchanged
        pending: 0,   // 2 - 2
        balance: 14,  // 18 + 0 - 4 - 0
      },
    });
  });

  test("fromTaken=true restores from taken (approved leave reversal)", async () => {
    mockLeaveBalance.findUnique.mockResolvedValueOnce(BALANCE);
    mockLeaveBalance.update.mockResolvedValueOnce({});

    await restoreLeaveBalance("staff-2", "MEDICAL", 3, 2026, true);

    expect(mockLeaveBalance.update).toHaveBeenCalledWith({
      where: { id: "bal-2" },
      data: {
        taken:   1,   // 4 - 3
        pending: 2,   // unchanged
        balance: 15,  // 18 + 0 - 1 - 2
      },
    });
  });

  test("taken and pending never go below zero on restore", async () => {
    mockLeaveBalance.findUnique.mockResolvedValueOnce({ ...BALANCE, taken: 1, pending: 0 });
    mockLeaveBalance.update.mockResolvedValueOnce({});

    await restoreLeaveBalance("staff-2", "MEDICAL", 10, 2026, true);

    const call = mockLeaveBalance.update.mock.calls[0][0];
    expect(call.data.taken).toBe(0);
  });
});

// ── processYearEndCarryOver ───────────────────────────────────────────────────

describe("processYearEndCarryOver", () => {
  function makeBalance(overrides: Partial<{
    entitled: number; taken: number; pending: number; carriedOver: number;
  }>) {
    return {
      id: "bal-3",
      staffProfileId: "staff-3",
      year: 2025,
      leaveType: "ANNUAL" as const,
      entitled: overrides.entitled ?? 12,
      taken:    overrides.taken    ?? 0,
      pending:  overrides.pending  ?? 0,
      carriedOver: overrides.carriedOver ?? 0,
      forfeited: 0,
      balance: 12,
    };
  }

  test("carries over up to maxCarryOver and forfeits the rest", async () => {
    // 12 entitled, 2 taken → 10 remaining. maxCarryOver=8 → carry=8, forfeit=2
    mockLeaveBalance.findUnique
      .mockResolvedValueOnce(makeBalance({ entitled: 12, taken: 2 })) // prev year lookup
      .mockResolvedValueOnce(null);                                    // next year lookup → create
    mockStaffProfile.findUnique.mockResolvedValueOnce({ joinDate: new Date("2020-01-01") });
    const nextYearBalance = makeBalance({ entitled: 16 });
    mockLeaveBalance.create.mockResolvedValueOnce(nextYearBalance);
    mockLeaveBalance.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    await processYearEndCarryOver("staff-3", 2025, 8);

    const prevUpdate = mockLeaveBalance.update.mock.calls[0][0];
    expect(prevUpdate.data.forfeited).toBe(2);
    expect(prevUpdate.data.balance).toBe(0);

    const nextUpdate = mockLeaveBalance.update.mock.calls[1][0];
    expect(nextUpdate.data.carriedOver).toBe(8);
  });

  test("remaining days within cap → all carried, none forfeited", async () => {
    // 12 entitled, 8 taken → 4 remaining. maxCarryOver=8 → carry=4, forfeit=0
    mockLeaveBalance.findUnique
      .mockResolvedValueOnce(makeBalance({ entitled: 12, taken: 8 }))
      .mockResolvedValueOnce(null);
    mockStaffProfile.findUnique.mockResolvedValueOnce({ joinDate: new Date("2020-01-01") });
    mockLeaveBalance.create.mockResolvedValueOnce(makeBalance({ entitled: 12 }));
    mockLeaveBalance.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    await processYearEndCarryOver("staff-3", 2025, 8);

    const prevUpdate = mockLeaveBalance.update.mock.calls[0][0];
    expect(prevUpdate.data.forfeited).toBe(0);
    expect(prevUpdate.data.balance).toBe(0);

    const nextUpdate = mockLeaveBalance.update.mock.calls[1][0];
    expect(nextUpdate.data.carriedOver).toBe(4);
  });

  test("no previous year record → no-op", async () => {
    mockLeaveBalance.findUnique.mockResolvedValueOnce(null);

    await processYearEndCarryOver("staff-3", 2025);

    expect(mockLeaveBalance.update).not.toHaveBeenCalled();
  });

  test("zero remaining → carry=0 and forfeit=0", async () => {
    // Fully exhausted leave
    mockLeaveBalance.findUnique
      .mockResolvedValueOnce(makeBalance({ entitled: 12, taken: 12 }))
      .mockResolvedValueOnce(null);
    mockStaffProfile.findUnique.mockResolvedValueOnce({ joinDate: new Date("2020-01-01") });
    mockLeaveBalance.create.mockResolvedValueOnce(makeBalance({ entitled: 12 }));
    mockLeaveBalance.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    await processYearEndCarryOver("staff-3", 2025, 8);

    const prevUpdate = mockLeaveBalance.update.mock.calls[0][0];
    expect(prevUpdate.data.forfeited).toBe(0);

    const nextUpdate = mockLeaveBalance.update.mock.calls[1][0];
    expect(nextUpdate.data.carriedOver).toBe(0);
  });
});
