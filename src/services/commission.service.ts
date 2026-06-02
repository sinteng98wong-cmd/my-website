/**
 * commission.service.ts
 *
 * Builds the fully-itemised professional-fee reconciliation payload that
 * mirrors the clinical-slip spreadsheet (Atlas Dental Group format).
 *
 * Bucket logic (matched via TreatmentType.code, case-insensitive prefix/contains):
 *   STANDARD          — daily collection grid
 *   ENDO              — root-canal / endodontic cases
 *   DENTURE_BRIDGE_CROWN — lab-fee-bearing prosthetic work
 *   ALIGNER           — clear aligner / Invisalign cases
 *   ANCILLARY         — OPG, Lateral Xray, Scan, CBCT, EMS (added at full value, no split)
 *
 * Reconciliation flow:
 *   grandSubTotal = Σ(standard net) + Σ(endo net) + Σ(denture net) + Σ(aligner balance)
 *   professionalFeePayout = grandSubTotal × splitRate%
 *   finalPayout = professionalFeePayout + Σ(ancillary) − Σ(deductions)
 */

import Decimal from "decimal.js";
import { PrismaClient, Prisma } from "@prisma/client";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─────────────────────────────────────────────────────────────────────────────
// Category matchers  (customise codes to match your TreatmentType.code values)
// ─────────────────────────────────────────────────────────────────────────────

export const CATEGORY_CODES = {
  ENDO:    ["ENDO", "RCT", "ROOT", "PULP", "PULPOTOMY", "PULPECTOMY"],
  DENTURE: ["CROWN", "CR", "BRIDGE", "BR", "DENTURE", "DEN", "VENEER", "CERAMIC", "INLAY", "ONLAY", "PFM", "ZIRCONIA"],
  ALIGNER: ["ALIGNER", "ALIGN", "INVISALIGN", "CLEAR", "RETAINER"],
  OPG:     ["OPG", "PANORAMIC", "PANO"],
  LATERAL: ["LATERAL", "LATERALXRAY", "CEPH", "CEPHALOMETRIC"],
  SCAN:    ["SCAN", "INTRAORAL", "ITERO"],
  CBCT:    ["CBCT", "CONE", "3DCT"],
  EMS:     ["EMS", "AIRFLOW", "PROPHYLAXIS", "GBT"],
} as const;

type AncillaryKey = "OPG" | "LATERAL" | "SCAN" | "CBCT" | "EMS";

function matchesAny(code: string, patterns: readonly string[]): boolean {
  const upper = code.toUpperCase();
  return patterns.some(p => upper.includes(p));
}

export type TreatmentBucket =
  | "ENDO"
  | "DENTURE_BRIDGE_CROWN"
  | "ALIGNER"
  | "OPG"
  | "LATERAL"
  | "SCAN"
  | "CBCT"
  | "EMS"
  | "STANDARD";

