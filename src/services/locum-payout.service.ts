/**
 * locum-payout.service.ts
 *
 * Implements the locum doctor payout workflow:
 *  - Category-specific commission release rules (One-Off, Multi-Stage, Ortho, Aligner)
 *  - 6-step verification gates (Counter → Doctor → Lab Fee → Completion → Release → Paid)
 *  - Monthly reconciliation: max(earned + flat rates, basicPayFloor)
 *
 * All public step functions throw WorkflowError on guard violations —
 * callers must catch and return appropriate HTTP error responses.
 */

import Decimal from "decimal.js";
import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─── Treatment category ──────────────────────────────────────────────────────

export type LocumTreatmentCategory =
  | "ONE_OFF"
  | "MULTI_STAGE"
  | "ORTHO_BONDING"
  | "ORTHO_DEBONDING"
  | "ALIGNER";

export type LocumPayoutStatus =
  | "ENTITLED"
  | "LOCKED_PENDING_COMPLETION"
  | "PENDING_RELEASE"
  | "PAID"
  | "VOIDED";

// Code prefix/substring patterns — match TreatmentType.code values (case-insensitive)
const CATEGORY_CODES = {
  // Multi-stage lab-bearing cases: funds locked until the whole case is complete
  MULTI_STAGE: ["ENDO", "RCT", "ROOT", "PULP", "PULPOTOMY", "PULPECTOMY",
                 "CROWN", "CR", "BRIDGE", "BR", "DENTURE", "DEN",
                 "VENEER", "CERAMIC", "PFM", "ZIRCONIA", "INLAY", "ONLAY"],
  // Ortho fixed braces — two distinct stages
  ORTHO_DEBOND: ["DEBOND", "DEBAND", "BRACE_REMOVAL", "ORTHO_REMOVAL"],
  ORTHO_BOND:   ["BOND", "BRACKET", "BRACE_FIT", "ORTHO_FIT", "ORTHO_START"],
  ORTHO_GENERAL:["ORTHO", "BRACES", "FIXED_APPLIANCE"],
  // Clear aligners — payment-threshold triggered release
  ALIGNER:      ["ALIGNER", "ALIGN", "INVISALIGN", "CLEAR_ALIGNER", "RETAINER"],
} as const;

function matchesAny(code: string, patterns: readonly string[]): boolean {
  const upper = code.toUpperCase();
  return patterns.some(p => upper.includes(p));
}

export function classifyLocumTreatment(treatmentTypeCode: string): LocumTreatmentCategory {
  // Order matters: more specific checks first
  if (matchesAny(treatmentTypeCode, CATEGORY_CODES.ORTHO_DEBOND))   return "ORTHO_DEBONDING";
  if (matchesAny(treatmentTypeCode, CATEGORY_CODES.ORTHO_BOND))     return "ORTHO_BONDING";
  if (matchesAny(treatmentTypeCode, CATEGORY_CODES.ORTHO_GENERAL))  return "MULTI_STAGE";
  if (matchesAny(treatmentTypeCode, CATEGORY_CODES.ALIGNER))        return "ALIGNER";
  if (matchesAny(treatmentTypeCode, CATEGORY_CODES.MULTI_STAGE))    return "MULTI_STAGE";
  return "ONE_OFF";
}

// ─── Pure math helpers ───────────────────────────────────────────────────────

export interface CommissionInput {
  billedAmount:    number;
  collectedAmount: number;
  labFee:          number;
  sst:             number;
  doctorSplit:     number; // 0–100 %
}

/** Net pool = billedAmount − labFee − sst (floored at 0) */
export function computeNetPool(input: Omit<CommissionInput, "collectedAmount" | "doctorSplit">): number {
  return Math.max(0, input.billedAmount - input.labFee - input.sst);
}

/** Raw entitled commission = netPool × (doctorSplit / 100) */
export function computeEntitlement(netPool: number, doctorSplit: number): number {
  return new Decimal(netPool).times(doctorSplit).div(100).toDecimalPlaces(2).toNumber();
}

