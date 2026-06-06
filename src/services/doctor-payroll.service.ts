/**
 * Doctor Comprehensive Payroll Service
 *
 * Handles four strict contractual archetypes for doctor compensation.
 * All arithmetic uses decimal.js to avoid IEEE-754 floating-point drift.
 *
 * Archetype resolution is inferred from existing schema fields:
 *   - PERMANENT + StaffProfile(basicSalary>0) + no LocumEngagement → TYPE_1_PURE_SALARIED
 *   - LOCUM     + LocumEngagement                                   → TYPE_2_LOCUM_WITH_FLOOR
 *   - PERMANENT + no StaffProfile (or basicSalary=0)               → TYPE_3_PURE_PROF_FEES
 *   - PERMANENT + StaffProfile(basicSalary>0) + LocumEngagement    → TYPE_4_DUAL_SLIP_HYBRID
 */

import Decimal from "decimal.js";
import { PrismaClient, Prisma } from "@prisma/client";
import { prisma as prismaDefault } from "@/lib/prisma";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type ContractType =
  | "PURE_SALARIED"
  | "LOCUM_WITH_FLOOR"
  | "PURE_PROF_FEES"
  | "DUAL_SLIP_HYBRID";

export interface StatutoryBreakdown {
  epfEmployee:   Decimal;
  epfEmployer:   Decimal;
  socsoEmployee: Decimal;
  socsoEmployer: Decimal;
  eisEmployee:   Decimal;
  eisEmployer:   Decimal;
  /** Sum of both employee AND employer sides — the full statutory burden. */
  totalBurden:   Decimal;
}

export interface SalarySlipBreakdown {
  basic:               Decimal;
  performanceIncentive: Decimal;
  epfEmployee:         Decimal;
  epfEmployer:         Decimal;
  socsoEmployee:       Decimal;
  socsoEmployer:       Decimal;
  eisEmployee:         Decimal;
  eisEmployer:         Decimal;
  /** Doctor's take-home: basic + incentive − employee statutory deductions. */
  netSalary:           Decimal;
}

