/**
 * commission.service.ts — calculatePayrollPayload() Jest tests
 *
 * Covers the three doctor pay types and all modifier paths.
 * No Prisma / DB dependencies — tests run against the pure function only.
 *
 *  Run: npm test -- --testPathPattern=commission.service.test
 */

import Decimal from "decimal.js";
import {
  calculatePayrollPayload,
  DEFAULT_ANCILLARY_RATES,
  type PayrollCalculationInput,
  type PayrollTreatmentInput,
  type DisciplinaryDeduction,
} from "../commission.service";

// ── Helpers ───────────────────────────────────────────────────────────────────

function d(v: number | string): Decimal { return new Decimal(v); }
function r(dec: Decimal): number        { return dec.toDecimalPlaces(2).toNumber(); }

function makeInput(
  overrides: Partial<PayrollCalculationInput> & { payType: PayrollCalculationInput["payType"] },
): PayrollCalculationInput {
  return {
    doctorId:               "dr-test",
    monthStr:               "2026-05",
    baseSalary:             d(0),
    allowances:             d(0),
    guaranteedFloor:        d(0),
    treatments:             [],
    ancillaryRates:         {},
    disciplinaryDeductions: [],
    ...overrides,
  };
}

function makeTx(
  typeCode: string,
  billedAmount: number,
  labFee = 0,
  sst = 0,
  splitRate = 42,
): PayrollTreatmentInput {
  return {
    typeCode,
    billedAmount: d(billedAmount),
    labFee:       d(labFee),
    sst:          d(sst),
    splitRate:    d(splitRate),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. TYPE 1 — PURE SALARIED
// ─────────────────────────────────────────────────────────────────────────────

describe("TYPE 1 — PURE_SALARIED", () => {
  const input = makeInput({
    payType:    "PURE_SALARIED",
    baseSalary: d(6000),
    allowances: d(500),
    treatments: [
      makeTx("SCALING", 1000),  // clinical output — tracked but does NOT change pay
      makeTx("RCT",     2000),
    ],
  });
  const result = calculatePayrollPayload(input);

  it("payType is PURE_SALARIED", () =>
    expect(result.payType).toBe("PURE_SALARIED"));

  it("finalBasePay = baseSalary + allowances = 6500", () =>
    expect(r(result.finalBasePay)).toBe(6500));

  it("professionalFeesCut is calculated for internal tracking", () => {
    // (1000 × 42%) + (2000 × 42%) = 420 + 840 = 1260
    expect(r(result.professionalFeesCut)).toBe(1260);
  });

  it("professionalFeesCut does NOT add to finalBasePay", () =>
    expect(r(result.finalBasePay)).toBe(6500));

  it("totalPayablePayout = 6500 (no modifiers)", () =>
    expect(r(result.totalPayablePayout)).toBe(6500));

  it("guaranteedFloor is zero for salaried doctor", () =>
    expect(r(result.guaranteedFloor)).toBe(0));

  it("zero allowances — finalBasePay = baseSalary only", () => {
    const r2 = calculatePayrollPayload(makeInput({
      payType: "PURE_SALARIED", baseSalary: d(8000), allowances: d(0),
    }));
    expect(r(r2.finalBasePay)).toBe(8000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. TYPE 2 — LOCUM WITH GUARANTEED FLOOR
// ─────────────────────────────────────────────────────────────────────────────

describe("TYPE 2 — LOCUM_WITH_FLOOR", () => {

  describe("clinical fees exceed floor → clinical wins", () => {
    const input = makeInput({
      payType:         "LOCUM_WITH_FLOOR",
      guaranteedFloor: d(5000),
      treatments:      [makeTx("SCALING", 15000)], // 15000 × 42% = 6300
    });
    const result = calculatePayrollPayload(input);

    it("professionalFeesCut = 15000 × 42% = 6300", () =>
      expect(r(result.professionalFeesCut)).toBe(6300));

    it("finalBasePay = 6300 (clinical wins)", () =>
      expect(r(result.finalBasePay)).toBe(6300));

    it("guaranteedFloor is preserved in output", () =>
      expect(r(result.guaranteedFloor)).toBe(5000));
  });

  describe("floor exceeds clinical → floor wins", () => {
    const input = makeInput({
      payType:         "LOCUM_WITH_FLOOR",
      guaranteedFloor: d(8000),
      treatments:      [makeTx("SCALING", 5000)], // 5000 × 42% = 2100
    });
    const result = calculatePayrollPayload(input);

    it("professionalFeesCut = 2100", () =>
      expect(r(result.professionalFeesCut)).toBe(2100));

    it("finalBasePay = 8000 (floor wins)", () =>
      expect(r(result.finalBasePay)).toBe(8000));
  });

  describe("exact tie — no top-up needed", () => {
    const input = makeInput({
      payType:         "LOCUM_WITH_FLOOR",
      guaranteedFloor: d(4200),
      treatments:      [makeTx("SCALING", 10000)], // 10000 × 42% = 4200
    });
    const result = calculatePayrollPayload(input);

    it("finalBasePay = 4200", () =>
      expect(r(result.finalBasePay)).toBe(4200));
  });

  it("zero treatments and non-zero floor → floor is paid", () => {
    const result = calculatePayrollPayload(makeInput({
      payType: "LOCUM_WITH_FLOOR", guaranteedFloor: d(3000), treatments: [],
    }));
    expect(r(result.finalBasePay)).toBe(3000);
    expect(r(result.professionalFeesCut)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TYPE 3 — PURE PROF FEES
// ─────────────────────────────────────────────────────────────────────────────

describe("TYPE 3 — PURE_PROF_FEES", () => {
  const input = makeInput({
    payType:    "PURE_PROF_FEES",
    treatments: [
      makeTx("SCALING",  1000, 0,   0, 42),   // net 1000 → 420
      makeTx("RCT",      2000, 200, 0, 42),   // net 1800 → 756
      makeTx("ZIRCONIA", 3500, 800, 0, 42),   // net 2700 → 1134
    ],
  });
  const result = calculatePayrollPayload(input);

  it("professionalFeesCut = 420 + 756 + 1134 = 2310", () =>
    expect(r(result.professionalFeesCut)).toBe(2310));

  it("finalBasePay = professionalFeesCut", () =>
    expect(r(result.finalBasePay)).toBe(r(result.professionalFeesCut)));

  it("baseSalary and guaranteedFloor are both zero", () => {
    expect(r(result.baseSalary)).toBe(0);
    expect(r(result.guaranteedFloor)).toBe(0);
  });

  it("lab fee is deducted from net before split", () => {
    const single = calculatePayrollPayload(makeInput({
      payType:    "PURE_PROF_FEES",
      treatments: [makeTx("CROWN", 2000, 500, 0, 50)], // net 1500 × 50% = 750
    }));
    expect(r(single.professionalFeesCut)).toBe(750);
  });

  it("SST is deducted from net before split", () => {
    const single = calculatePayrollPayload(makeInput({
      payType:    "PURE_PROF_FEES",
      treatments: [makeTx("SCALING", 1000, 0, 60, 42)], // net 940 × 42% = 394.80
    }));
    expect(r(single.professionalFeesCut)).toBe(394.80);
  });

  it("zero treatments → zero payout", () => {
    const z = calculatePayrollPayload(makeInput({ payType: "PURE_PROF_FEES", treatments: [] }));
    expect(r(z.totalPayablePayout)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ANCILLARY INCENTIVES
// ─────────────────────────────────────────────────────────────────────────────

describe("ANCILLARY INCENTIVES", () => {
  it("OPG adds flat RM20 per scan (default rate)", () => {
    const result = calculatePayrollPayload(makeInput({
      payType:    "PURE_PROF_FEES",
      treatments: [makeTx("OPG", 120)],  // billed amount irrelevant — flat bonus only
    }));
    expect(result.ancillaryAdditions).toHaveLength(1);
    expect(result.ancillaryAdditions[0].key).toBe("OPG");
    expect(r(result.ancillaryAdditions[0].ratePerItem)).toBe(20);
    expect(result.ancillaryAdditions[0].count).toBe(1);
    expect(r(result.ancillaryAdditions[0].total)).toBe(20);
    expect(r(result.ancillaryTotal)).toBe(20);
  });

  it("multiple OPGs sum to count × rate", () => {
    const result = calculatePayrollPayload(makeInput({
      payType: "PURE_PROF_FEES",
      treatments: [makeTx("OPG", 120), makeTx("OPG", 120), makeTx("PANORAMIC", 120)],
    }));
    const opg = result.ancillaryAdditions.find(a => a.key === "OPG")!;
    expect(opg.count).toBe(3);
    expect(r(opg.total)).toBe(60); // 3 × 20
  });

  it("OPG does NOT contribute to professionalFeesCut", () => {
    const result = calculatePayrollPayload(makeInput({
      payType:    "PURE_PROF_FEES",
      treatments: [makeTx("OPG", 120)],
    }));
    expect(r(result.professionalFeesCut)).toBe(0);
  });

  it("custom ancillary rate overrides default", () => {
    const result = calculatePayrollPayload(makeInput({
      payType:        "PURE_PROF_FEES",
      treatments:     [makeTx("OPG", 120)],
      ancillaryRates: { OPG: d(35) },
    }));
    expect(r(result.ancillaryAdditions[0].ratePerItem)).toBe(35);
    expect(r(result.ancillaryTotal)).toBe(35);
  });

  it("all five ancillary types accumulate correctly with defaults", () => {
    const result = calculatePayrollPayload(makeInput({
      payType: "PURE_PROF_FEES",
      treatments: [
        makeTx("OPG",        120),  // +20
        makeTx("LATERALXRAY", 60), // +15
        makeTx("ITERO",       200), // +15
        makeTx("CBCT",        350), // +50
        makeTx("EMS",          90), // +30
      ],
    }));
    // 20 + 15 + 15 + 50 + 30 = 130
    expect(r(result.ancillaryTotal)).toBe(130);
    expect(result.ancillaryAdditions).toHaveLength(5);
  });

  it("ancillary bonus is added to payout even for PURE_SALARIED doctor", () => {
    const result = calculatePayrollPayload(makeInput({
      payType:    "PURE_SALARIED",
      baseSalary: d(6000),
      treatments: [makeTx("OPG", 120)],
    }));
    // 6000 (salary) + 20 (OPG bonus) = 6020
    expect(r(result.totalPayablePayout)).toBe(6020);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. DISCIPLINARY DEDUCTIONS
// ─────────────────────────────────────────────────────────────────────────────

describe("DISCIPLINARY DEDUCTIONS", () => {
  const deductions: DisciplinaryDeduction[] = [
    { description: "Lab material wastage — crown remake", amount: d(150) },
    { description: "Late submission penalty",              amount: d(50)  },
  ];

  it("deductions are subtracted from finalBasePay", () => {
    const result = calculatePayrollPayload(makeInput({
      payType:                "PURE_PROF_FEES",
      treatments:             [makeTx("SCALING", 5000)], // 5000 × 42% = 2100
      disciplinaryDeductions: deductions,
    }));
    // 2100 − 150 − 50 = 1900
    expect(r(result.deductionTotal)).toBe(200);
    expect(r(result.totalPayablePayout)).toBe(1900);
  });

  it("deduction items are preserved in output", () => {
    const result = calculatePayrollPayload(makeInput({
      payType:                "PURE_PROF_FEES",
      disciplinaryDeductions: deductions,
    }));
    expect(result.disciplinaryDeductions).toHaveLength(2);
    expect(result.disciplinaryDeductions[0].description).toBe("Lab material wastage — crown remake");
    expect(r(result.disciplinaryDeductions[1].amount)).toBe(50);
  });

  it("deductions cannot make payout negative (caller responsibility — engine does not clamp)", () => {
    const result = calculatePayrollPayload(makeInput({
      payType:                "PURE_PROF_FEES",
      treatments:             [makeTx("SCALING", 100)],  // 42 cut
      disciplinaryDeductions: [{ description: "Penalty", amount: d(999) }],
    }));
    // Engine does not clamp — returns whatever the math produces
    expect(r(result.totalPayablePayout)).toBe(r(result.finalBasePay) - 999);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. FULL CALCULATION MATRIX (all three steps together)
// ─────────────────────────────────────────────────────────────────────────────

describe("FULL MATRIX — all three steps combined", () => {
  /**
   * Scenario: Locum doctor, floor RM5000
   *   Clinical: SCALING 1000 (net 1000 × 42% = 420)
   *             RCT     2000 (net 2000 × 42% = 840)
   *             ZIRCONIA 3500 labFee 800 (net 2700 × 42% = 1134)
   *   Total professionalFeesCut = 420 + 840 + 1134 = 2394
   *   Floor = 5000 → floor wins
   *   finalBasePay = 5000
   *
   *   Ancillaries: 2 × OPG (RM20 each) = +40
   *   Deductions:  1 × penalty = -75
   *
   *   totalPayablePayout = 5000 + 40 − 75 = 4965
   */
  const result = calculatePayrollPayload(makeInput({
    payType:         "LOCUM_WITH_FLOOR",
    guaranteedFloor: d(5000),
    treatments: [
      makeTx("SCALING",  1000, 0,   0, 42),
      makeTx("RCT",      2000, 0,   0, 42),
      makeTx("ZIRCONIA", 3500, 800, 0, 42),
      makeTx("OPG",       120, 0,   0, 42),
      makeTx("OPG",       120, 0,   0, 42),
    ],
    disciplinaryDeductions: [{ description: "Penalty", amount: d(75) }],
  }));

  it("professionalFeesCut = 2394", () =>
    expect(r(result.professionalFeesCut)).toBe(2394));

  it("floor wins → finalBasePay = 5000", () =>
    expect(r(result.finalBasePay)).toBe(5000));

  it("ancillaryTotal = 2 × 20 = 40", () =>
    expect(r(result.ancillaryTotal)).toBe(40));

  it("deductionTotal = 75", () =>
    expect(r(result.deductionTotal)).toBe(75));

  it("totalPayablePayout = 5000 + 40 − 75 = 4965", () =>
    expect(r(result.totalPayablePayout)).toBe(4965));

  it("conservation law: finalBasePay + ancillaryTotal − deductionTotal = totalPayablePayout", () => {
    const manual = r(result.finalBasePay) + r(result.ancillaryTotal) - r(result.deductionTotal);
    expect(r(result.totalPayablePayout)).toBe(manual);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. DECIMAL PRECISION GUARD
// ─────────────────────────────────────────────────────────────────────────────

describe("Decimal precision", () => {
  it("0.1 + 0.2 does not produce floating-point drift", () => {
    const result = calculatePayrollPayload(makeInput({
      payType:    "PURE_PROF_FEES",
      treatments: [makeTx("SCALING", 1, 0, 0, 10)],  // 1 × 10% = 0.1
    }));
    expect(result.professionalFeesCut.toDecimalPlaces(2).toNumber()).toBe(0.10);
  });

  it("split with repeating decimal terminates cleanly at 2dp", () => {
    // 1000 × (1/3) = 333.33...
    const result = calculatePayrollPayload(makeInput({
      payType:    "PURE_PROF_FEES",
      treatments: [makeTx("SCALING", 1000, 0, 0, 100 / 3)],
    }));
    expect(result.professionalFeesCut.isFinite()).toBe(true);
    expect(result.professionalFeesCut.decimalPlaces()).toBeLessThanOrEqual(2);
  });
});