export interface OrthoReleaseOptions {
  /** If true, bonding entitlement is proportional to patient's payment progress (capped at 50%) */
  trackPaymentPercentage: boolean;
  totalPackagePrice:      number;
  totalCollected:         number;
}

/**
 * ORTHO BONDING: release the first 50% of entitlement.
 * With trackPaymentPercentage: release min(collectedRatio × full, 0.5 × full).
 */
export function computeOrthoBondingRelease(
  fullEntitlement: number,
  opts: OrthoReleaseOptions,
): number {
  if (opts.trackPaymentPercentage && opts.totalPackagePrice > 0) {
    const ratio = Math.min(opts.totalCollected / opts.totalPackagePrice, 0.5);
    return new Decimal(fullEntitlement).times(ratio).toDecimalPlaces(2).toNumber();
  }
  return new Decimal(fullEntitlement).times(0.5).toDecimalPlaces(2).toNumber();
}

/** ORTHO DEBONDING: release the remaining 50% once plan is COMPLETED */
export function computeOrthoDebondingRelease(fullEntitlement: number): number {
  return new Decimal(fullEntitlement).times(0.5).toDecimalPlaces(2).toNumber();
}

/**
 * ALIGNER: release 30% of entitlement once patient has paid ≥ 70% of package price.
 * Returns { eligible, releaseAmount }.
 */
export function computeAlignerRelease(
  fullEntitlement: number,
  totalCollected: number,
  totalPackagePrice: number,
): { eligible: boolean; releaseAmount: number } {
  if (totalPackagePrice <= 0) return { eligible: false, releaseAmount: 0 };
  const threshold = new Decimal(totalPackagePrice).times(0.7).toNumber();
  if (totalCollected < threshold) return { eligible: false, releaseAmount: 0 };
  return {
    eligible:      true,
    releaseAmount: new Decimal(fullEntitlement).times(0.3).toDecimalPlaces(2).toNumber(),
  };
}

// ─── Monthly reconciliation (pure math) ──────────────────────────────────────

export interface MonthlyReconciliationInput {
  totalEarnedCommissions: number; // Σ releasedAmount for PENDING_RELEASE + PAID lines
  flatRates:              number; // ancillary / one-off incentives (OPG, CBCT, etc.)
  sessionsWorked:         number; // from LocumEngagement.sessionsWorked
  dayRate:                number; // from DoctorProfile.dayRate
}

export interface ReconciliationResult {
  totalEarned:  number;
  basicPayFloor: number;
  finalPayout:  number;
  isTopUp:      boolean;
  topUpAmount:  number;
}

/**
 * Final payout = max(totalEarned + flatRates, sessionsWorked × dayRate)
 * If commission falls short of the basic pay floor, the top-up makes up the gap.
 */
export function reconcileMonthlyPayout(input: MonthlyReconciliationInput): ReconciliationResult {
  const totalEarned   = new Decimal(input.totalEarnedCommissions).plus(input.flatRates).toNumber();
  const basicPayFloor = new Decimal(input.sessionsWorked).times(input.dayRate).toNumber();
  const finalPayout   = Math.max(totalEarned, basicPayFloor);
  const isTopUp       = finalPayout > totalEarned + 0.005; // fp tolerance
  return {
    totalEarned,
    basicPayFloor,
    finalPayout,
    isTopUp,
    topUpAmount: isTopUp ? new Decimal(finalPayout).minus(totalEarned).toDecimalPlaces(2).toNumber() : 0,
  };
}

// ─── Workflow error ───────────────────────────────────────────────────────────

export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

// ─── Internal DB fetch helper ─────────────────────────────────────────────────

type LineWithRelations = Awaited<ReturnType<typeof _fetchLine>>;

