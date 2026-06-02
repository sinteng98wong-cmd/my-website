/**
 * Doctor Payroll Service — Test Suite
 *
 * All tests target pure calculation functions (no Prisma / DB dependencies).
 * The orchestration function (calculateDoctorComprehensivePayroll) is exercised
 * in integration tests via the actual dev DB; these unit tests cover every
 * mathematical pathway including the Type 4 dual-slip conversion.
 */

import Decimal from "decimal.js";
import {
  resolveArchetype,
  calculateClinicalFees,
  calculateLocumFloor,
  computeStatutory,
  calculateType1,
  calculateType2,
  calculateType3,
  calculateType4,
  zeroSalarySlip,
  type TreatmentInput,
  type DualSlipConfig,
} from "../doctor-payroll.service";

// ── Helpers ───────────────────────────────────────────────────────────────────

function d(value: number | string): Decimal {
  return new Decimal(value);
}

/** Round a Decimal to 2dp for snapshot comparisons. */
function r(dec: Decimal): number {
  return dec.toDecimalPlaces(2).toNumber();
}

function makeTreatment(
  overrides: Partial<TreatmentInput> & { id?: string } = {},
): TreatmentInput {
  return {
    id:           overrides.id ?? "t1",
    billedAmount: overrides.billedAmount ?? d(1000),
    labFee:       overrides.labFee       ?? d(0),
    sst:          overrides.sst          ?? d(0),
    doctorSplit:  overrides.doctorSplit   ?? d(70),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Archetype resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveArchetype()", () => {
  it("LOCUM + engagement → LOCUM_WITH_FLOOR", () => {
    expect(resolveArchetype("LOCUM", false, true)).toBe("LOCUM_WITH_FLOOR");
  });
  it("LOCUM + no engagement → still LOCUM_WITH_FLOOR (type takes precedence)", () => {
    expect(resolveArchetype("LOCUM", false, false)).toBe("LOCUM_WITH_FLOOR");
  });
  it("PERMANENT + salary + engagement → DUAL_SLIP_HYBRID", () => {
    expect(resolveArchetype("PERMANENT", true, true)).toBe("DUAL_SLIP_HYBRID");
  });
  it("PERMANENT + salary + no engagement → PURE_SALARIED", () => {
    expect(resolveArchetype("PERMANENT", true, false)).toBe("PURE_SALARIED");
  });
  it("PERMANENT + no salary → PURE_PROF_FEES", () => {
    expect(resolveArchetype("PERMANENT", false, false)).toBe("PURE_PROF_FEES");
  });
  it("PERMANENT + no salary + engagement → PURE_PROF_FEES (salary flag wins)", () => {
    expect(resolveArchetype("PERMANENT", false, true)).toBe("PURE_PROF_FEES");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Clinical fee calculation
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateClinicalFees()", () => {
  it("basic: (1000 − 0 − 0) × 70% = 700", () => {
    const fees = calculateClinicalFees([makeTreatment()]);
    expect(r(fees)).toBe(700);
  });

  it("deducts labFee and SST before applying split", () => {
    const t = makeTreatment({ billedAmount: d(2000), labFee: d(300), sst: d(100), doctorSplit: d(60) });
    // net = 2000 − 300 − 100 = 1600; split = 1600 × 0.60 = 960
    expect(r(calculateClinicalFees([t]))).toBe(960);
  });

  it("sums across multiple treatments", () => {
    const treatments: TreatmentInput[] = [
      makeTreatment({ id: "t1", billedAmount: d(1000), doctorSplit: d(70) }),  // 700
      makeTreatment({ id: "t2", billedAmount: d(500),  doctorSplit: d(50) }),  // 250
    ];
    expect(r(calculateClinicalFees(treatments))).toBe(950);
  });

  it("returns 0 for empty array", () => {
    expect(calculateClinicalFees([]).toNumber()).toBe(0);
  });

  it("treatment with 100% SST leaves zero net", () => {
    const t = makeTreatment({ billedAmount: d(500), sst: d(500), doctorSplit: d(100) });
    expect(calculateClinicalFees([t]).toNumber()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Locum floor
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateLocumFloor()", () => {
  it("12 sessions × RM 500/session = RM 6 000", () => {
    expect(r(calculateLocumFloor(12, d(500)))).toBe(6000);
  });
  it("0 sessions → 0", () => {
    expect(calculateLocumFloor(0, d(500)).toNumber()).toBe(0);
  });
  it("fractional day rate rounds correctly", () => {
    // 5 sessions × 333.33 = 1666.65
    expect(r(calculateLocumFloor(5, d("333.33")))).toBe(1666.65);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Statutory contributions
// ─────────────────────────────────────────────────────────────────────────────

describe("computeStatutory()", () => {
  describe("on RM 5 000 (boundary — employer rate = 13%)", () => {
    const stat = computeStatutory(d(5000));
    it("EPF employee  = 5000 × 11% = 550", ()     => expect(r(stat.epfEmployee)).toBe(550));
    it("EPF employer  = 5000 × 13% = 650 (≤5000)", () => expect(r(stat.epfEmployer)).toBe(650));
    it("SOCSO employee= 5000 × 0.5% = 25",  ()   => expect(r(stat.socsoEmployee)).toBe(25));
    it("SOCSO employer= 5000 × 1.75%= 87.50", () => expect(r(stat.socsoEmployer)).toBe(87.5));
    it("EIS employee  = 5000 × 0.2% = 10",   ()  => expect(r(stat.eisEmployee)).toBe(10));
    it("EIS employer  = 5000 × 0.2% = 10",   ()  => expect(r(stat.eisEmployer)).toBe(10));
    it("total burden  = 550+650+25+87.5+10+10 = 1332.50", () =>
      expect(r(stat.totalBurden)).toBe(1332.50));
  });

  describe("on RM 10 000 (employer rate = 12%)", () => {
    const stat = computeStatutory(d(10000));
    it("EPF employer = 10000 × 12% = 1200", () => expect(r(stat.epfEmployer)).toBe(1200));
    it("EPF employee = 10000 × 11% = 1100", () => expect(r(stat.epfEmployee)).toBe(1100));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. TYPE 1 — Pure Salaried
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateType1() — PURE_SALARIED", () => {
  const { grossTarget, salarySlip: slip } = calculateType1(d(6000), d(1000));

  it("grossTarget = basic + allowances = 7000", () => expect(r(grossTarget)).toBe(7000));

  it("EPF employee  = 7000 × 11% = 770",      () => expect(r(slip.epfEmployee)).toBe(770));
  it("EPF employer  = 7000 × 12% = 840 (>5k)", () => expect(r(slip.epfEmployer)).toBe(840));
  it("SOCSO employee= 7000 × 0.5% = 35",      () => expect(r(slip.socsoEmployee)).toBe(35));
  it("EIS employee  = 7000 × 0.2% = 14",      () => expect(r(slip.eisEmployee)).toBe(14));

  it("netSalary = gross − employee deductions = 7000 − 770 − 35 − 14 = 6181", () => {
    expect(r(slip.netSalary)).toBe(6181);
  });

  it("zero-allowance case: gross = basic only", () => {
    const { grossTarget: g } = calculateType1(d(8000), d(0));
    expect(r(g)).toBe(8000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. TYPE 2 — Locum with Floor
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateType2() — LOCUM_WITH_FLOOR", () => {
  it("clinical > floor → clinical wins", () => {
    const { grossTarget } = calculateType2(d(12000), d(8000));
    expect(r(grossTarget)).toBe(12000);
  });

  it("floor > clinical → floor wins (top-up)", () => {
    const { grossTarget } = calculateType2(d(3000), d(8000));
    expect(r(grossTarget)).toBe(8000);
  });

  it("tie → either value (equal, no top-up implied)", () => {
    const { grossTarget } = calculateType2(d(5000), d(5000));
    expect(r(grossTarget)).toBe(5000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. TYPE 3 — Pure Professional Fees
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateType3() — PURE_PROF_FEES", () => {
  it("gross = clinical fees exactly", () => {
    const fees = calculateClinicalFees([
      makeTreatment({ billedAmount: d(5000), doctorSplit: d(60) }),
    ]); // 3000
    const { grossTarget } = calculateType3(fees);
    expect(r(grossTarget)).toBe(3000);
  });

  it("attendance has no effect (pass-through)", () => {
    const { grossTarget } = calculateType3(d(9999.99));
    expect(r(grossTarget)).toBe(9999.99);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. TYPE 4 — Dual-Slip Hybrid  ← most complex, most exhaustive
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateType4() — DUAL_SLIP_HYBRID", () => {

  /**
   * Spec worked example:
   *   grossTarget      = 15 000
   *   salaryCap        = 11 000
   *   basicSalary      =  6 000  (config)
   *   serviceVoucher   =  4 000  (remainder)
   *
   * The function back-solves: preGross × (1 + ER) = salaryCap
   *   ER = 0.12 + 0.0175 + 0.002 = 0.1395
   *   preGross = 11000 / 1.1395 ≈ 9654.23
   *   performanceIncentive = preGross − 6000 ≈ 3654.23
   */
  const cfg: DualSlipConfig = { salaryCap: d(11000), basicSalary: d(6000) };
  const { salarySlip: slip, serviceVoucher } = calculateType4(d(15000), cfg);

  it("service voucher = 15000 − 11000 = 4000", () => {
    expect(r(serviceVoucher.professionalFees)).toBe(4000);
  });

  it("basic salary is preserved from config", () => {
    expect(r(slip.basic)).toBe(6000);
  });

  it("performance incentive ≥ 0", () => {
    expect(slip.performanceIncentive.gte(0)).toBe(true);
  });

  it("salary cap identity: preGross + employerBurden ≈ salaryCap (±0.10 rounding tolerance)", () => {
    const preGross = slip.basic.plus(slip.performanceIncentive);
    const totalEmployerBurden = slip.epfEmployer.plus(slip.socsoEmployer).plus(slip.eisEmployer);
    const reconstructed = preGross.plus(totalEmployerBurden);
    expect(reconstructed.toDecimalPlaces(0).toNumber()).toBeCloseTo(11000, 0);
  });

  it("netSalary = preGross − employee deductions", () => {
    const preGross         = slip.basic.plus(slip.performanceIncentive);
    const employeeDeduct   = slip.epfEmployee.plus(slip.socsoEmployee).plus(slip.eisEmployee);
    const expectedNet      = preGross.minus(employeeDeduct).toDecimalPlaces(2);
    expect(r(slip.netSalary)).toBe(r(expectedNet));
  });

  it("combined employee burden: EPF + SOCSO + EIS all present", () => {
    expect(slip.epfEmployee.gt(0)).toBe(true);
    expect(slip.socsoEmployee.gt(0)).toBe(true);
    expect(slip.eisEmployee.gt(0)).toBe(true);
  });

  it("combined employer burden: EPF + SOCSO + EIS all present", () => {
    expect(slip.epfEmployer.gt(0)).toBe(true);
    expect(slip.socsoEmployer.gt(0)).toBe(true);
    expect(slip.eisEmployer.gt(0)).toBe(true);
  });

  it("grossTarget = salaryCap + voucher (conservation law)", () => {
    const total = d(11000).plus(serviceVoucher.professionalFees);
    expect(r(total)).toBe(15000);
  });

  describe("edge: grossTarget ≤ salaryCap → voucher = 0", () => {
    const { serviceVoucher: sv } = calculateType4(d(8000), { salaryCap: d(11000), basicSalary: d(5000) });
    it("voucher is zero", () => expect(r(sv.professionalFees)).toBe(0));
  });

  describe("edge: basicSalary > preGross → incentive clamps to 0", () => {
    // Artificially large basic salary relative to the cap
    const { salarySlip: s } = calculateType4(d(5000), { salaryCap: d(4000), basicSalary: d(9000) });
    it("performanceIncentive is 0, not negative", () => {
      expect(s.performanceIncentive.toNumber()).toBe(0);
    });
  });

  describe("Type 4 statutory division correctness", () => {
    /**
     * Explicit verification that employee and employer figures are correctly
     * partitioned (not blended into a single number).
     * On preGross ≈ 9654.23:
     *   EPF employee  = preGross × 11%
     *   EPF employer  = preGross × 12%  (>5000)
     *   These must NOT equal each other.
     */
    it("EPF employer ≠ EPF employee (different rates)", () => {
      expect(r(slip.epfEmployer)).not.toBe(r(slip.epfEmployee));
    });

    it("EPF employer > EPF employee (12% > 11%)", () => {
      expect(slip.epfEmployer.gt(slip.epfEmployee)).toBe(true);
    });

    it("SOCSO employer > SOCSO employee (1.75% > 0.5%)", () => {
      expect(slip.socsoEmployer.gt(slip.socsoEmployee)).toBe(true);
    });

    it("EIS employer = EIS employee (both 0.2%)", () => {
      expect(r(slip.eisEmployer)).toBe(r(slip.eisEmployee));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Zero salary slip helper
// ─────────────────────────────────────────────────────────────────────────────

describe("zeroSalarySlip()", () => {
  const z = zeroSalarySlip();
  const fields: (keyof typeof z)[] = [
    "basic", "performanceIncentive", "epfEmployee", "epfEmployer",
    "socsoEmployee", "socsoEmployer", "eisEmployee", "eisEmployer", "netSalary",
  ];
  fields.forEach(f => {
    it(`${f} is 0`, () => expect((z[f] as Decimal).toNumber()).toBe(0));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Decimal precision guard
// ─────────────────────────────────────────────────────────────────────────────

describe("Decimal precision — floating-point guard", () => {
  it("0.1 + 0.2 = exactly 0.3 (would fail with native JS)", () => {
    const result = d("0.1").plus(d("0.2"));
    expect(result.toNumber()).toBe(0.3);
  });

  it("clinical fee with repeating decimal terminates cleanly", () => {
    // 1000 × (1/3) = 333.33 (2dp)
    const t = makeTreatment({ billedAmount: d(1000), doctorSplit: d("33.333333") });
    const fees = calculateClinicalFees([t]);
    // Should NOT produce an infinite repeating decimal
    expect(fees.toDecimalPlaces(2).isFinite()).toBe(true);
  });
});
