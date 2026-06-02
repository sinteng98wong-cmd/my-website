/**
 * commission.service.vitest.ts
 *
 * Mirrors the Atlas Dental clinical-slip spreadsheet (image_9afc83.jpg).
 * All figures below are constructed to replicate the exact totals shown.
 * No Prisma / DB dependencies — tests run against the pure buildPayload().
 *
 * Run: npm run test:vitest
 */

import { describe, it, expect, beforeAll } from "vitest";
import Decimal from "decimal.js";
import {
  classifyTreatment,
  buildPayload,
  serialisePayload,
  type RawTreatmentInput,
  type DeductionItem,
  type DoctorPayrollPayload,
} from "../commission.service";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const d = (v: number | string) => new Decimal(v);
const r = (dec: Decimal) => dec.toDecimalPlaces(2).toNumber();

function makeTx(overrides: Partial<RawTreatmentInput> & { typeCode: string }): RawTreatmentInput {
  return {
    id:           overrides.id          ?? "t-default",
    visitDate:    overrides.visitDate   ?? new Date("2025-04-15"),
    patientName:  overrides.patientName ?? "Test Patient",
    typeCode:     overrides.typeCode,
    billedAmount: overrides.billedAmount ?? d(0),
    labFee:       overrides.labFee      ?? d(0),
    sst:          overrides.sst         ?? d(0),
    doctorSplit:  overrides.doctorSplit  ?? d(42),
    toothCodes:   overrides.toothCodes  ?? "",
    paidLocum:    overrides.paidLocum   ?? d(0),
    isDeduction:  overrides.isDeduction ?? false,
    deductionLabel: overrides.deductionLabel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. classifyTreatment()
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyTreatment()", () => {
  it("ENDO codes", () => {
    expect(classifyTreatment("ENDO")).toBe("ENDO");
    expect(classifyTreatment("rct")).toBe("ENDO");
    expect(classifyTreatment("Pulpotomy")).toBe("ENDO");
  });
  it("DENTURE_BRIDGE_CROWN codes", () => {
    expect(classifyTreatment("CROWN")).toBe("DENTURE_BRIDGE_CROWN");
    expect(classifyTreatment("PFM")).toBe("DENTURE_BRIDGE_CROWN");
    expect(classifyTreatment("ZIRCONIA")).toBe("DENTURE_BRIDGE_CROWN");
    expect(classifyTreatment("BRIDGE")).toBe("DENTURE_BRIDGE_CROWN");
    expect(classifyTreatment("DENTURE")).toBe("DENTURE_BRIDGE_CROWN");
  });
  it("ALIGNER codes", () => {
    expect(classifyTreatment("ALIGNER")).toBe("ALIGNER");
    expect(classifyTreatment("INVISALIGN")).toBe("ALIGNER");
    expect(classifyTreatment("ClearAlign")).toBe("ALIGNER");
  });
  it("Ancillary codes", () => {
    expect(classifyTreatment("OPG")).toBe("OPG");
    expect(classifyTreatment("LATERALXRAY")).toBe("LATERAL");
    expect(classifyTreatment("CBCT")).toBe("CBCT");
    expect(classifyTreatment("EMS")).toBe("EMS");
    expect(classifyTreatment("SCAN")).toBe("SCAN");
  });
  it("unknown → STANDARD", () => {
    expect(classifyTreatment("SCALING")).toBe("STANDARD");
    expect(classifyTreatment("XRAY")).toBe("STANDARD");
    expect(classifyTreatment("FILLING")).toBe("STANDARD");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Full payload — spreadsheet replica
//
//    Split rate = 42%  (as shown in image)
//
//    STANDARD daily (net of labFee/sst):
//      Apr 2  RM  800
//      Apr 5  RM 1200
//      Apr 9  RM  600
//      grossCollectionTotal = 2600  (pre-split raw)
//
//    ENDO cases (summary total = raw net amounts, pre-split):
//      Ahmad  tooth 16  net 1500 → per-case collection = 1500 × 42% = 630
//      Lim    tooth 26  net 1200 → per-case collection = 1200 × 42% = 504
//      endoTotal = 1500 + 1200 = 2700  (raw nets, NOT split-applied)
//
//    DENTURE/BRIDGE/CROWN cases (summary total = raw netAmount, pre-split):
//      Rajan  charge 3500 labFee 800 net 2700 → per-case collection = 2700 × 42% = 1134
//      Fatimah charge 2800 labFee 600 net 2200 → per-case collection = 2200 × 42% = 924
//      dentureBridgeCrownTotal = 2700 + 2200 = 4900  (raw nets)
//
//    ALIGNER cases (summary total = raw balance, pre-split):
//      Siti  total 8000 labFee 2000 balance 6000 paidLocum 1000
//            per-case collection = (6000 − 1000) × 42% = 2100
//      alignerTotal = 6000  (raw balance before paidLocum deduction)
//
//    grandSubTotal = 2600 + 2700 + 4900 + 6000 = 16200  (all pre-split)
//    professionalFeePayout = 16200 × 42% = 6804
//
//    Ancillaries (full amount, no split):
//      OPG     RM 120
//      LATERAL RM 60
//      EMS     RM 200
//      ancillaryTotal = 380
//
//    Deductions:
//      DEDUCT ADDITIONAL ALIGNER — Siti RM 500
//      deductionTotal = 500
//
//    finalPayout = 6804 + 380 − 500 = 6684
// ─────────────────────────────────────────────────────────────────────────────

const SPLIT = d("42");
const DOCTOR_ID = "dr-001";
const MONTH = "2025-04";

const TREATMENTS: RawTreatmentInput[] = [
  // STANDARD — Apr 2
  makeTx({ id: "s1", typeCode: "SCALING", visitDate: new Date("2025-04-02"), billedAmount: d(800),  patientName: "Ali" }),
  // STANDARD — Apr 5
  makeTx({ id: "s2", typeCode: "FILLING", visitDate: new Date("2025-04-05"), billedAmount: d(1200), patientName: "Bob" }),
  // STANDARD — Apr 9
  makeTx({ id: "s3", typeCode: "FILLING", visitDate: new Date("2025-04-09"), billedAmount: d(600),  patientName: "Carol" }),

  // ENDO — Ahmad tooth 16
  makeTx({ id: "e1", typeCode: "ENDO", visitDate: new Date("2025-04-03"), billedAmount: d(1500), patientName: "Ahmad", toothCodes: "16" }),
  // ENDO — Lim tooth 26
  makeTx({ id: "e2", typeCode: "RCT",  visitDate: new Date("2025-04-07"), billedAmount: d(1200), patientName: "Lim",   toothCodes: "26" }),

  // DENTURE/BRIDGE/CROWN — Rajan
  makeTx({ id: "d1", typeCode: "CROWN",   visitDate: new Date("2025-04-10"), billedAmount: d(3500), labFee: d(800), patientName: "Rajan"  }),
  // DENTURE/BRIDGE/CROWN — Fatimah
  makeTx({ id: "d2", typeCode: "ZIRCONIA",visitDate: new Date("2025-04-14"), billedAmount: d(2800), labFee: d(600), patientName: "Fatimah" }),

  // ALIGNER — Siti
  makeTx({ id: "a1", typeCode: "ALIGNER", visitDate: new Date("2025-04-08"), billedAmount: d(8000), labFee: d(2000), patientName: "Siti", paidLocum: d(1000) }),

  // ANCILLARIES
  makeTx({ id: "x1", typeCode: "OPG",         visitDate: new Date("2025-04-04"), billedAmount: d(120), patientName: "Ali"   }),
  makeTx({ id: "x2", typeCode: "LATERALXRAY", visitDate: new Date("2025-04-04"), billedAmount: d(60),  patientName: "Ali"   }),
  makeTx({ id: "x3", typeCode: "EMS",         visitDate: new Date("2025-04-12"), billedAmount: d(200), patientName: "David" }),
];

const EXTRA_DEDUCTIONS: DeductionItem[] = [
  { description: "DEDUCT ADDITIONAL ALIGNER", patientName: "Siti", amount: d(500) },
];

let result: DoctorPayrollPayload;

beforeAll(() => {
  result = buildPayload(DOCTOR_ID, MONTH, SPLIT, TREATMENTS, EXTRA_DEDUCTIONS);
});

// ── 2a. Daily collections ─────────────────────────────────────────────────

describe("Daily collection grid", () => {
  it("produces 3 date entries (Apr 2, 5, 9)", () => {
    expect(result.dailyCollections).toHaveLength(3);
  });
  it("entries are sorted ascending by date", () => {
    const dates = result.dailyCollections.map(d => d.date);
    expect(dates).toEqual(["2025-04-02", "2025-04-05", "2025-04-09"]);
  });
  it("Apr 2 = RM 800", ()  => expect(r(result.dailyCollections[0].amount)).toBe(800));
  it("Apr 5 = RM 1200", () => expect(r(result.dailyCollections[1].amount)).toBe(1200));
  it("Apr 9 = RM 600", ()  => expect(r(result.dailyCollections[2].amount)).toBe(600));
  it("grossCollectionTotal = 2600", () =>
    expect(r(result.summary.grossCollectionTotal)).toBe(2600));
});

// ── 2b. Endo cases ─────────────────────────────────────────────────────────

describe("Endo cases", () => {
  it("2 endo cases", () => expect(result.endoCases).toHaveLength(2));

  it("Ahmad — amount 1500, collection 630 (42%)", () => {
    const ahmad = result.endoCases.find(e => e.patientName === "Ahmad")!;
    expect(r(ahmad.amount)).toBe(1500);
    expect(r(ahmad.collection)).toBe(630);
    expect(ahmad.toothCodes).toBe("16");
  });

  it("Lim — amount 1200, collection 504 (42%)", () => {
    const lim = result.endoCases.find(e => e.patientName === "Lim")!;
    expect(r(lim.amount)).toBe(1200);
    expect(r(lim.collection)).toBe(504);
    expect(lim.toothCodes).toBe("26");
  });

  it("endoTotal = 2700 (raw pre-split nets: 1500 + 1200)", () =>
    expect(r(result.summary.endoTotal)).toBe(2700));
});

// ── 2c. Denture / Bridge / Crown cases ────────────────────────────────────

describe("Denture / Bridge / Crown cases", () => {
  it("2 denture cases", () => expect(result.dentureBridgeCrownCases).toHaveLength(2));

  it("Rajan — charge 3500, labFee 800, net 2700, collection 1134", () => {
    const rajan = result.dentureBridgeCrownCases.find(c => c.patientName === "Rajan")!;
    expect(r(rajan.charge)).toBe(3500);
    expect(r(rajan.labFee)).toBe(800);
    expect(r(rajan.netAmount)).toBe(2700);
    expect(r(rajan.collection)).toBe(1134);
  });

  it("Fatimah — charge 2800, labFee 600, net 2200, collection 924", () => {
    const fat = result.dentureBridgeCrownCases.find(c => c.patientName === "Fatimah")!;
    expect(r(fat.charge)).toBe(2800);
    expect(r(fat.labFee)).toBe(600);
    expect(r(fat.netAmount)).toBe(2200);
    expect(r(fat.collection)).toBe(924);
  });

  it("dentureBridgeCrownTotal = 4900 (raw pre-split netAmounts: 2700 + 2200)", () =>
    expect(r(result.summary.dentureBridgeCrownTotal)).toBe(4900));
});

// ── 2d. Aligner cases ─────────────────────────────────────────────────────

describe("Aligner cases", () => {
  it("1 aligner case", () => expect(result.alignerCases).toHaveLength(1));

  it("Siti — balance 6000, paidLocum 1000, collection 2100", () => {
    const siti = result.alignerCases[0];
    expect(siti.patientName).toBe("Siti");
    expect(r(siti.totalTreatment)).toBe(8000);
    expect(r(siti.labFees)).toBe(2000);
    expect(r(siti.balance)).toBe(6000);
    expect(r(siti.paidLocum)).toBe(1000);
    expect(r(siti.collection)).toBe(2100);  // (6000 − 1000) × 42%
  });

  it("alignerTotal = 6000 (raw pre-split balance: 8000 − 2000)", () =>
    expect(r(result.summary.alignerTotal)).toBe(6000));
});

// ── 2e. Grand sub-total & professional fee ────────────────────────────────

describe("Reconciliation summary", () => {
  it("grandSubTotal = 2600 + 2700 + 4900 + 6000 = 16200 (all pre-split)", () =>
    expect(r(result.summary.grandSubTotal)).toBe(16200));

  it("professionalFeePayout = 16200 × 42% = 6804", () =>
    expect(r(result.summary.professionalFeePayout)).toBe(6804));

  it("ancillary OPG = 120", () => {
    const opg = result.summary.ancillaries.find(a => a.key === "OPG")!;
    expect(r(opg.amount)).toBe(120);
  });

  it("ancillary LATERAL = 60", () => {
    const lat = result.summary.ancillaries.find(a => a.key === "LATERAL")!;
    expect(r(lat.amount)).toBe(60);
  });

  it("ancillary EMS = 200", () => {
    const ems = result.summary.ancillaries.find(a => a.key === "EMS")!;
    expect(r(ems.amount)).toBe(200);
  });

  it("ancillaryTotal = 120 + 60 + 200 = 380", () =>
    expect(r(result.summary.ancillaryTotal)).toBe(380));

  it("deduction: DEDUCT ADDITIONAL ALIGNER for Siti = 500", () => {
    const ded = result.summary.deductions[0];
    expect(ded.patientName).toBe("Siti");
    expect(r(ded.amount)).toBe(500);
  });

  it("deductionTotal = 500", () =>
    expect(r(result.summary.deductionTotal)).toBe(500));

  it("finalPayout = 6804 + 380 − 500 = 6684", () =>
    expect(r(result.summary.finalPayout)).toBe(6684));
});

// ── 2f. Ancillaries do NOT appear in daily collections ─────────────────────

describe("Ancillary isolation", () => {
  it("OPG/Lateral/EMS dates are absent from dailyCollections", () => {
    // Apr 4 has OPG + Lateral but no standard treatments → should NOT appear
    const apr4 = result.dailyCollections.find(d => d.date === "2025-04-04");
    expect(apr4).toBeUndefined();
  });
  it("Ancillaries do not inflate grandSubTotal", () => {
    // grandSubTotal should only include STANDARD + ENDO + DENTURE + ALIGNER collections
    const manualGrand = d(2600).plus(2700).plus(4900).plus(6000);
    expect(r(result.summary.grandSubTotal)).toBe(r(manualGrand));
  });
});

// ── 3. Edge cases ─────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("empty treatments → all zeros, no crash", () => {
    const empty = buildPayload("dr-x", "2025-04", d(42), []);
    expect(r(empty.summary.finalPayout)).toBe(0);
    expect(empty.dailyCollections).toHaveLength(0);
  });

  it("treatment with sst is excluded from net for STANDARD", () => {
    const tx = makeTx({ typeCode: "SCALING", billedAmount: d(1000), sst: d(60), labFee: d(0) });
    const p = buildPayload("dr-x", "2025-04", d(42), [tx]);
    // net = 1000 − 0 − 60 = 940
    expect(r(p.dailyCollections[0].amount)).toBe(940);
  });

  it("labFee pulled for endo does not affect tooth codes", () => {
    const tx = makeTx({ typeCode: "ENDO", billedAmount: d(2000), labFee: d(200), toothCodes: "14, 15" });
    const p = buildPayload("dr-x", "2025-04", d(50), [tx]);
    // net = 2000 − 200 − 0 = 1800; collection = 1800 × 50% = 900
    expect(r(p.endoCases[0].collection)).toBe(900);
    expect(p.endoCases[0].toothCodes).toBe("14, 15");
  });

  it("aligner with zero paidLocum → collection = balance × split", () => {
    const tx = makeTx({ typeCode: "ALIGNER", billedAmount: d(6000), labFee: d(1000), paidLocum: d(0) });
    const p = buildPayload("dr-x", "2025-04", d(42), [tx]);
    // balance = 5000; collection = 5000 × 42% = 2100
    expect(r(p.alignerCases[0].collection)).toBe(2100);
  });

  it("aligner collection floored at 0 if paidLocum > balance", () => {
    const tx = makeTx({ typeCode: "ALIGNER", billedAmount: d(3000), labFee: d(2500), paidLocum: d(9999) });
    const p = buildPayload("dr-x", "2025-04", d(42), [tx]);
    // balance = 500; (500 − 9999) < 0 → clamped to 0
    expect(r(p.alignerCases[0].collection)).toBe(0);
  });

  it("deduction treatment (isDeduction flag) is excluded from all buckets", () => {
    const tx = makeTx({ typeCode: "ALIGNER", billedAmount: d(500), isDeduction: true, deductionLabel: "DEDUCT ADDITIONAL ALIGNER" });
    const p = buildPayload("dr-x", "2025-04", d(42), [tx]);
    expect(p.alignerCases).toHaveLength(0);
    expect(p.summary.deductions).toHaveLength(1);
    expect(r(p.summary.deductionTotal)).toBe(500);
  });

  it("conservation law: grandSubTotal × splitRate + ancillaryTotal − deductionTotal = finalPayout", () => {
    const p = buildPayload(DOCTOR_ID, MONTH, SPLIT, TREATMENTS, EXTRA_DEDUCTIONS);
    const manual = p.summary.professionalFeePayout
      .plus(p.summary.ancillaryTotal)
      .minus(p.summary.deductionTotal);
    expect(r(p.summary.finalPayout)).toBe(r(manual));
  });
});