async function _fetchLine(id: string, p: PrismaClient) {
  const line = await (p as any).locumPayoutLine.findUnique({
    where: { id },
    include: {
      treatment: {
        select: {
          labJobId:       true,
          labFee:         true,
          billedAmount:   true,
          collectedAmount: true,
          sst:            true,
          doctorSplit:    true,
          treatmentType:  { select: { code: true, name: true } },
        },
      },
      treatmentPlan: {
        select: {
          id:          true,
          status:      true,
          totalAmount: true,
          totalPaid:   true,
          stages: { select: { status: true } },
        },
      },
    },
  });
  if (!line) throw new WorkflowError(`LocumPayoutLine ${id} not found`, "NOT_FOUND");
  return line;
}

// ─── Workflow guard assertions ────────────────────────────────────────────────

function assertNotTerminal(line: LineWithRelations): void {
  if (line.status === "PAID" || line.status === "VOIDED") {
    throw new WorkflowError(
      `Line is already in a terminal state (${line.status})`,
      "INVALID_STATE",
    );
  }
}

function assertStep1Done(line: LineWithRelations): void {
  if (!line.counterVerifiedAt) {
    throw new WorkflowError(
      "Step 1 incomplete: counter has not yet verified daily collected cash",
      "STEP1_INCOMPLETE",
    );
  }
}

function assertStep2Done(line: LineWithRelations): void {
  assertStep1Done(line);
  if (!line.doctorVerifiedAt) {
    throw new WorkflowError(
      "Step 2 incomplete: doctor has not verified patient payment against package price",
      "STEP2_INCOMPLETE",
    );
  }
}

function assertStep3Done(line: LineWithRelations): void {
  assertStep2Done(line);
  // If the treatment has an associated lab job, the invoice must have been logged
  if (line.treatment.labJobId && !line.labFeeConfirmed) {
    throw new WorkflowError(
      "Step 3 incomplete: lab invoice has not been logged. Counter must record the exact lab fee before this line can proceed.",
      "STEP3_LAB_FEE_MISSING",
    );
  }
}

function assertStep4Done(line: LineWithRelations): void {
  assertStep3Done(line);
  if (!line.completionMarkedAt) {
    throw new WorkflowError(
      "Step 4 incomplete: doctor has not marked this case stage as complete",
      "STEP4_INCOMPLETE",
    );
  }
}

// ─── Release eligibility check ────────────────────────────────────────────────

export interface ReleaseCheckResult {
  eligible:      boolean;
  reason?:       string;
  releaseAmount: number;
}

