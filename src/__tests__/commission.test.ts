/**
 * Commission Engine Tests
 * Covers all rules from Commission Rules Document v1.4
 */

import {
  calculateDoctorCommission,
  applyLocumFloor,
  checkForfeit,
  calculateAttendedDays,
  calculateGrossCommission,
  calculateStaffCommission,
} from "../lib/commission";

// ── Doctor Commission ─────────────────────────────────────────────────────

describe("calculateDoctorCommission", () => {
  test("basic formula: (Tx - Lab) × Split × Rate", () => {
    expect(calculateDoctorCommission({
      collectedAmount: 1800,
      labFee: 350,
      doctorSplit: 100,
      doctorRate: 18,
    })).toBe(261.00); // (1800-350) × 1.0 × 0.18
  });

  test("with split between two doctors", () => {
    expect(calculateDoctorCommission({
      collectedAmount: 1200,
      labFee: 0,
      doctorSplit: 60,
      doctorRate: 18,
    })).toBe(129.60); // 1200 × 0.6 × 0.18
  });

  test("zero lab fee", () => {
    expect(calculateDoctorCommission({
      collectedAmount: 180,
      labFee: 0,
      doctorSplit: 100,
      doctorRate: 20,
    })).toBe(36.00);
  });
});

// ── Locum Floor ──────────────────────────────────────────────────────────

describe("applyLocumFloor", () => {
  test("commission below floor → pays floor, records top-up", () => {
    const result = applyLocumFloor({
      totalCommission: 4200,
      sessionsWorked: 10,
      ratePerSession: 500,
    });
    expect(result.payout).toBe(5000);
    expect(result.isTopUp).toBe(true);
    expect(result.topUpAmount).toBe(800);
  });

  test("commission above floor → pays commission", () => {
    const result = applyLocumFloor({
      totalCommission: 6100,
      sessionsWorked: 10,
      ratePerSession: 500,
    });
    expect(result.payout).toBe(6100);
    expect(result.isTopUp).toBe(false);
    expect(result.topUpAmount).toBe(0);
  });

  test("commission exactly equals floor", () => {
    const result = applyLocumFloor({
      totalCommission: 5000,
      sessionsWorked: 10,
      ratePerSession: 500,
    });
    expect(result.payout).toBe(5000);
    expect(result.isTopUp).toBe(false);
  });
});

// ── Forfeit ──────────────────────────────────────────────────────────────

describe("checkForfeit", () => {
  test("combined count exactly at threshold → NOT forfeited", () => {
    const result = checkForfeit(
      { totalWorkDays: 26, mcDays: 2, elDays: 1, unpaidDays: 0, timeSlipDays: 0, alDays: 0, lateCount: 2 },
      5
    );
    expect(result.forfeited).toBe(false); // 2+1+0+2 = 5, not > 5
  });

  test("combined count exceeds threshold → forfeited", () => {
    const result = checkForfeit(
      { totalWorkDays: 26, mcDays: 3, elDays: 2, unpaidDays: 0, timeSlipDays: 0, alDays: 0, lateCount: 1 },
      5
    );
    expect(result.forfeited).toBe(true); // 3+2+0+1 = 6 > 5
  });

  test("AL does NOT contribute to forfeit count", () => {
    const result = checkForfeit(
      { totalWorkDays: 26, mcDays: 0, elDays: 0, unpaidDays: 0, timeSlipDays: 0, alDays: 10, lateCount: 0 },
      5
    );
    expect(result.forfeited).toBe(false);
  });
});

// ── Attended Days ────────────────────────────────────────────────────────