export function classifyTreatment(code: string): TreatmentBucket {
  if (matchesAny(code, CATEGORY_CODES.ENDO))    return "ENDO";
  if (matchesAny(code, CATEGORY_CODES.DENTURE))  return "DENTURE_BRIDGE_CROWN";
  if (matchesAny(code, CATEGORY_CODES.ALIGNER))  return "ALIGNER";
  if (matchesAny(code, CATEGORY_CODES.OPG))      return "OPG";
  if (matchesAny(code, CATEGORY_CODES.LATERAL))  return "LATERAL";
  if (matchesAny(code, CATEGORY_CODES.SCAN))     return "SCAN";
  if (matchesAny(code, CATEGORY_CODES.CBCT))     return "CBCT";
  if (matchesAny(code, CATEGORY_CODES.EMS))      return "EMS";
  return "STANDARD";
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload types  (what the PDF / UI rendering engine consumes)
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyCollection {
  date:   string;   // ISO "2025-04-01"
  amount: Decimal;  // net collectible for that day
}

export interface EndoCase {
  patientName: string;
  toothCodes:  string;   // e.g. "16, 17" — joined from ToothRecord
  amount:      Decimal;  // billedAmount − labFee − sst
  splitRate:   Decimal;  // doctor's split %
  collection:  Decimal;  // amount × splitRate / 100
}

export interface DentureBridgeCrownCase {
  patientName: string;
  charge:      Decimal;    // billedAmount
  labFee:      Decimal;    // from Treatment.labFee (or LabJob.invoiceAmount)
  netAmount:   Decimal;    // charge − labFee
  splitRate:   Decimal;
  collection:  Decimal;    // netAmount × splitRate / 100
}

export interface AlignerCase {
  patientName:    string;
  totalTreatment: Decimal;  // billedAmount
  labFees:        Decimal;  // Treatment.labFee / LabJob
  balance:        Decimal;  // totalTreatment − labFees
  paidLocum:      Decimal;  // prior locum payment for this case (default 0)
  collection:     Decimal;  // (balance − paidLocum) ×, or balance × splitRate depending on setup
}

export interface AncillaryItem {
  key:    AncillaryKey;
  label:  string;
  amount: Decimal;   // full amount, NOT subject to split rate
}

export interface DeductionItem {
  description: string;
  patientName: string;
  amount:      Decimal;   // positive number; subtracted in finalPayout
}

export interface ReconciliationSummary {
  grossCollectionTotal:     Decimal;   // Σ standard daily net (pre-split)
  endoTotal:                Decimal;   // Σ endo net amounts (pre-split)
  dentureBridgeCrownTotal:  Decimal;   // Σ denture netAmount (charge − labFee, pre-split)
  alignerTotal:             Decimal;   // Σ aligner balance (totalTreatment − labFees, pre-split)
  grandSubTotal:            Decimal;   // raw total before the doctor's primary cut
  professionalFeePayout:    Decimal;   // grandSubTotal × splitRate%
  ancillaries:              AncillaryItem[];
  ancillaryTotal:           Decimal;
  deductions:               DeductionItem[];
  deductionTotal:           Decimal;
  finalPayout:              Decimal;   // professionalFeePayout + ancillaryTotal − deductionTotal
}

export interface DoctorPayrollPayload {
  doctorId:                string;
  month:                   string;
  splitRate:               Decimal;
  dailyCollections:        DailyCollection[];
  endoCases:               EndoCase[];
  dentureBridgeCrownCases: DentureBridgeCrownCase[];
  alignerCases:            AlignerCase[];
  /** Lab cases deferred until LabJob.status === "FITTED". Not included in totals. */
  pendingLabCases:         PendingLabCase[];
  summary:                 ReconciliationSummary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw treatment shape (normalised from Prisma result)
// ─────────────────────────────────────────────────────────────────────────────

export interface RawTreatmentInput {
  id:              string;
  visitDate:       Date;
  patientName:     string;
  typeCode:        string;
  billedAmount:    Decimal;
  /** Actual cash collected so far. Defaults to billedAmount when omitted.
   *  Used for ALIGNER commission (pay on collection, not on billing). */
  collectedAmount?: Decimal;
  labFee:          Decimal;
  sst:             Decimal;
  doctorSplit:     Decimal;
  toothCodes:      string;
  paidLocum:       Decimal;
  /** "ORDERED" | "SENT_TO_LAB" | "RECEIVED" | "FITTED" | undefined
   *  When set for DENTURE_BRIDGE_CROWN cases: only FITTED earns commission. */
  labJobStatus?:   string;
  isDeduction?:    boolean;
  deductionLabel?: string;
}

/** A lab-work case whose commission is deferred until the lab job is fitted. */
export interface PendingLabCase {
  patientName:    string;
  typeCode:       string;
  labJobStatus:   string;       // current lab status
  billedAmount:   Decimal;
  labFee:         Decimal;
  netAmount:      Decimal;      // commission that WILL be earned once fitted
  splitRate:      Decimal;
  projectedComm:  Decimal;      // netAmount × splitRate% — shown for planning
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure calculation — no Prisma dependency (fully unit-testable)
// ─────────────────────────────────────────────────────────────────────────────

export function buildPayload(
  doctorId:   string,
  month:      string,
  splitRate:  Decimal,
  treatments: RawTreatmentInput[],
  extraDeductions: DeductionItem[] = [],
): DoctorPayrollPayload {

  const split = splitRate.div(100);

  // ── Bucket treatments ────────────────────────────────────────────────────
  const dailyMap    = new Map<string, Decimal>();
  const endoCases:    EndoCase[]               = [];
  const dentureCases: DentureBridgeCrownCase[] = [];
  const alignerCases: AlignerCase[]            = [];
  const pendingLabCases: PendingLabCase[]      = [];

  const ancillaryMap: Map<AncillaryKey, Decimal> = new Map();
  const deductions: DeductionItem[] = [...extraDeductions];

  for (const t of treatments) {
    const bucket = classifyTreatment(t.typeCode);
    const dateKey = t.visitDate.toISOString().slice(0, 10);

    if (t.isDeduction && t.deductionLabel) {
      deductions.push({
        description: t.deductionLabel,
        patientName: t.patientName,
        amount:      t.billedAmount.abs(),
      });
      continue;
    }

    switch (bucket) {
      case "STANDARD": {
        const net = t.billedAmount.minus(t.labFee).minus(t.sst);
        dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? new Decimal(0)).plus(net));
        break;
      }

      case "ENDO": {
        const net        = t.billedAmount.minus(t.labFee).minus(t.sst);
        const collection = net.mul(split).toDecimalPlaces(2);
        endoCases.push({
          patientName: t.patientName,
          toothCodes:  t.toothCodes || "—",
          amount:      net.toDecimalPlaces(2),
          splitRate,
          collection,
        });
        break;
      }

      case "DENTURE_BRIDGE_CROWN": {
        // ── Deferred commission rule ────────────────────────────────────
        // Lab cases only earn commission once the LabJob is FITTED.
        // If labJobStatus is present and not FITTED, park in pendingLabCases.
        if (t.labJobStatus && t.labJobStatus !== "FITTED") {
          const netAmount = t.billedAmount.minus(t.labFee).toDecimalPlaces(2);
          pendingLabCases.push({
            patientName:   t.patientName,
            typeCode:      t.typeCode,
            labJobStatus:  t.labJobStatus,
            billedAmount:  t.billedAmount.toDecimalPlaces(2),
            labFee:        t.labFee.toDecimalPlaces(2),
            netAmount,
            splitRate,
            projectedComm: netAmount.mul(split).toDecimalPlaces(2),
          });
          break;
        }
        const charge     = t.billedAmount;
        const labFee     = t.labFee;
        const netAmount  = charge.minus(labFee).toDecimalPlaces(2);
        const collection = netAmount.mul(split).toDecimalPlaces(2);
        dentureCases.push({
          patientName: t.patientName,
          charge:      charge.toDecimalPlaces(2),
          labFee:      labFee.toDecimalPlaces(2),
          netAmount,
          splitRate,
          collection,
        });
        break;
      }

      case "ALIGNER": {
        // ── Collection-based commission rule ────────────────────────────
        // Ortho commission is based on what has actually been collected,
        // not the full billed amount. If the patient has paid 50%, only
        // 50% of the commission is due.
        const totalTreatment = t.billedAmount.toDecimalPlaces(2);
        const collected      = (t.collectedAmount ?? t.billedAmount).toDecimalPlaces(2);
        const labFees        = t.labFee.toDecimalPlaces(2);
        // Balance is based on collected (not billed) minus lab fees already allocated
        const labFeeOnCollected = totalTreatment.gt(0)
          ? labFees.mul(collected).div(totalTreatment).toDecimalPlaces(2)
          : labFees;
        const balance   = Decimal.max(collected.minus(labFeeOnCollected), new Decimal(0)).toDecimalPlaces(2);
        const paidLocum = t.paidLocum.toDecimalPlaces(2);
        const collection = Decimal.max(
          balance.minus(paidLocum).mul(split),
          new Decimal(0)
        ).toDecimalPlaces(2);
        alignerCases.push({
          patientName:    t.patientName,
          totalTreatment,       // full billed amount (for reference)
          labFees,
          balance,              // collection-adjusted balance
          paidLocum,
          collection,
        });
        break;
      }

      case "OPG":
      case "LATERAL":
      case "SCAN":
      case "CBCT":
      case "EMS": {
        const key = bucket as AncillaryKey;
        ancillaryMap.set(key, (ancillaryMap.get(key) ?? new Decimal(0)).plus(t.billedAmount));
        break;
      }
    }
  }

  // ── Daily collection array (sorted by date) ──────────────────────────────
  const dailyCollections: DailyCollection[] = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount: amount.toDecimalPlaces(2) }));

  // ── Ancillary list ───────────────────────────────────────────────────────
  const ANCILLARY_LABELS: Record<AncillaryKey, string> = {
    OPG:     "OPG X-Ray",
    LATERAL: "Lateral Cephalometric X-Ray",
    SCAN:    "Intraoral Scan",
    CBCT:    "CBCT",
    EMS:     "EMS / Air-Flow",
  };
  const ancillaries: AncillaryItem[] = (Object.keys(ANCILLARY_LABELS) as AncillaryKey[])
    .filter(k => ancillaryMap.has(k))
    .map(k => ({
      key:    k,
      label:  ANCILLARY_LABELS[k],
      amount: (ancillaryMap.get(k)!).toDecimalPlaces(2),
    }));

  // ── Reconciliation totals ─────────────────────────────────────────────────
  // All bucket totals are raw pre-split amounts so that grandSubTotal represents
  // the absolute collectible base before the doctor's cut is applied once.
  const grossCollectionTotal    = dailyCollections.reduce((s, d) => s.plus(d.amount),      new Decimal(0)).toDecimalPlaces(2);
  const endoTotal               = endoCases.reduce((s, e) => s.plus(e.amount),              new Decimal(0)).toDecimalPlaces(2);
  const dentureBridgeCrownTotal = dentureCases.reduce((s, d) => s.plus(d.netAmount),        new Decimal(0)).toDecimalPlaces(2);
  const alignerTotal            = alignerCases.reduce((s, a) => s.plus(a.balance),          new Decimal(0)).toDecimalPlaces(2);

  const grandSubTotal = grossCollectionTotal
    .plus(endoTotal)
    .plus(dentureBridgeCrownTotal)
    .plus(alignerTotal)
    .toDecimalPlaces(2);

  const professionalFeePayout = grandSubTotal.mul(split).toDecimalPlaces(2);

  const ancillaryTotal = ancillaries.reduce((s, a) => s.plus(a.amount), new Decimal(0)).toDecimalPlaces(2);
  const deductionTotal = deductions.reduce((s, d) => s.plus(d.amount), new Decimal(0)).toDecimalPlaces(2);

  const finalPayout = professionalFeePayout.plus(ancillaryTotal).minus(deductionTotal).toDecimalPlaces(2);

  const summary: ReconciliationSummary = {
    grossCollectionTotal,
    endoTotal,
    dentureBridgeCrownTotal,
    alignerTotal,
    grandSubTotal,
    professionalFeePayout,
    ancillaries,
    ancillaryTotal,
    deductions,
    deductionTotal,
    finalPayout,
  };

  return {
    doctorId,
    month,
    splitRate,
    dailyCollections,
    endoCases,
    dentureBridgeCrownCases: dentureCases,
    alignerCases,
    pendingLabCases,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL CALCULATION ENGINE
// Three doctor pay types + flat modifiers (ancillary incentives, disciplinary)
// ─────────────────────────────────────────────────────────────────────────────

export type DoctorPayType = "PURE_SALARIED" | "LOCUM_WITH_FLOOR" | "PURE_PROF_FEES";

/**
 * Flat incentive rates paid per occurrence of each ancillary scan type.
 * These are NOT subject to the split %. They are added directly to the payout.
 */
export interface AncillaryIncentiveConfig {
  OPG?:     Decimal;
  LATERAL?: Decimal;
  SCAN?:    Decimal;
  CBCT?:    Decimal;
  EMS?:     Decimal;
}

export const DEFAULT_ANCILLARY_RATES: Required<AncillaryIncentiveConfig> = {
  OPG:     new Decimal(20),
  LATERAL: new Decimal(15),
  SCAN:    new Decimal(15),
  CBCT:    new Decimal(50),
  EMS:     new Decimal(30),
};

export interface DisciplinaryDeduction {
  description: string;
  amount:      Decimal;  // positive value — subtracted from total
}

export interface AncillaryIncentiveLine {
  key:         AncillaryKey;
  label:       string;
  count:       number;
  ratePerItem: Decimal;
  total:       Decimal;
}

/** Per-treatment input for the payroll calculation engine. */
export interface PayrollTreatmentInput {
  typeCode:     string;
  billedAmount: Decimal;
  labFee:       Decimal;
  sst:          Decimal;
  splitRate:    Decimal;  // doctor's cut % (0–100)
}

export interface PayrollCalculationInput {
  doctorId:  string;
  monthStr:  string;
  payType:   DoctorPayType;
  // Type 1 fields
  baseSalary:  Decimal;
  allowances:  Decimal;
  // Type 2 field
  guaranteedFloor: Decimal;
  // Treatment list
  treatments: PayrollTreatmentInput[];
  // Modifiers
  ancillaryRates:         AncillaryIncentiveConfig;
  disciplinaryDeductions: DisciplinaryDeduction[];
}

export interface PayrollResult {
  doctorId:  string;
  month:     string;
  payType:   DoctorPayType;

  // ── Step 1 ──────────────────────────────────────────────────────────────
  /** Sum of (billedAmount − labFee − sst) × splitRate% across all clinical treatments. */
  professionalFeesCut: Decimal;

  // ── Step 2 ──────────────────────────────────────────────────────────────
  /** Type 1 only — fixed base salary. Zero for other types. */
  baseSalary:      Decimal;
  /** Type 1 only — fixed allowances. Zero for other types. */
  allowances:      Decimal;
  /** Type 2 only — sessions × dayRate floor. Zero for other types. */
  guaranteedFloor: Decimal;
  /** Winner after type-branch logic. */
  finalBasePay:    Decimal;

  // ── Step 3 ──────────────────────────────────────────────────────────────
  ancillaryAdditions:    AncillaryIncentiveLine[];
  ancillaryTotal:        Decimal;
  disciplinaryDeductions: DisciplinaryDeduction[];
  deductionTotal:        Decimal;

  // ── Final ────────────────────────────────────────────────────────────────
  /** finalBasePay + ancillaryTotal − deductionTotal */
  totalPayablePayout: Decimal;
  /** Treatments where all doctors' splits do not sum to 100%. */
  splitWarnings?: { treatmentId: string; totalSplit: number }[];
}

const ANCILLARY_INCENTIVE_LABELS: Record<AncillaryKey, string> = {
  OPG:     "OPG X-Ray Incentive",
  LATERAL: "Lateral Cephalometric Incentive",
  SCAN:    "Intraoral Scan Incentive",
  CBCT:    "CBCT Incentive",
  EMS:     "EMS / Air-Flow Incentive",
};

/**
 * Pure payroll calculation — no I/O, fully unit-testable.
 *
 * Pipeline:
 *   Step 1  → professionalFeesCut   = Σ (net × splitRate%)
 *   Step 2  → finalBasePay          = type-branch logic
 *   Step 3  → totalPayablePayout    = finalBasePay + ancillaryTotal − deductionTotal
 */
export function calculatePayrollPayload(
  input: PayrollCalculationInput,
): PayrollResult {

  // ── STEP 1: Professional fees cut ────────────────────────────────────────
  let professionalFeesCut = new Decimal(0);
  const ancillaryCounts   = new Map<AncillaryKey, number>();

  for (const t of input.treatments) {
    const bucket = classifyTreatment(t.typeCode);

    if (bucket === "OPG" || bucket === "LATERAL" || bucket === "SCAN" ||
        bucket === "CBCT" || bucket === "EMS") {
      const key = bucket as AncillaryKey;
      ancillaryCounts.set(key, (ancillaryCounts.get(key) ?? 0) + 1);
    } else {
      // All clinical buckets (STANDARD, ENDO, DENTURE_BRIDGE_CROWN, ALIGNER)
      // contribute to the professional fees cut
      const net = t.billedAmount.minus(t.labFee).minus(t.sst);
      professionalFeesCut = professionalFeesCut.plus(
        net.mul(t.splitRate).div(100),
      );
    }
  }
  professionalFeesCut = professionalFeesCut.toDecimalPlaces(2);

  // ── STEP 2: Apply doctor pay-type branch ─────────────────────────────────
  let finalBasePay:    Decimal;
  let baseSalary      = new Decimal(0);
  let allowances      = new Decimal(0);
  let guaranteedFloor = new Decimal(0);

  switch (input.payType) {
    case "PURE_SALARIED":
      // Clinical output tracked but does NOT change base pay
      baseSalary   = input.baseSalary;
      allowances   = input.allowances;
      finalBasePay = baseSalary.plus(allowances).toDecimalPlaces(2);
      break;

    case "LOCUM_WITH_FLOOR":
      guaranteedFloor = input.guaranteedFloor;
      // Higher of clinical cut or floor
      finalBasePay = Decimal.max(professionalFeesCut, guaranteedFloor)
        .toDecimalPlaces(2);
      break;

    case "PURE_PROF_FEES":
      // Strictly clinical — attendance/floor irrelevant
      finalBasePay = professionalFeesCut;
      break;
  }

  // ── STEP 3A: Ancillary incentives (flat per-occurrence bonus) ─────────────
  const ancillaryAdditions: AncillaryIncentiveLine[] = [];

  for (const [key, count] of ancillaryCounts.entries()) {
    const ratePerItem = input.ancillaryRates[key]
      ?? DEFAULT_ANCILLARY_RATES[key]
      ?? new Decimal(0);
    if (ratePerItem.gt(0) && count > 0) {
      ancillaryAdditions.push({
        key,
        label:       ANCILLARY_INCENTIVE_LABELS[key],
        count,
        ratePerItem: ratePerItem.toDecimalPlaces(2),
        total:       ratePerItem.mul(count).toDecimalPlaces(2),
      });
    }
  }

  const ancillaryTotal = ancillaryAdditions
    .reduce((s, a) => s.plus(a.total), new Decimal(0))
    .toDecimalPlaces(2);

  // ── STEP 3B: Disciplinary deductions ─────────────────────────────────────
  const deductionTotal = input.disciplinaryDeductions
    .reduce((s, d) => s.plus(d.amount), new Decimal(0))
    .toDecimalPlaces(2);

  // ── FINAL ────────────────────────────────────────────────────────────────
  const totalPayablePayout = finalBasePay
    .plus(ancillaryTotal)
    .minus(deductionTotal)
    .toDecimalPlaces(2);

  return {
    doctorId:              input.doctorId,
    month:                 input.monthStr,
    payType:               input.payType,
    professionalFeesCut,
    baseSalary,
    allowances,
    guaranteedFloor,
    finalBasePay,
    ancillaryAdditions,
    ancillaryTotal,
    disciplinaryDeductions: input.disciplinaryDeductions,
    deductionTotal,
    totalPayablePayout,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma serialisation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively convert all Decimal fields to plain numbers for JSON storage.
 * We traverse first rather than relying on JSON.stringify's replacer because
 * decimal.js defines toJSON() = toString(), which fires before the replacer
 * and produces strings instead of numbers.
 */
export function serialisePayload(payload: DoctorPayrollPayload): object {
  function traverse(val: unknown): unknown {
    if (val instanceof Decimal) return val.toNumber();
    if (Array.isArray(val)) return val.map(traverse);
    if (val !== null && typeof val === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val)) out[k] = traverse(v);
      return out;
    }
    return val;
  }
  return traverse(payload) as object;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration — fetches from DB, calls buildPayload, upserts statement
// ─────────────────────────────────────────────────────────────────────────────

const prismaDefault = new PrismaClient();

/**
 * Orchestration layer: reads doctor profile + treatments from DB,
 * determines pay type, runs the pure calculatePayrollPayload engine,
 * and persists the result into DoctorCommission rows (DRAFT).
 *
 * Returns the full PayrollResult so the caller can preview before committing.
 */
export async function calculateDoctorPayrollPayload(
  doctorId: string,
  monthStr: string,
  options?: {
    ancillaryRates?:         AncillaryIncentiveConfig;
    disciplinaryDeductions?: DisciplinaryDeduction[];
  },
  prisma: PrismaClient = prismaDefault,
): Promise<PayrollResult> {

  const [y, m] = monthStr.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to   = new Date(y, m,     1);

  // ── 1. Load doctor profile ────────────────────────────────────────────────
  const doctor = await prisma.doctorProfile.findUniqueOrThrow({
    where:   { id: doctorId },
    include: {
      user:        { select: { id: true } },
      engagements: { where: { month: monthStr } },
    },
  });

  const staffProfile = await prisma.staffProfile.findUnique({
    where: { userId: doctor.userId },
  });

  const engagement = doctor.engagements[0] ?? null;

  // ── 2. Resolve pay type ───────────────────────────────────────────────────
  const hasSalary     = !!(staffProfile?.basicSalary && Number(staffProfile.basicSalary) > 0);
  const hasEngagement = !!engagement;

  let payType: DoctorPayType;
  if (doctor.type === "LOCUM") {
    payType = "LOCUM_WITH_FLOOR";
  } else if (hasSalary) {
    // Permanent with salary — pure salaried unless engagement makes it hybrid.
    // Hybrid (DUAL_SLIP) not in scope for this engine; treated as PURE_SALARIED.
    payType = "PURE_SALARIED";
  } else {
    payType = "PURE_PROF_FEES";
  }

  // Guaranteed floor: use engagement total when present; else sessions × dayRate
  const dayRate = new Decimal((doctor.dayRate ?? 0).toString());
  const guaranteedFloor = engagement
    ? new Decimal(engagement.guaranteedFloor.toString())
    : new Decimal(0);

  // ── 3. Fetch treatments ───────────────────────────────────────────────────
  const raw = await prisma.treatment.findMany({
    where: {
      doctorId,
      visit: { visitDate: { gte: from, lt: to }, deletedAt: null },
    },
    include: {
      treatmentType: { select: { code: true } },
      labJob:        { select: { invoiceAmount: true, estimatedFee: true } },
    },
    orderBy: { visit: { visitDate: "asc" } },
  });

  const treatments: PayrollTreatmentInput[] = raw.map(t => {
    const effectiveLabFee = Number(t.labFee) > 0
      ? new Decimal(t.labFee.toString())
      : t.labJob?.invoiceAmount
        ? new Decimal(t.labJob.invoiceAmount.toString())
        : t.labJob?.estimatedFee
          ? new Decimal(t.labJob.estimatedFee.toString())
          : new Decimal(0);

    return {
      typeCode:     t.treatmentType.code,
      billedAmount: new Decimal(t.billedAmount.toString()),
      labFee:       effectiveLabFee,
      sst:          new Decimal(t.sst.toString()),
      splitRate:    new Decimal(t.doctorSplit.toString()),
    };
  });

  // ── 4. Run pure calculation engine ───────────────────────────────────────
  const result = calculatePayrollPayload({
    doctorId,
    monthStr,
    payType,
    baseSalary:  new Decimal((staffProfile?.basicSalary ?? 0).toString()),
    allowances:  new Decimal(0),
    guaranteedFloor,
    treatments,
    ancillaryRates:         options?.ancillaryRates         ?? {},
    disciplinaryDeductions: options?.disciplinaryDeductions ?? [],
  });

  // ── 5. Persist DoctorCommission DRAFT rows ────────────────────────────────
  const doctorRate = new Decimal(doctor.defaultRate.toString());
  for (const t of raw) {
    const net        = new Decimal(t.billedAmount.toString())
      .minus(t.labFee.toString())
      .minus(t.sst.toString());
    const commission = net.mul(t.doctorSplit.toString()).div(100).toDecimalPlaces(2);

    await (prisma.doctorCommission as any).upsert({
      where:  { treatmentId_doctorId: { treatmentId: t.id, doctorId } },
      create: {
        treatmentId:     t.id,
        doctorId,
        month:           monthStr,
        txAmount:        Number(t.billedAmount),
        labFee:          Number(t.labFee),
        doctorSplit:     Number(t.doctorSplit),
        doctorRate:      doctorRate.toNumber(),
        commission:      commission.toNumber(),
        guaranteedFloor: guaranteedFloor.toNumber(),
        finalPayout:     commission.toNumber(),
        isTopUp:         false,
        status:          "DRAFT",
      },
      update: {
        txAmount:        Number(t.billedAmount),
        labFee:          Number(t.labFee),
        doctorSplit:     Number(t.doctorSplit),
        doctorRate:      doctorRate.toNumber(),
        commission:      commission.toNumber(),
        guaranteedFloor: guaranteedFloor.toNumber(),
        finalPayout:     commission.toNumber(),
      },
    });
  }

  // ── 6. Split validation ──────────────────────────────────────────────────
  // Check that all DoctorCommission rows for the same treatment sum to 100%.
  // This catches cases where a treatment was shared between doctors but the
  // splits were entered incorrectly (e.g. two doctors both set to 100%).
  const allCommRows = await prisma.doctorCommission.findMany({
    where:  { month: monthStr, treatmentId: { in: raw.map(t => t.id) } },
    select: { treatmentId: true, doctorSplit: true, doctorId: true },
  });

  const splitByTreatment = new Map<string, number>();
  for (const row of allCommRows) {
    splitByTreatment.set(
      row.treatmentId,
      (splitByTreatment.get(row.treatmentId) ?? 0) + Number(row.doctorSplit),
    );
  }

  const splitWarnings: { treatmentId: string; totalSplit: number }[] = [];
  for (const [treatmentId, totalSplit] of splitByTreatment.entries()) {
    if (Math.abs(totalSplit - 100) > 0.01) {
      splitWarnings.push({ treatmentId, totalSplit });
    }
  }

  if (splitWarnings.length > 0) {
    (result as any).splitWarnings = splitWarnings;
  }

  return result;
}

/**
 * Generates (or regenerates) a LocumReconciliationStatement for a locum doctor.
 * Uses buildPayload() — the clinical-slip renderer — to bucket treatments into
 * the daily grid, endo, denture, aligner, and ancillary sections.
 *
 * splitRate defaults to DoctorProfile.defaultRate but can be overridden
 * (e.g. 42% for a negotiated engagement rate).
 */
export async function generateLocumStatement(
  doctorId:  string,
  monthStr:  string,
  splitRateOverride?: Decimal,
  extraDeductions: DeductionItem[] = [],
  prisma: PrismaClient = prismaDefault,
): Promise<{ statementId: string; finalPayout: Decimal }> {

  const [y, m] = monthStr.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to   = new Date(y, m,     1);

  // ── 1. Load doctor profile to get split rate ──────────────────────────────
  const doctor = await prisma.doctorProfile.findUniqueOrThrow({
    where: { id: doctorId },
    select: { defaultRate: true },
  });

  const splitRate = splitRateOverride ?? new Decimal(doctor.defaultRate.toString());

  // ── 2. Fetch treatments with full clinical slip details ───────────────────
  const raw = await prisma.treatment.findMany({
    where: {
      doctorId,
      visit: { visitDate: { gte: from, lt: to }, deletedAt: null },
    },
    include: {
      treatmentType: { select: { code: true } },
      visit: {
        select: {
          visitDate:    true,
          patient:      { select: { name: true } },
          toothRecords: { select: { toothCode: true } },
        },
      },
      labJob: { select: { invoiceAmount: true, estimatedFee: true, status: true } },
    },
    orderBy: { visit: { visitDate: "asc" } },
  });

  const treatments: RawTreatmentInput[] = raw.map(t => {
    const effectiveLabFee = Number(t.labFee) > 0
      ? new Decimal(t.labFee.toString())
      : t.labJob?.invoiceAmount
        ? new Decimal(t.labJob.invoiceAmount.toString())
        : t.labJob?.estimatedFee
          ? new Decimal(t.labJob.estimatedFee.toString())
          : new Decimal(0);

    return {
      id:              t.id,
      visitDate:       t.visit.visitDate,
      patientName:     t.visit.patient.name,
      typeCode:        t.treatmentType.code,
      billedAmount:    new Decimal(t.billedAmount.toString()),
      collectedAmount: new Decimal(t.collectedAmount.toString()),
      labFee:          effectiveLabFee,
      sst:             new Decimal(t.sst.toString()),
      doctorSplit:     new Decimal(t.doctorSplit.toString()),
      toothCodes:      t.visit.toothRecords.map(r => r.toothCode).join(", "),
      paidLocum:       new Decimal(0),
      labJobStatus:    t.labJob?.status ?? undefined,
    };
  });

  // ── 3. Build the clinical-slip payload ────────────────────────────────────
  const payload = buildPayload(doctorId, monthStr, splitRate, treatments, extraDeductions);

  // ── 4. Upsert LocumReconciliationStatement ────────────────────────────────
  const stmt = await (prisma as any).locumReconciliationStatement.upsert({
    where:  { doctorId_month: { doctorId, month: monthStr } },
    create: {
      doctorId,
      month:       monthStr,
      splitRate:   splitRate.toNumber(),
      payload:     serialisePayload(payload),
      finalPayout: payload.summary.finalPayout.toNumber(),
      status:      "DRAFT",
    },
    update: {
      splitRate:   splitRate.toNumber(),
      payload:     serialisePayload(payload),
      finalPayout: payload.summary.finalPayout.toNumber(),
      status:      "DRAFT",
    },
    select: { id: true },
  });

  return { statementId: stmt.id, finalPayout: payload.summary.finalPayout };
}