async function _checkReleaseEligibility(
  line: LineWithRelations,
): Promise<ReleaseCheckResult> {
  const entitlement = Number(line.entitledAmount);
  const category    = line.category as LocumTreatmentCategory;

  switch (category) {
    case "ONE_OFF":
      return { eligible: true, releaseAmount: entitlement };

    case "MULTI_STAGE": {
      if (!line.treatmentPlan) {
        // No plan linked — treat as one-off (no stage tracking possible)
        return { eligible: true, releaseAmount: entitlement };
      }
      const stages      = line.treatmentPlan.stages as { status: string }[];
      const allDone     = stages.every(s => s.status === "COMPLETED" || s.status === "SKIPPED");
      if (!allDone) {
        const pending = stages.filter(s => s.status !== "COMPLETED" && s.status !== "SKIPPED").length;
        return {
          eligible:      false,
          reason:        `Multi-stage case still has ${pending} incomplete stage(s). Complete all stages or use force-release.`,
          releaseAmount: 0,
        };
      }
      return { eligible: true, releaseAmount: entitlement };
    }

    case "ORTHO_BONDING": {
      const trackPayment = Boolean(line.orthoPaymentTrackEnabled);
      const released = computeOrthoBondingRelease(entitlement, {
        trackPaymentPercentage: trackPayment,
        totalPackagePrice:      Number(line.treatmentPlan?.totalAmount ?? 0),
        totalCollected:         Number(line.treatmentPlan?.totalPaid   ?? 0),
      });
      return { eligible: true, releaseAmount: released };
    }

    case "ORTHO_DEBONDING": {
      if (line.treatmentPlan && line.treatmentPlan.status !== "COMPLETED") {
        return {
          eligible:      false,
          reason:        `Ortho plan is not yet COMPLETED (current: ${line.treatmentPlan.status}). Debonding 50% cannot be released until the full case is done.`,
          releaseAmount: 0,
        };
      }
      return { eligible: true, releaseAmount: computeOrthoDebondingRelease(entitlement) };
    }

    case "ALIGNER": {
      const plan = line.treatmentPlan;
      if (!plan || Number(plan.totalAmount) === 0) {
        return {
          eligible:      false,
          reason:        "No treatment plan linked — cannot verify 70% payment threshold for aligner release.",
          releaseAmount: 0,
        };
      }
      const result = computeAlignerRelease(
        entitlement,
        Number(plan.totalPaid),
        Number(plan.totalAmount),
      );
      if (!result.eligible) {
        const pct = ((Number(plan.totalPaid) / Number(plan.totalAmount)) * 100).toFixed(1);
        return {
          eligible:      false,
          reason:        `Patient has paid ${pct}% of the package price — 70% threshold not yet met for aligner 30% release.`,
          releaseAmount: 0,
        };
      }
      return { eligible: true, releaseAmount: result.releaseAmount };
    }

    default:
      return { eligible: true, releaseAmount: entitlement };
  }
}

// ─── Step 1: Counter verifies daily collected cash ────────────────────────────

export async function step1_counterVerify(
  lineId:        string,
  counterUserId: string,
  p: PrismaClient = defaultPrisma,
): Promise<void> {
  const line = await _fetchLine(lineId, p);
  assertNotTerminal(line);
  if (line.counterVerifiedAt) {
    throw new WorkflowError("Step 1 already completed for this line", "ALREADY_DONE");
  }
  await (p as any).locumPayoutLine.update({
    where: { id: lineId },
    data:  { counterVerifiedAt: new Date(), counterVerifiedBy: counterUserId },
  });
}

// ─── Step 2: Doctor verifies patient payments ─────────────────────────────────

export async function step2_doctorVerify(
  lineId:       string,
  doctorUserId: string,
  p: PrismaClient = defaultPrisma,
): Promise<void> {
  const line = await _fetchLine(lineId, p);
  assertNotTerminal(line);
  assertStep1Done(line);
  if (line.doctorVerifiedAt) {
    throw new WorkflowError("Step 2 already completed for this line", "ALREADY_DONE");
  }
  await (p as any).locumPayoutLine.update({
    where: { id: lineId },
    data:  { doctorVerifiedAt: new Date(), doctorVerifiedBy: doctorUserId },
  });
}

// ─── Step 3: Counter logs confirmed lab invoice fee ───────────────────────────

export async function step3_logLabFee(
  lineId:           string,
  confirmedLabFee:  number,
  loggedByUserId:   string,
  p: PrismaClient = defaultPrisma,
): Promise<{ newNetPool: number; newEntitlement: number }> {
  const line = await _fetchLine(lineId, p);
  assertNotTerminal(line);
  assertStep2Done(line);

  // Re-derive the commission with the confirmed lab invoice amount
  const newNetPool      = computeNetPool({
    billedAmount: Number(line.billedAmount),
    labFee:       confirmedLabFee,
    sst:          Number(line.sst),
  });
  const newEntitlement  = computeEntitlement(newNetPool, Number(line.doctorSplit));

  await (p as any).locumPayoutLine.update({
    where: { id: lineId },
    data: {
      labFee:          new Decimal(confirmedLabFee).toDecimalPlaces(2).toNumber(),
      labFeeConfirmed: true,
      labFeeLoggedAt:  new Date(),
      labFeeLoggedBy:  loggedByUserId,
      netPool:         newNetPool,
      entitledAmount:  newEntitlement,
    },
  });

  // Keep Treatment.labFee in sync so the main commission engine sees the real cost
  await p.treatment.update({
    where: { id: line.treatmentId },
    data:  { labFee: new Decimal(confirmedLabFee) },
  });

  return { newNetPool, newEntitlement };
}

