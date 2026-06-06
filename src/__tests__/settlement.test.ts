/**
 * Tests for src/lib/settlement.ts
 *
 * Pure functions tested directly; DB-dependent functions use a Prisma mock.
 */

import {
  DEFAULT_SETTLEMENT_DAYS,
  computeExpectedSettlementDate,
  getSettlementDays,
  getBankSettlementDays,
  resolveSettlementDays,
  resolveExpectedSettlementDate,
} from "../lib/settlement";

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock("../lib/prisma", () => ({
  prisma: {
    paymentMethodConfig: { findMany:  jest.fn() },
    settlementBank:      { findUnique: jest.fn() },
  },
}));

import { prisma } from "../lib/prisma";

const mockPaymentMethodConfig = (prisma as any).paymentMethodConfig as { findMany: jest.Mock };
const mockSettlementBank      = (prisma as any).settlementBank      as { findUnique: jest.Mock };

beforeEach(() => jest.clearAllMocks());

// ── DEFAULT_SETTLEMENT_DAYS ───────────────────────────────────────────────────

describe("DEFAULT_SETTLEMENT_DAYS", () => {
  test("CASH_CURRENT settles same day (0)", () => {
    expect(DEFAULT_SETTLEMENT_DAYS.CASH_CURRENT).toBe(0);
  });

  test("CREDIT_CARD settles in 2 days", () => {
    expect(DEFAULT_SETTLEMENT_DAYS.CREDIT_CARD).toBe(2);
  });

  test("FPX and EWALLET settle in 1 day", () => {
    expect(DEFAULT_SETTLEMENT_DAYS.FPX).toBe(1);
    expect(DEFAULT_SETTLEMENT_DAYS.EWALLET).toBe(1);
  });

  test("ATOME, PANEL, and CASH_NEXT all have 30-day settlement", () => {
    expect(DEFAULT_SETTLEMENT_DAYS.ATOME).toBe(30);
    expect(DEFAULT_SETTLEMENT_DAYS.PANEL).toBe(30);
    expect(DEFAULT_SETTLEMENT_DAYS.CASH_NEXT).toBe(30);
  });

  test("DEPOSIT settles same day (0)", () => {
    expect(DEFAULT_SETTLEMENT_DAYS.DEPOSIT).toBe(0);
  });
});

// ── computeExpectedSettlementDate ─────────────────────────────────────────────

describe("computeExpectedSettlementDate", () => {
  test("0 days returns the same date", () => {
    const base = new Date("2026-06-05");
    const result = computeExpectedSettlementDate(base, 0);
    expect(result.toISOString().slice(0, 10)).toBe("2026-06-05");
  });

  test("2 days adds correctly", () => {
    const result = computeExpectedSettlementDate(new Date("2026-06-05"), 2);
    expect(result.toISOString().slice(0, 10)).toBe("2026-06-07");
  });

  test("30 days crosses month boundary", () => {
    const result = computeExpectedSettlementDate(new Date("2026-06-05"), 30);
    expect(result.toISOString().slice(0, 10)).toBe("2026-07-05");
  });

  test("does not mutate the original date", () => {
    const base = new Date("2026-06-05");
    computeExpectedSettlementDate(base, 10);
    expect(base.toISOString().slice(0, 10)).toBe("2026-06-05");
  });
});

// ── getSettlementDays ─────────────────────────────────────────────────────────

describe("getSettlementDays", () => {
  test("returns DEFAULT when no DB config exists", async () => {
    mockPaymentMethodConfig.findMany.mockResolvedValueOnce([]);
    const days = await getSettlementDays("clinic-1", "CREDIT_CARD");
    expect(days).toBe(2); // DEFAULT_SETTLEMENT_DAYS.CREDIT_CARD
  });

  test("returns method-level config when no subType provided", async () => {
    mockPaymentMethodConfig.findMany.mockResolvedValueOnce([
      { subType: null, settlementDays: 3, isActive: true },
    ]);
    const days = await getSettlementDays("clinic-1", "CREDIT_CARD");
    expect(days).toBe(3);
  });

  test("prefers exact subType match over method-level config", async () => {
    mockPaymentMethodConfig.findMany.mockResolvedValueOnce([
      { subType: null,       settlementDays: 3, isActive: true },
      { subType: "VISA_MC",  settlementDays: 1, isActive: true },
      { subType: "AMEX",     settlementDays: 5, isActive: true },
    ]);
    const days = await getSettlementDays("clinic-1", "CREDIT_CARD", "VISA_MC");
    expect(days).toBe(1);
  });

  test("falls back to method-level when subType has no exact match", async () => {
    mockPaymentMethodConfig.findMany.mockResolvedValueOnce([
      { subType: null,      settlementDays: 3, isActive: true },
      { subType: "VISA_MC", settlementDays: 1, isActive: true },
    ]);
    const days = await getSettlementDays("clinic-1", "CREDIT_CARD", "AMEX");
    expect(days).toBe(3);
  });

  test("returns DEFAULT when no DB config and subType provided", async () => {
    mockPaymentMethodConfig.findMany.mockResolvedValueOnce([]);
    const days = await getSettlementDays("clinic-1", "FPX", "MAYBANK");
    expect(days).toBe(1); // DEFAULT for FPX
  });
});

