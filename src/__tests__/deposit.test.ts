/**
 * Tests for src/lib/deposit.ts
 *
 * getDepositBalance is tested with a mocked prisma (module-level mock).
 * postDepositToLedger is tested to verify the correct ledger columns are
 * incremented for each deposit type and payment method.
 */

import { getDepositBalance, postDepositToLedger } from "../lib/deposit";

// ── Prisma mock ───────────────────────────────────────────────────────────────
// jest.mock is hoisted above variable declarations, so mock fns must be defined
// inside the factory. We then access them via the mocked prisma import.

jest.mock("../lib/prisma", () => ({
  prisma: {
    patientDeposit: {
      findMany: jest.fn(),
      count:    jest.fn(),
    },
    dailyLedger: {
      upsert: jest.fn(),
    },
    salesReturn: { count: jest.fn() },
  },
}));

import { prisma } from "../lib/prisma";

const mockPatientDeposit = (prisma as any).patientDeposit as { findMany: jest.Mock; count: jest.Mock };
const mockDailyLedger    = (prisma as any).dailyLedger    as { upsert: jest.Mock };

beforeEach(() => jest.clearAllMocks());

// ── getDepositBalance ─────────────────────────────────────────────────────────

describe("getDepositBalance", () => {
  test("no transactions → balance is 0", async () => {
    mockPatientDeposit.findMany.mockResolvedValueOnce([]);
    expect(await getDepositBalance("patient-1")).toBe(0);
  });

  test("TOPUP only → positive balance", async () => {
    mockPatientDeposit.findMany.mockResolvedValueOnce([
      { type: "TOPUP",  amount: 500 },
      { type: "TOPUP",  amount: 300 },
    ]);
    expect(await getDepositBalance("patient-1")).toBe(800);
  });

  test("TOPUP then UTILIZATION → reduces balance", async () => {
    mockPatientDeposit.findMany.mockResolvedValueOnce([
      { type: "TOPUP",       amount: 1000 },
      { type: "UTILIZATION", amount: 250 },
    ]);
    expect(await getDepositBalance("patient-1")).toBe(750);
  });

  test("TOPUP then REFUND → reduces balance", async () => {
    mockPatientDeposit.findMany.mockResolvedValueOnce([
      { type: "TOPUP",  amount: 600 },
      { type: "REFUND", amount: 600 },
    ]);
    expect(await getDepositBalance("patient-1")).toBe(0);
  });

  test("mixed TOPUP / UTILIZATION / REFUND sums correctly", async () => {
    mockPatientDeposit.findMany.mockResolvedValueOnce([
      { type: "TOPUP",       amount: 1000 },
      { type: "UTILIZATION", amount: 300 },
      { type: "TOPUP",       amount: 200 },
      { type: "REFUND",      amount: 100 },
    ]);
    // 1000 - 300 + 200 - 100 = 800
    expect(await getDepositBalance("patient-1")).toBe(800);
  });

  test("decimal amounts are handled without precision loss", async () => {
    mockPatientDeposit.findMany.mockResolvedValueOnce([
      { type: "TOPUP",       amount: "100.50" },
      { type: "UTILIZATION", amount: "30.25" },
    ]);
    expect(await getDepositBalance("patient-1")).toBeCloseTo(70.25, 2);
  });
});

// ── postDepositToLedger ───────────────────────────────────────────────────────