// ─── Step 4: Doctor marks case stage as completed ────────────────────────────

export async function step4_markCompletion(
  lineId:          string,
  markedByUserId:  string,
  p: PrismaClient = defaultPrisma,
): Promise<void> {
  const line = await _fetchLine(lineId, p);
  assertNotTerminal(line);
  assertStep3Done(line);
  if (line.completionMarkedAt) {
    throw new WorkflowError("Completion is already marked for this line", "ALREADY_DONE");
  }
  await (p as any).locumPayoutLine.update({
    where: { id: lineId },
    data:  { completionMarkedAt: new Date(), completionMarkedBy: markedByUserId },
  });
}

// ─── Step 5: Evaluate release conditions → PENDING_RELEASE ───────────────────

export async function step5_checkAndRelease(
  lineId: string,
  p: PrismaClient = defaultPrisma,
): Promise<ReleaseCheckResult> {
  const line = await _fetchLine(lineId, p);
  assertNotTerminal(line);
  assertStep4Done(line);

  if (line.status === "PENDING_RELEASE") {
    throw new WorkflowError("Line is already in PENDING_RELEASE state", "INVALID_STATE");
  }

  const result = await _checkReleaseEligibility(line);
  if (!result.eligible) return result; // caller surfaces the reason to the user

  await (p as any).locumPayoutLine.update({
    where: { id: lineId },
    data: {
      status:           "PENDING_RELEASE",
      releasedAmount:   result.releaseAmount,
      pendingReleaseAt: new Date(),
    },
  });
  return result;
}

// ─── Step 6: Manager marks row as PAID ───────────────────────────────────────

export async function step6_managerPay(
  lineId:         string,
  managerUserId:  string,
  p: PrismaClient = defaultPrisma,
): Promise<void> {
  const line = await _fetchLine(lineId, p);

  if (line.status !== "PENDING_RELEASE") {
    throw new WorkflowError(
      `Only PENDING_RELEASE lines can be marked PAID (current status: ${line.status})`,
      "INVALID_STATE",
    );
  }
  // Final hard stop: lab invoice must be logged if a lab job exists
  if (line.treatment.labJobId && !line.labFeeConfirmed) {
    throw new WorkflowError(
      "Cannot mark as PAID: the physical lab invoice has not been confirmed (Step 3 incomplete).",
      "STEP3_LAB_FEE_MISSING",
    );
  }

  await (p as any).locumPayoutLine.update({
    where: { id: lineId },
    data:  { status: "PAID", paidAt: new Date(), paidBy: managerUserId },
  });
}

// ─── Manager override: force-release a locked/entitled line ──────────────────

export async function forceRelease(
  lineId:        string,
  managerUserId: string,
  reason:        string,
  p: PrismaClient = defaultPrisma,
): Promise<void> {
  if (!reason?.trim()) {
    throw new WorkflowError(
      "A written reason is mandatory for force-release overrides",
      "REASON_REQUIRED",
    );
  }
  const line = await _fetchLine(lineId, p);

  if (
    line.status !== "LOCKED_PENDING_COMPLETION" &&
    line.status !== "ENTITLED"
  ) {
    throw new WorkflowError(
      `Force-release only applies to LOCKED_PENDING_COMPLETION or ENTITLED lines (current: ${line.status})`,
      "INVALID_STATE",
    );
  }
  // Steps 1–3 must still be complete so the financials are verified
  assertStep3Done(line);

  await (p as any).locumPayoutLine.update({
    where: { id: lineId },
    data: {
      status:           "PENDING_RELEASE",
      releasedAmount:   Number(line.entitledAmount),
      pendingReleaseAt: new Date(),
      forceReleasedBy:  managerUserId,
      forceReleasedAt:  new Date(),
      notes:            reason,
    },
  });
}