describe("calculateAttendedDays", () => {
  test("MC + EL reduce days; AL does not", () => {
    const days = calculateAttendedDays({
      totalWorkDays: 26, mcDays: 2, elDays: 1,
      unpaidDays: 0, timeSlipDays: 0, alDays: 2, lateCount: 1,
    });
    expect(days).toBe(23); // 26 - 2 - 1 - 0 - 0 = 23
  });

  test("partial time slip deducts 0.5 day", () => {
    const days = calculateAttendedDays({
      totalWorkDays: 26, mcDays: 0, elDays: 0,
      unpaidDays: 0, timeSlipDays: 0.5, alDays: 0, lateCount: 0,
    });
    expect(days).toBe(25.5);
  });

  test("late count does NOT reduce attended days", () => {
    const days = calculateAttendedDays({
      totalWorkDays: 26, mcDays: 0, elDays: 0,
      unpaidDays: 0, timeSlipDays: 0, alDays: 0, lateCount: 5,
    });
    expect(days).toBe(26); // late doesn't reduce
  });
});

// ── Tier Calculation ─────────────────────────────────────────────────────

const SAMPLE_TIERS = [
  { tierOrder: 1, floorAmount: 0, ceilAmount: 8000, rate: 5 },
  { tierOrder: 2, floorAmount: 8000, ceilAmount: null, rate: 8 },
];

describe("calculateGrossCommission — PROGRESSIVE", () => {
  test("sales in tier 1 only", () => {
    expect(calculateGrossCommission(5000, SAMPLE_TIERS, "PROGRESSIVE")).toBe(250); // 5000 × 5%
  });

  test("sales spanning two tiers", () => {
    // 8000 × 5% = 400, 7000 × 8% = 560, total = 960
    expect(calculateGrossCommission(15000, SAMPLE_TIERS, "PROGRESSIVE")).toBe(960);
  });
});

describe("calculateGrossCommission — FLAT", () => {
  test("sales in tier 2 → full amount at tier 2 rate", () => {
    // 15000 × 8% = 1200
    expect(calculateGrossCommission(15000, SAMPLE_TIERS, "FLAT")).toBe(1200);
  });

  test("sales in tier 1 → tier 1 rate applies", () => {
    expect(calculateGrossCommission(5000, SAMPLE_TIERS, "FLAT")).toBe(250);
  });
});

// ── Full Staff Commission Flow ────────────────────────────────────────────

describe("calculateStaffCommission", () => {
  test("normal case — passes forfeit, pro-rated", () => {
    const result = calculateStaffCommission({
      totalCollectedTreatmentSales: 15000,
      attendance: {
        totalWorkDays: 26, mcDays: 2, elDays: 1,
        unpaidDays: 0, timeSlipDays: 0, alDays: 2, lateCount: 1,
      },
      tiers: SAMPLE_TIERS,
      tierType: "PROGRESSIVE",
      forfeitThreshold: 5,
    });
    expect(result.forfeited).toBe(false);
    expect(result.grossCommission).toBe(960);
    expect(result.attendedDays).toBe(23);
    expect(result.proRatedCommission).toBe(849.23);
  });

  test("forfeited — returns zero", () => {
    const result = calculateStaffCommission({
      totalCollectedTreatmentSales: 15000,
      attendance: {
        totalWorkDays: 26, mcDays: 3, elDays: 2,
        unpaidDays: 0, timeSlipDays: 0, alDays: 0, lateCount: 1,
      },
      tiers: SAMPLE_TIERS,
      tierType: "PROGRESSIVE",
      forfeitThreshold: 5,
    });
    expect(result.forfeited).toBe(true);
    expect(result.proRatedCommission).toBe(0);
  });

  test("full attendance — no pro-ration reduction", () => {
    const result = calculateStaffCommission({
      totalCollectedTreatmentSales: 15000,
      attendance: {
        totalWorkDays: 26, mcDays: 0, elDays: 0,
        unpaidDays: 0, timeSlipDays: 0, alDays: 0, lateCount: 0,
      },
      tiers: SAMPLE_TIERS,
      tierType: "PROGRESSIVE",
      forfeitThreshold: 5,
    });
    expect(result.forfeited).toBe(false);
    expect(result.proRatedCommission).toBe(result.grossCommission);
  });
});
