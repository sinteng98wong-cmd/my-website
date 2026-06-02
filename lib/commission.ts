/**
 * DentalOS Commission Engine
 * All business rules from Commission Rules Document v1.4
 */

import { Decimal } from "@prisma/client/runtime/library";

// ── Types ────────────────────────────────────────────────────────────────

export interface DoctorCommissionInput {
  collectedAmount: number;
  labFee: number;
  doctorSplit: number;      // 0-100
  doctorRate: number;       // 0-100 (%)
}

export interface LocumFloorInput {
  totalCommission: number;
  sessionsWorked: number;
  ratePerSession: number;   // day rate or hour rate
}

export interface AttendanceInput {
  totalWorkDays: number;
  mcDays: number;
  elDays: number;
  unpaidDays: number;
  timeSlipDays: number;     // 0.5 per partial-day time slip
  alDays: number;           // Annual leave — counts as attended
  lateCount: number;
}

export interface CommissionTierConfig {
  tierOrder: number;
  floorAmount: number;
  ceilAmount: number | null;
  rate: number;             // %
}

export interface StaffCommissionInput {
  totalCollectedTreatmentSales: number;
  attendance: AttendanceInput;
  tiers: CommissionTierConfig[];
  tierType: "PROGRESSIVE" | "FLAT";
  forfeitThreshold: number;  // default 5
}

// ── Doctor Commission ────────────────────────────────────────────────────

/**
 * Core formula: (TreatmentAmount − LabFee) × DoctorSplit × DoctorRate
 * Rule: collected cash only. Lab fee never shown on patient invoice.
 */
export function calculateDoctorCommission(input: DoctorCommissionInput): number {
  const profit = input.collectedAmount - input.labFee;
  const splitFactor = input.doctorSplit / 100;
  const rateFactor = input.doctorRate / 100;
  return roundTo2(profit * splitFactor * rateFactor);
}

/**
 * Locum guaranteed floor: MAX(commission, sessions × rate)
 * Returns { payout, isTopUp, topUpAmount }
 */
export function applyLocumFloor(input: LocumFloorInput) {
  const floor = input.sessionsWorked * input.ratePerSession;
  const isTopUp = input.totalCommission < floor;
  const payout = Math.max(input.totalCommission, floor);
  return {
    payout: roundTo2(payout),
    isTopUp,
    topUpAmount: roundTo2(isTopUp ? floor - input.totalCommission : 0),
    floor: roundTo2(floor),
  };
}

// ── Staff Commission ─────────────────────────────────────────────────────

/**
 * Returns forfeited=true if combined absence count exceeds threshold.
 * EL + MC + Unpaid + Late (count, not days) > forfeitThreshold
 * NOTE: Late counts as occurrences, not days.
 */
export function checkForfeit(attendance: AttendanceInput, threshold: number): {
  forfeited: boolean;
  combinedCount: number;
  reason: string | null;
} {
  const combinedCount =
    attendance.mcDays +
    attendance.elDays +
    attendance.unpaidDays +
    attendance.lateCount;

  const forfeited = combinedCount > threshold;
  return {
    forfeited,
    combinedCount,
    reason: forfeited
      ? `Combined absence count ${combinedCount} exceeds threshold ${threshold}`
      : null,
  };
}

/**
 * Attendance pro-ration:
 * attendedDays = totalWorkDays - mcDays - elDays - unpaidDays - timeSlipDays
 * AL counts as attended. Late does NOT reduce attended days.
 */
export function calculateAttendedDays(attendance: AttendanceInput): number {
  const attended =
    attendance.totalWorkDays -
    attendance.mcDays -
    attendance.elDays -
    attendance.unpaidDays -
    attendance.timeSlipDays;
  // AL days already counted (they're not subtracted)
  return Math.max(0, attended);
}

/**
 * Calculate gross commission from tiers.
 * PROGRESSIVE: each tier's band is taxed at that tier's rate.
 * FLAT: the rate of the highest reached tier applies to the full amount.
 */
export function calculateGrossCommission(
  totalSales: number,
  tiers: CommissionTierConfig[],
  tierType: "PROGRESSIVE" | "FLAT"
): number {
  const sorted = [...tiers].sort((a, b) => a.tierOrder - b.tierOrder);

  if (tierType === "FLAT") {
    // Find highest tier reached
    let applicableRate = 0;
    for (const tier of sorted) {
      if (totalSales >= tier.floorAmount) {
        applicableRate = tier.rate;
      }
    }
    return roundTo2(totalSales * (applicableRate / 100));
  }

  // PROGRESSIVE — bracket style
  let commission = 0;
  for (const tier of sorted) {
    if (totalSales <= tier.floorAmount) break;
    const taxable = tier.ceilAmount
      ? Math.min(totalSales, tier.ceilAmount) - tier.floorAmount
      : totalSales - tier.floorAmount;
    commission += taxable * (tier.rate / 100);
    if (tier.ceilAmount && totalSales <= tier.ceilAmount) break;
  }
  return roundTo2(commission);
}

/**
 * Full staff commission calculation.
 * 1. Forfeit check
 * 2. Gross commission from tiers
 * 3. Pro-ration by attendance
 */
export function calculateStaffCommission(input: StaffCommissionInput): {
  forfeited: boolean;
  forfeitReason: string | null;
  grossCommission: number;
  attendedDays: number;
  totalWorkDays: number;
  proRatedCommission: number;
} {
  const forfeit = checkForfeit(input.attendance, input.forfeitThreshold);

  if (forfeit.forfeited) {
    return {
      forfeited: true,
      forfeitReason: forfeit.reason,
      grossCommission: 0,
      attendedDays: 0,
      totalWorkDays: input.attendance.totalWorkDays,
      proRatedCommission: 0,
    };
  }

  const grossCommission = calculateGrossCommission(
    input.totalCollectedTreatmentSales,
    input.tiers,
    input.tierType
  );

  const attendedDays = calculateAttendedDays(input.attendance);
  const proRatedCommission = roundTo2(
    grossCommission * (attendedDays / input.attendance.totalWorkDays)
  );

  return {
    forfeited: false,
    forfeitReason: null,
    grossCommission,
    attendedDays,
    totalWorkDays: input.attendance.totalWorkDays,
    proRatedCommission,
  };
}

// ── Utils ────────────────────────────────────────────────────────────────

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}