// ─── Void a line ─────────────────────────────────────────────────────────────

export async function voidPayoutLine(
  lineId:     string,
  voidedBy:   string,
  voidReason: string,
  p: PrismaClient = defaultPrisma,
): Promise<void> {
  const line = await _fetchLine(lineId, p);
  if (line.status === "PAID") {
    throw new WorkflowError(
      "Cannot void a line that has already been PAID. Raise a manual adjustment instead.",
      "INVALID_STATE",
    );
  }
  await (p as any).locumPayoutLine.update({
    where: { id: lineId },
    data:  { status: "VOIDED", voidedAt: new Date(), voidedBy, voidReason },
  });
}

// ─── Create / upsert a payout line for a treatment ───────────────────────────

export interface CreatePayoutLineInput {
  treatmentId:              string;
  doctorProfileId:          string;
  clinicId:                 string;
  month:                    string; // "YYYY-MM"
  treatmentPlanId?:         string;
  treatmentStageId?:        string;
  orthoPaymentTrackEnabled?: boolean;
  /** Effective payout % of the net pool. Defaults to the treatment's doctorSplit.
   *  For permanent doctors pass split × rate (e.g. 100% × 15% → 15). */
  doctorSplit?:             number;
}

export async function createPayoutLine(
  input: CreatePayoutLineInput,
  p: PrismaClient = defaultPrisma,
): Promise<string> {
  const treatment = await p.treatment.findUnique({
    where:   { id: input.treatmentId },
    include: { treatmentType: { select: { code: true } } },
  });
  if (!treatment) throw new WorkflowError(`Treatment ${input.treatmentId} not found`, "NOT_FOUND");

  const category      = classifyLocumTreatment(treatment.treatmentType.code);
  const billedAmount  = Number(treatment.billedAmount);
  const collectedAmount = Number(treatment.collectedAmount);
  const labFee        = Number(treatment.labFee);
  const sst           = Number(treatment.sst);
  const doctorSplit   = input.doctorSplit ?? Number(treatment.doctorSplit);

  const netPool        = computeNetPool({ billedAmount, labFee, sst });
  const entitledAmount = computeEntitlement(netPool, doctorSplit);

  // Multi-stage and ortho debonding lines start LOCKED until their case completes
  const initialStatus: LocumPayoutStatus =
    category === "MULTI_STAGE" || category === "ORTHO_DEBONDING"
      ? "LOCKED_PENDING_COMPLETION"
      : "ENTITLED";

  // No lab job linked → auto-confirm lab fee (nothing to wait for)
  const labFeeConfirmed = !treatment.labJobId;

  const line = await (p as any).locumPayoutLine.upsert({
    where: {
      treatmentId_doctorProfileId: {
        treatmentId:     input.treatmentId,
        doctorProfileId: input.doctorProfileId,
      },
    },
    create: {
      treatmentId:     input.treatmentId,
      doctorProfileId: input.doctorProfileId,
      clinicId:        input.clinicId,
      month:           input.month,
      category,
      billedAmount,
      collectedAmount,
      labFee,
      labFeeConfirmed,
      sst,
      doctorSplit,
      netPool,
      entitledAmount,
      releasedAmount:  0,
      status:          initialStatus,
      treatmentPlanId: input.treatmentPlanId  ?? null,
      treatmentStageId: input.treatmentStageId ?? null,
      orthoPaymentTrackEnabled: input.orthoPaymentTrackEnabled ?? false,
    },
    update: {
      // Re-compute if a line already exists (e.g., lab fee was later adjusted)
      billedAmount,
      collectedAmount,
      labFee,
      labFeeConfirmed,
      sst,
      doctorSplit,
      netPool,
      entitledAmount,
    },
    select: { id: true },
  });

  return line.id;
}