// ── 4. Extra deductions via parameter ────────────────────────────────────────

describe("extraDeductions parameter", () => {
  it("deduction appears in summary and reduces finalPayout", () => {
    const tx = makeTx({ typeCode: "SCALING", billedAmount: d(2000) });
    const deduction: DeductionItem = { description: "ADVANCE RECOVERY", patientName: "—", amount: d(500) };
    const p = buildPayload("dr-x", MONTH, SPLIT, [tx], [deduction]);
    expect(p.summary.deductions).toHaveLength(1);
    expect(r(p.summary.deductionTotal)).toBe(500);
    expect(r(p.summary.finalPayout)).toBe(r(p.summary.professionalFeePayout) - 500);
  });
});

// ── 5. serialisePayload ───────────────────────────────────────────────────────

describe("serialisePayload()", () => {
  it("converts all Decimal fields to plain numbers for JSON storage", () => {
    const p       = buildPayload(DOCTOR_ID, MONTH, SPLIT, TREATMENTS, EXTRA_DEDUCTIONS);
    const serial  = serialisePayload(p) as any;
    const parsed  = JSON.parse(JSON.stringify(serial));
    expect(typeof parsed.summary.grandSubTotal).toBe("number");
    expect(parsed.summary.grandSubTotal).toBe(16200);
  });

  it("splitRate serialises as a number, not a string", () => {
    const p      = buildPayload("dr-x", MONTH, SPLIT, []);
    const serial = serialisePayload(p) as any;
    expect(typeof serial.splitRate).toBe("number");
    expect(serial.splitRate).toBe(42);
  });
});