// ── getBankSettlementDays ─────────────────────────────────────────────────────

describe("getBankSettlementDays", () => {
  test("returns null when bank not found", async () => {
    mockSettlementBank.findUnique.mockResolvedValueOnce(null);
    expect(await getBankSettlementDays("bank-1")).toBeNull();
  });

  test("returns null when bank is inactive", async () => {
    mockSettlementBank.findUnique.mockResolvedValueOnce({ isActive: false, settlementDays: 1 });
    expect(await getBankSettlementDays("bank-1")).toBeNull();
  });

  test("returns settlementDays when bank is active", async () => {
    mockSettlementBank.findUnique.mockResolvedValueOnce({ isActive: true, settlementDays: 3 });
    expect(await getBankSettlementDays("bank-1")).toBe(3);
  });
});

// ── resolveSettlementDays ─────────────────────────────────────────────────────

describe("resolveSettlementDays", () => {
  test("bank takes priority when active", async () => {
    mockSettlementBank.findUnique.mockResolvedValueOnce({ isActive: true, settlementDays: 1 });
    // paymentMethodConfig should not be queried at all
    const days = await resolveSettlementDays("clinic-1", "CREDIT_CARD", null, "bank-1");
    expect(days).toBe(1);
    expect(mockPaymentMethodConfig.findMany).not.toHaveBeenCalled();
  });

  test("falls back to method config when bank is inactive", async () => {
    mockSettlementBank.findUnique.mockResolvedValueOnce({ isActive: false, settlementDays: 1 });
    mockPaymentMethodConfig.findMany.mockResolvedValueOnce([
      { subType: null, settlementDays: 4, isActive: true },
    ]);
    const days = await resolveSettlementDays("clinic-1", "CREDIT_CARD", null, "bank-1");
    expect(days).toBe(4);
  });

  test("skips bank lookup entirely when no bankId provided", async () => {
    mockPaymentMethodConfig.findMany.mockResolvedValueOnce([]);
    await resolveSettlementDays("clinic-1", "FPX", null);
    expect(mockSettlementBank.findUnique).not.toHaveBeenCalled();
  });

  test("returns DEFAULT when no bank and no DB config", async () => {
    mockPaymentMethodConfig.findMany.mockResolvedValueOnce([]);
    const days = await resolveSettlementDays("clinic-1", "FPX", null);
    expect(days).toBe(1); // DEFAULT for FPX
  });
});

// ── resolveExpectedSettlementDate ─────────────────────────────────────────────

describe("resolveExpectedSettlementDate", () => {
  test("resolves date using getSettlementDays (no DB config → default)", async () => {
    mockPaymentMethodConfig.findMany.mockResolvedValueOnce([]);
    const base = new Date("2026-06-05");
    const result = await resolveExpectedSettlementDate("clinic-1", "CREDIT_CARD", null, base);
    // DEFAULT CREDIT_CARD = 2 days
    expect(result.toISOString().slice(0, 10)).toBe("2026-06-07");
  });

  test("uses configured settlement days when DB config exists", async () => {
    mockPaymentMethodConfig.findMany.mockResolvedValueOnce([
      { subType: null, settlementDays: 5, isActive: true },
    ]);
    const base = new Date("2026-06-05");
    const result = await resolveExpectedSettlementDate("clinic-1", "CREDIT_CARD", null, base);
    expect(result.toISOString().slice(0, 10)).toBe("2026-06-10");
  });
});