// ─── Monthly DB reconciliation ────────────────────────────────────────────────

export interface MonthlyReconciliationDbResult extends ReconciliationResult {
  doctorProfileId: string;
  month:           string;
  lines: Array<{
    id:              string;
    category:        string;
    status:          string;
    entitledAmount:  number;
    releasedAmount:  number;
    treatmentId:     string;
  }>;
}

/**
 * Loads all payout lines + engagement data for a doctor + month,
 * then runs the reconciliation formula and returns the full breakdown.
 *
 * The caller decides whether to persist the result in LocumReconciliationStatement.
 */
export async function runMonthlyReconciliation(
  doctorProfileId: string,
  monthStr:        string,
  opts: { flatRates?: number } = {},
  p: PrismaClient = defaultPrisma,
): Promise<MonthlyReconciliationDbResult> {
  // Load doctor profile for daily rate
  const doctor = await p.doctorProfile.findUnique({
    where:  { id: doctorProfileId },
    select: {
      dayRate:     true,
      type:        true,
      engagements: {
        where:  { month: monthStr },
        select: { sessionsWorked: true },
        take:   1,
      },
    },
  });
  if (!doctor) throw new WorkflowError(`DoctorProfile ${doctorProfileId} not found`, "NOT_FOUND");

  // All non-voided payout lines for this doctor + month
  const lines = await (p as any).locumPayoutLine.findMany({
    where:  { doctorProfileId, month: monthStr, status: { not: "VOIDED" } },
    select: {
      id:             true,
      category:       true,
      status:         true,
      entitledAmount: true,
      releasedAmount: true,
      treatmentId:    true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Only count lines that are at the PENDING_RELEASE or PAID stage
  const totalEarnedCommissions = (lines as any[])
    .filter((l: any) => l.status === "PENDING_RELEASE" || l.status === "PAID")
    .reduce((sum: number, l: any) => sum + Number(l.releasedAmount), 0);

  const sessionsWorked = doctor.engagements[0]?.sessionsWorked ?? 0;
  const dayRate        = Number(doctor.dayRate ?? 0);

  const recon = reconcileMonthlyPayout({
    totalEarnedCommissions,
    flatRates:    opts.flatRates ?? 0,
    sessionsWorked,
    dayRate,
  });

  return {
    ...recon,
    doctorProfileId,
    month: monthStr,
    lines: lines as any[],
  };
}

// ─── Bulk step-5 sweep: promote all eligible lines for a month ────────────────

/**
 * Runs step5_checkAndRelease for every line that has completed steps 1–4
 * but hasn't yet been promoted to PENDING_RELEASE. Useful to call at month-end.
 * Returns a summary of what was promoted and what couldn't be.
 */
export async function sweepMonthlyRelease(
  doctorProfileId: string,
  monthStr:        string,
  p: PrismaClient = defaultPrisma,
): Promise<{ promoted: string[]; blocked: Array<{ id: string; reason: string }> }> {
  const candidates = await (p as any).locumPayoutLine.findMany({
    where: {
      doctorProfileId,
      month:  monthStr,
      status: { notIn: ["PENDING_RELEASE", "PAID", "VOIDED"] },
      completionMarkedAt: { not: null },
    },
    select: { id: true },
  });

  const promoted: string[] = [];
  const blocked:  Array<{ id: string; reason: string }> = [];

  for (const { id } of candidates as { id: string }[]) {
    try {
      const result = await step5_checkAndRelease(id, p);
      if (result.eligible) {
        promoted.push(id);
      } else {
        blocked.push({ id, reason: result.reason ?? "Release conditions not met" });
      }
    } catch (err) {
      blocked.push({ id, reason: err instanceof WorkflowError ? err.message : String(err) });
    }
  }

  return { promoted, blocked };
}