describe("postDepositToLedger — TOPUP", () => {
  const BASE = {
    clinicId: "clinic-a",
    date:     new Date("2026-06-05"),
    type:     "TOPUP" as const,
    amount:   500,
    updatedById: "user-1",
  };

  test("TOPUP via CASH_CURRENT increments cashCurrent and depositTopup", async () => {
    mockDailyLedger.upsert.mockResolvedValueOnce({});
    await postDepositToLedger({ ...BASE, paymentMethod: "CASH_CURRENT" });

    const call = mockDailyLedger.upsert.mock.calls[0][0];
    expect(call.update).toMatchObject({
      cashCurrent:  { increment: 500 },
      depositTopup: { increment: 500 },
    });
    expect(call.update.depositRefund).toBeUndefined();
  });

  test("TOPUP via FPX increments fpx and depositTopup", async () => {
    mockDailyLedger.upsert.mockResolvedValueOnce({});
    await postDepositToLedger({ ...BASE, paymentMethod: "FPX" });

    const call = mockDailyLedger.upsert.mock.calls[0][0];
    expect(call.update).toMatchObject({
      fpx:          { increment: 500 },
      depositTopup: { increment: 500 },
    });
  });

  test("TOPUP via EWALLET increments ewallet and depositTopup", async () => {
    mockDailyLedger.upsert.mockResolvedValueOnce({});
    await postDepositToLedger({ ...BASE, paymentMethod: "EWALLET" });

    const call = mockDailyLedger.upsert.mock.calls[0][0];
    expect(call.update).toMatchObject({
      ewallet:      { increment: 500 },
      depositTopup: { increment: 500 },
    });
  });

  test("TOPUP via PANEL (no ledger column) only increments depositTopup", async () => {
    mockDailyLedger.upsert.mockResolvedValueOnce({});
    await postDepositToLedger({ ...BASE, paymentMethod: "PANEL" });

    const call = mockDailyLedger.upsert.mock.calls[0][0];
    expect(call.update.depositTopup).toEqual({ increment: 500 });
    // No payment-method column incremented for PANEL
    expect(call.update.cashCurrent).toBeUndefined();
    expect(call.update.fpx).toBeUndefined();
  });

  test("create payload sets correct initial values for CASH_CURRENT TOPUP", async () => {
    mockDailyLedger.upsert.mockResolvedValueOnce({});
    await postDepositToLedger({ ...BASE, paymentMethod: "CASH_CURRENT" });

    const call = mockDailyLedger.upsert.mock.calls[0][0];
    expect(call.create).toMatchObject({
      clinicId:     "clinic-a",
      cashCurrent:  500,
      depositTopup: 500,
      depositRefund: 0,
      salesReturn:  0,
    });
  });
});

describe("postDepositToLedger — REFUND", () => {
  const BASE = {
    clinicId: "clinic-a",
    date:     new Date("2026-06-05"),
    type:     "REFUND" as const,
    amount:   300,
    updatedById: "user-1",
  };

  test("regular REFUND only increments depositRefund", async () => {
    mockDailyLedger.upsert.mockResolvedValueOnce({});
    await postDepositToLedger({ ...BASE, isTreatmentFailure: false });

    const call = mockDailyLedger.upsert.mock.calls[0][0];
    expect(call.update).toMatchObject({ depositRefund: { increment: 300 } });
    expect(call.update.salesReturn).toBeUndefined();
  });

  test("treatment-failure REFUND increments depositRefund AND salesReturn", async () => {
    mockDailyLedger.upsert.mockResolvedValueOnce({});
    await postDepositToLedger({ ...BASE, isTreatmentFailure: true });

    const call = mockDailyLedger.upsert.mock.calls[0][0];
    expect(call.update).toMatchObject({
      depositRefund: { increment: 300 },
      salesReturn:   { increment: 300 },
    });
  });

  test("REFUND does not increment any payment-method column", async () => {
    mockDailyLedger.upsert.mockResolvedValueOnce({});
    await postDepositToLedger({ ...BASE });

    const call = mockDailyLedger.upsert.mock.calls[0][0];
    expect(call.update.cashCurrent).toBeUndefined();
    expect(call.update.creditCard).toBeUndefined();
    expect(call.update.fpx).toBeUndefined();
    expect(call.update.depositTopup).toBeUndefined();
  });

  test("upsert is keyed on clinicId + UTC-normalised date", async () => {
    mockDailyLedger.upsert.mockResolvedValueOnce({});
    await postDepositToLedger({ ...BASE });

    const call = mockDailyLedger.upsert.mock.calls[0][0];
    const expectedDate = new Date(Date.UTC(2026, 5, 5));
    expect(call.where).toEqual({ clinicId_date: { clinicId: "clinic-a", date: expectedDate } });
  });
});