export interface DoctorPayrollResult {
  doctorId:              string;
  contractType:          ContractType;
  grossCalculatedTarget: Decimal;
  disbursement: {
    salarySlip:     SalarySlipBreakdown;
    serviceVoucher: { professionalFees: Decimal };
  };
  /** Ready-to-execute Prisma operations — pass directly to prisma.$transaction(). */
  ops: Prisma.PrismaPromise<unknown>[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal data shapes (avoids Decimal noise from Prisma's Decimal columns)
// ─────────────────────────────────────────────────────────────────────────────

export interface TreatmentInput {
  id:           string;
  billedAmount: Decimal;
  labFee:       Decimal;
  sst:          Decimal;
  doctorSplit:  Decimal; // 0-100
}

export interface AttendanceInput {
  totalWorkDays: number;
  attendedDays:  Decimal;
}

/** Type 4 configuration knobs — defaults reflect the worked example in the spec. */
export interface DualSlipConfig {
  /** Hard cap allocated to the salaried portion (e.g. 11 000). */
  salaryCap:    Decimal;
  /** Fixed basic salary within the salaried portion (e.g. 6 000). */
  basicSalary:  Decimal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Malaysian statutory rates
// Note: SOCSO & EIS have contribution ceilings in production — enforce them
// in the PayrollRun layer by passing pre-computed contributions instead.
// ─────────────────────────────────────────────────────────────────────────────

const RATES = {
  EPF_EMPLOYEE:   new Decimal("0.11"),
  /** 13% for gross ≤ RM 5 000; 12% above. Applied per call. */
  EPF_EMPLOYER_LOW:  new Decimal("0.13"),
  EPF_EMPLOYER_HIGH: new Decimal("0.12"),
  EPF_THRESHOLD:  new Decimal("5000"),
  SOCSO_EMPLOYEE: new Decimal("0.005"),
  SOCSO_EMPLOYER: new Decimal("0.0175"),
  EIS_EMPLOYEE:   new Decimal("0.002"),
  EIS_EMPLOYER:   new Decimal("0.002"),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Pure calculation helpers (fully unit-testable, no I/O dependencies)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves contract archetype from profile attributes.
 * Source of truth for all four archetype branches.
 */
export function resolveArchetype(
  doctorType:    "LOCUM" | "PERMANENT",
  hasSalary:     boolean,
  hasEngagement: boolean,
): ContractType {
  if (doctorType === "LOCUM")                           return "LOCUM_WITH_FLOOR";
  if (doctorType === "PERMANENT" && hasSalary && hasEngagement) return "DUAL_SLIP_HYBRID";
  if (doctorType === "PERMANENT" && hasSalary)           return "PURE_SALARIED";
  return "PURE_PROF_FEES";
}

/**
 * Net clinical split across a treatment array.
 * Net = (billedAmount − labFee − sst) × (doctorSplit / 100)
 * SST is excluded because it is collected on behalf of the government.
 */
export function calculateClinicalFees(treatments: TreatmentInput[]): Decimal {
  return treatments.reduce((acc, t) => {
    const net  = t.billedAmount.minus(t.labFee).minus(t.sst);
    const split = net.mul(t.doctorSplit).div(100);
    return acc.plus(split);
  }, new Decimal(0));
}

/**
 * Locum floor: sessionsWorked × dayRate.
 * The guaranteed floor from LocumEngagement is stored as the per-session rate
 * (see lib/commission.ts applyLocumFloor for precedent).
 */
export function calculateLocumFloor(
  sessionsWorked: number,
  dayRate: Decimal,
): Decimal {
  return dayRate.mul(sessionsWorked);
}

/**
 * Compute Malaysian statutory contributions on a given gross salary.
 * Returns both employee (deducted from pay) and employer (additional cost).
 */
export function computeStatutory(grossSalary: Decimal): StatutoryBreakdown {
  const epfEmployee   = grossSalary.mul(RATES.EPF_EMPLOYEE).toDecimalPlaces(2);
  const epfEmployer   = grossSalary
    .mul(grossSalary.lte(RATES.EPF_THRESHOLD) ? RATES.EPF_EMPLOYER_LOW : RATES.EPF_EMPLOYER_HIGH)
    .toDecimalPlaces(2);
  const socsoEmployee = grossSalary.mul(RATES.SOCSO_EMPLOYEE).toDecimalPlaces(2);
  const socsoEmployer = grossSalary.mul(RATES.SOCSO_EMPLOYER).toDecimalPlaces(2);
  const eisEmployee   = grossSalary.mul(RATES.EIS_EMPLOYEE).toDecimalPlaces(2);
  const eisEmployer   = grossSalary.mul(RATES.EIS_EMPLOYER).toDecimalPlaces(2);

  const totalBurden = epfEmployee
    .plus(epfEmployer)
    .plus(socsoEmployee)
    .plus(socsoEmployer)
    .plus(eisEmployee)
    .plus(eisEmployer);

  return { epfEmployee, epfEmployer, socsoEmployee, socsoEmployer, eisEmployee, eisEmployer, totalBurden };
}

/** Build a zero-value SalarySlipBreakdown (for archetypes with no salary component). */
export function zeroSalarySlip(): SalarySlipBreakdown {
  const Z = new Decimal(0);
  return { basic: Z, performanceIncentive: Z, epfEmployee: Z, epfEmployer: Z,
           socsoEmployee: Z, socsoEmployer: Z, eisEmployee: Z, eisEmployer: Z, netSalary: Z };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-archetype calculation engines
// ─────────────────────────────────────────────────────────────────────────────

/** TYPE_1: Fixed salary + allowances, attendance-independent. */
export function calculateType1(
  basicSalary: Decimal,
  allowances:  Decimal,
): { grossTarget: Decimal; salarySlip: SalarySlipBreakdown } {
  const grossTarget = basicSalary.plus(allowances);
  const stat        = computeStatutory(grossTarget);
  const netSalary   = grossTarget
    .minus(stat.epfEmployee)
    .minus(stat.socsoEmployee)
    .minus(stat.eisEmployee)
    .toDecimalPlaces(2);

  const slip: SalarySlipBreakdown = {
    basic:                basicSalary,
    performanceIncentive: allowances,
    epfEmployee:          stat.epfEmployee,
    epfEmployer:          stat.epfEmployer,
    socsoEmployee:        stat.socsoEmployee,
    socsoEmployer:        stat.socsoEmployer,
    eisEmployee:          stat.eisEmployee,
    eisEmployer:          stat.eisEmployer,
    netSalary,
  };
  return { grossTarget, salarySlip: slip };
}

/** TYPE_2: MAX(clinicalFees, locumFloor). No salary slip — pure service voucher. */
export function calculateType2(
  clinicalFees: Decimal,
  locumFloor:   Decimal,
): { grossTarget: Decimal } {
  return { grossTarget: Decimal.max(clinicalFees, locumFloor).toDecimalPlaces(2) };
}

/** TYPE_3: Strictly clinical split — attendance has no bearing. */
export function calculateType3(
  clinicalFees: Decimal,
): { grossTarget: Decimal } {
  return { grossTarget: clinicalFees.toDecimalPlaces(2) };
}

/**
 * TYPE_4: Gross via locum formula → split into salary slip + service voucher.
 *
 * Spec example (all values in RM):
 *   grossTarget      = 15 000
 *   salaryCap        = 11 000
 *   basicSalary      =  6 000
 *   statutoryBurden  =  2 000  (employee + employer on the pre-statutory gross)
 *   performanceInc   =  3 000  (residual: salaryCap − basicSalary − statutoryBurden)
 *   serviceVoucher   =  4 000  (grossTarget − salaryCap)
 *
 * The statutory burden is computed on the pre-statutory gross (basicSalary + performanceIncentive).
 * Because it is a combined bucket, both employee AND employer contributions are isolated
 * inside the salaryCap so Finance can render both lines accurately on a single slip.
 */
export function calculateType4(
  grossTarget: Decimal,
  cfg: DualSlipConfig,
): { salarySlip: SalarySlipBreakdown; serviceVoucher: { professionalFees: Decimal } } {
  // Guard: salaryCap cannot exceed the gross target
  const salaryCap = Decimal.min(cfg.salaryCap, grossTarget).toDecimalPlaces(2);

  // 1. Compute statutory burden on the basic salary first, then solve for incentive.
  //    We iterate once: treat the cap as the budget and back-solve.
  //    preGross = the portion that earns statutory (basic + incentive, BEFORE deductions).
  //    The full combined burden (employee + employer) is absorbed within salaryCap.
  //
  //    salaryCap = preGross + employerBurden
  //    preGross  = basicSalary + performanceIncentive
  //
  //    Employer burden rate on preGross:
  //      ER = EPF_ER + SOCSO_ER + EIS_ER
  //    So:  salaryCap = preGross × (1 + ER)
  //    ⇒   preGross  = salaryCap / (1 + ER)

  const ERR = (cfg.basicSalary.lte(RATES.EPF_THRESHOLD) ? RATES.EPF_EMPLOYER_LOW : RATES.EPF_EMPLOYER_HIGH)
    .plus(RATES.SOCSO_EMPLOYER)
    .plus(RATES.EIS_EMPLOYER);

  const preGross = salaryCap.div(new Decimal(1).plus(ERR)).toDecimalPlaces(2);

  // 2. Derive performance incentive (residual inside preGross after basic)
  const performanceIncentive = Decimal.max(
    preGross.minus(cfg.basicSalary),
    new Decimal(0),
  ).toDecimalPlaces(2);

  // 3. Compute full statutory on preGross
  const stat = computeStatutory(preGross);

  // 4. Doctor's take-home net (employee deductions only)
  const netSalary = preGross
    .minus(stat.epfEmployee)
    .minus(stat.socsoEmployee)
    .minus(stat.eisEmployee)
    .toDecimalPlaces(2);

  // 5. Service voucher = remainder outside the salary cap
  const professionalFees = grossTarget.minus(salaryCap).toDecimalPlaces(2);

  const salarySlip: SalarySlipBreakdown = {
    basic:                cfg.basicSalary,
    performanceIncentive,
    epfEmployee:          stat.epfEmployee,
    epfEmployer:          stat.epfEmployer,
    socsoEmployee:        stat.socsoEmployee,
    socsoEmployer:        stat.socsoEmployer,
    eisEmployee:          stat.eisEmployee,
    eisEmployer:          stat.eisEmployer,
    netSalary,
  };

  return { salarySlip, serviceVoucher: { professionalFees } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Master orchestration function
// ─────────────────────────────────────────────────────────────────────────────

function monthRange(monthStr: string): { from: Date; to: Date } {
  const [y, m] = monthStr.split("-").map(Number);
  return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
}

export async function calculateDoctorComprehensivePayroll(
  doctorId: string,
  monthStr: string,
  /** Injectable for testing or multi-tenant contexts. */
  prisma: PrismaClient = prismaDefault,
): Promise<DoctorPayrollResult> {

  // ── 1. Load doctor profile ──────────────────────────────────────────────
  const doctor = await prisma.doctorProfile.findUniqueOrThrow({
    where:   { id: doctorId },
    include: {
      user:        { select: { id: true, name: true } },
      engagements: { where: { month: monthStr } },
    },
  });

  // Locate linked StaffProfile (same userId)
  const staffProfile = await prisma.staffProfile.findUnique({
    where:   { userId: doctor.userId },
    include: {
      attendance: { where: { month: monthStr } },
    },
  });

  const engagement     = doctor.engagements[0] ?? null;
  const attendanceRow  = staffProfile?.attendance[0] ?? null;

  const hasSalary     = !!(staffProfile?.basicSalary && Number(staffProfile.basicSalary) > 0);
  const hasEngagement = !!engagement;

  // ── 2. Resolve archetype ────────────────────────────────────────────────
  const contractType = resolveArchetype(
    doctor.type as "LOCUM" | "PERMANENT",
    hasSalary,
    hasEngagement,
  );

  // ── 3. Resolve clinical fees from approved locum statement ──────────────
  // For all clinical archetypes the finalPayout from the Finance-approved
  // LocumReconciliationStatement is the authoritative figure — it has been
  // reviewed and signed by the doctor, the clinic manager, and finance.
  // Payroll cannot run until the statement reaches FINANCE_APPROVED or LOCKED.
  const needsClinical = contractType !== "PURE_SALARIED";
  let treatments: TreatmentInput[] = [];
  let approvedClinicalFees: Decimal | null = null;

  if (needsClinical) {
    const stmt = await (prisma as any).locumReconciliationStatement.findUnique({
      where:  { doctorId_month: { doctorId, month: monthStr } },
      select: { status: true, finalPayout: true },
    });

    if (!stmt || !["FINANCE_APPROVED", "LOCKED"].includes(stmt.status)) {
      throw new Error(
        `No Finance-approved locum statement found for doctor ${doctorId} month ${monthStr}. ` +
        `The statement must be signed by the doctor, approved by the clinic manager, and approved ` +
        `by finance before payroll can be calculated.`
      );
    }

    approvedClinicalFees = new Decimal(stmt.finalPayout.toString());

    // Still fetch treatments so ops[] (DoctorCommission rows) can be persisted.
    const { from, to } = monthRange(monthStr);
    const raw = await prisma.treatment.findMany({
      where: { doctorId, visit: { visitDate: { gte: from, lt: to }, deletedAt: null } },
    });
    treatments = raw.map(t => ({
      id:           t.id,
      billedAmount: new Decimal(t.billedAmount.toString()),
      labFee:       new Decimal(t.labFee.toString()),
      sst:          new Decimal(t.sst.toString()),
      doctorSplit:  new Decimal(t.doctorSplit.toString()),
    }));
  }

  // ── 4. Branch by archetype ──────────────────────────────────────────────

  let grossCalculatedTarget: Decimal;
  let salarySlip:     SalarySlipBreakdown;
  let serviceVoucher: { professionalFees: Decimal };
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  switch (contractType) {

    // ── TYPE 1: Pure Salaried ─────────────────────────────────────────────
    case "PURE_SALARIED": {
      const basic      = new Decimal((staffProfile!.basicSalary ?? 0).toString());
      const allowances = new Decimal(0); // extend via StaffProfile.allowances when available

      const r = calculateType1(basic, allowances);
      grossCalculatedTarget = r.grossTarget;
      salarySlip            = r.salarySlip;
      serviceVoucher        = { professionalFees: new Decimal(0) };
      break;
    }

    // ── TYPE 2: Locum with Guaranteed Floor ──────────────────────────────
    case "LOCUM_WITH_FLOOR": {
      const clinicalFees = approvedClinicalFees ?? calculateClinicalFees(treatments);
      // dayRate comes from DoctorProfile (per-session rate), NOT LocumEngagement.guaranteedFloor
      // LocumEngagement.guaranteedFloor stores the pre-computed total floor (sessions × rate).
      // We use it directly when present; otherwise fall back to sessions × profile dayRate.
      const sessions     = engagement?.sessionsWorked ?? 0;
      const dayRate      = new Decimal((doctor.dayRate ?? 0).toString());
      const floor        = engagement
        ? new Decimal(engagement.guaranteedFloor.toString())
        : calculateLocumFloor(sessions, dayRate);

      const r = calculateType2(clinicalFees, floor);
      grossCalculatedTarget = r.grossTarget;
      salarySlip            = zeroSalarySlip();
      serviceVoucher        = { professionalFees: grossCalculatedTarget };

      // Persist DoctorCommission rows per treatment
      const defaultRate = new Decimal(doctor.defaultRate.toString());
      for (const t of treatments) {
        const net   = t.billedAmount.minus(t.labFee).minus(t.sst);
        const split = net.mul(t.doctorSplit).div(100).toDecimalPlaces(2);
        ops.push(
          (prisma.doctorCommission as any).upsert({
            where:  { treatmentId_doctorId: { treatmentId: t.id, doctorId } },
            create: buildCommissionCreatePayload(t, doctorId, monthStr, split, floor, grossCalculatedTarget.gt(clinicalFees), defaultRate),
            update: buildCommissionCreatePayload(t, doctorId, monthStr, split, floor, grossCalculatedTarget.gt(clinicalFees), defaultRate),
          }),
        );
      }
      break;
    }

    // ── TYPE 3: Pure Professional Fees ───────────────────────────────────
    case "PURE_PROF_FEES": {
      const clinicalFees = approvedClinicalFees ?? calculateClinicalFees(treatments);
      const r = calculateType3(clinicalFees);
      grossCalculatedTarget = r.grossTarget;
      salarySlip            = zeroSalarySlip();
      serviceVoucher        = { professionalFees: grossCalculatedTarget };

      const defaultRate = new Decimal(doctor.defaultRate.toString());
      for (const t of treatments) {
        const net   = t.billedAmount.minus(t.labFee).minus(t.sst);
        const split = net.mul(t.doctorSplit).div(100).toDecimalPlaces(2);
        ops.push(
          (prisma.doctorCommission as any).upsert({
            where:  { treatmentId_doctorId: { treatmentId: t.id, doctorId } },
            create: buildCommissionCreatePayload(t, doctorId, monthStr, split, null, false, defaultRate),
            update: buildCommissionCreatePayload(t, doctorId, monthStr, split, null, false, defaultRate),
          }),
        );
      }
      break;
    }

    // ── TYPE 4: Dual-Slip Hybrid ──────────────────────────────────────────
    case "DUAL_SLIP_HYBRID": {
      const clinicalFees = approvedClinicalFees ?? calculateClinicalFees(treatments);
      // guaranteedFloor on the engagement IS the total floor (not per-session rate)
      const floor = new Decimal(engagement!.guaranteedFloor.toString());

      // Gross via locum formula (same as Type 2)
      grossCalculatedTarget = Decimal.max(clinicalFees, floor).toDecimalPlaces(2);

      // salaryCap = guaranteedFloor (the engagement total is the salary portion cap).
      // basicSalary sourced from StaffProfile.
      const rawBasic     = new Decimal((staffProfile!.basicSalary ?? 0).toString());
      const rawSalaryCap = floor;

      const cfg: DualSlipConfig = {
        salaryCap:   rawSalaryCap,
        basicSalary: rawBasic,
      };

      const r = calculateType4(grossCalculatedTarget, cfg);
      salarySlip     = r.salarySlip;
      serviceVoucher = r.serviceVoucher;

      // Commission rows per treatment (attributed to clinical portion)
      const defaultRate = new Decimal(doctor.defaultRate.toString());
      for (const t of treatments) {
        const net   = t.billedAmount.minus(t.labFee).minus(t.sst);
        const split = net.mul(t.doctorSplit).div(100).toDecimalPlaces(2);
        ops.push(
          (prisma.doctorCommission as any).upsert({
            where:  { treatmentId_doctorId: { treatmentId: t.id, doctorId } },
            create: buildCommissionCreatePayload(t, doctorId, monthStr, split, floor, grossCalculatedTarget.gt(clinicalFees), defaultRate),
            update: buildCommissionCreatePayload(t, doctorId, monthStr, split, floor, grossCalculatedTarget.gt(clinicalFees), defaultRate),
          }),
        );
      }
      break;
    }
  }

  return {
    doctorId,
    contractType,
    grossCalculatedTarget,
    disbursement: { salarySlip, serviceVoucher },
    ops,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildCommissionCreatePayload(
  t: TreatmentInput,
  doctorId: string,
  month: string,
  commission: Decimal,
  guaranteedFloor: Decimal | null,
  isTopUp: boolean,
  doctorRate: Decimal,
): object {
  return {
    treatmentId:     t.id,
    doctorId,
    month,
    txAmount:        t.billedAmount.toNumber(),
    labFee:          t.labFee.toNumber(),
    doctorSplit:     t.doctorSplit.toNumber(),
    doctorRate:      doctorRate.toNumber(),
    commission:      commission.toNumber(),
    guaranteedFloor: guaranteedFloor?.toNumber() ?? null,
    finalPayout:     commission.toNumber(),
    isTopUp,
    status:          "DRAFT",
  };
}
