/**
 * staff-commission.service.ts
 *
 * Orchestrates the full staff commission flow for one clinic + month:
 *   1. Load CommissionConfig (tiers, method, forfeit threshold)
 *   2. For each staff member: sum collected treatment sales (no products)
 *   3. Pull Attendance aggregate row for the month
 *   4. Run forfeit check → gross commission → pro-ration
 *   5. Upsert StaffCommission rows (DRAFT status)
 *
 * Business rules enforced (Commission Rules Document v1.4):
 *   - Staff commission is on collected CASH from treatments only (no products)
 *   - Pro-ration: GrossComm × (AttendedDays / TotalWorkingDays)
 *   - Forfeit: EL + MC + Unpaid + Late > forfeitThreshold → zero commission
 *   - AL counts as an attended day (not deducted)
 *   - Time slip: 0.5 day deduction per partial-day slip (already in Attendance row)
 */

import { PrismaClient, CommissionMethod } from "@prisma/client";
import {
  calculateStaffCommission,
  type CommissionTierConfig,
} from "@/lib/commission";

const prismaDefault = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StaffCommissionResult {
  staffProfileId:    string;
  staffName:         string;
  totalSales:        number;
  grossCommission:   number;
  attendedDays:      number;
  totalWorkDays:     number;
  proRatedCommission: number;
  forfeited:         boolean;
  forfeitReason:     string | null;
  /** DB row id of the upserted StaffCommission record */
  commissionId:      string;
}

export interface RunStaffCommissionResult {
  clinicId:    string;
  month:       string;
  method:      CommissionMethod;
  results:     StaffCommissionResult[];
  /** True when POOL_DIVIDE method is in use and the pool was split evenly */
  poolDivided: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Sum all collected treatment cash for a staff member within a month.
 * Treatment commission is on collected cash only — products are excluded.
 * A treatment contributes its collectedAmount (not billedAmount) via the
 * visit's invoices.
 *
 * Because Treatment.collectedAmount is set at the treatment level, we sum
 * it directly for treatments whose visit falls in the given month and clinic.
 */
async function sumCollectedTreatmentSales(
  staffProfileId: string,
  clinicId:        string,
  from:            Date,
  to:              Date,
  prisma:          PrismaClient,
): Promise<number> {
  // Staff are linked to sales via staffProfile → user → treatments they
  // attended to (captured on Visit via DentistNursePairing or direct billing).
  // In this schema, Treatment.doctorId links to DoctorProfile, but for staff
  // we aggregate all collected treatment revenue for the clinic as a shared
  // pool, partitioned per CommissionMethod.
  //
  // For INDIVIDUAL: each staff member's commission is based on the clinic's
  // total collected treatment sales (the tiers produce per-staff targets).
  // We therefore return the clinic-level total here; POOL_DIVIDE halves it.
  const agg = await prisma.treatment.aggregate({
    _sum: { collectedAmount: true },
    where: {
      visit: {
        clinicId,
        visitDate:  { gte: from, lt: to },
        deletedAt:  null,
      },
    },
  });
  return Number(agg._sum.collectedAmount ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export async function runStaffCommission(
  clinicId:  string,
  monthStr:  string,
  prisma:    PrismaClient = prismaDefault,
): Promise<RunStaffCommissionResult> {
  const [y, m] = monthStr.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to   = new Date(y, m,     1);

  // ── 1. Commission config for this clinic ──────────────────────────────────
  const config = await prisma.commissionConfig.findFirst({
    where:   { clinicId },
    orderBy: { effectiveFrom: "desc" },
    include: { tiers: { orderBy: { tierOrder: "asc" } } },
  });

  if (!config) {
    throw new Error(`No CommissionConfig found for clinic ${clinicId}`);
  }

  const tiers: CommissionTierConfig[] = config.tiers.map(t => ({
    tierOrder:   t.tierOrder,
    floorAmount: Number(t.floorAmount),
    ceilAmount:  t.ceilAmount ? Number(t.ceilAmount) : null,
    rate:        Number(t.rate),
  }));

  const forfeitThreshold = config.forfeitThreshold;
  const tierType = config.tierType as "PROGRESSIVE" | "FLAT";

  // ── 2. All active staff at this clinic ───────────────────────────────────
  const staffList = await prisma.staffProfile.findMany({
    where: {
      employmentStatus: { in: ["ACTIVE", "PROBATION"] },
      user: {
        userClinics: { some: { clinicId } },
        role:        { notIn: ["DOCTOR", "SUPER_ADMIN"] },
        active:      true,
      },
    },
    select: {
      id:   true,
      user: { select: { name: true } },
    },
  });

  if (staffList.length === 0) {
    return { clinicId, month: monthStr, method: config.method, results: [], poolDivided: false };
  }

  // ── 3. Clinic-level total collected treatment sales ───────────────────────
  const clinicTotalSales = await sumCollectedTreatmentSales(
    staffList[0].id, // staffProfileId unused for clinic-level query but required by helper
    clinicId,
    from,
    to,
    prisma,
  );

  // For POOL_DIVIDE, the sales base is divided equally among staff
  const poolDivided = config.method === CommissionMethod.POOL_DIVIDE;
  const salesPerStaff = poolDivided
    ? roundTo2(clinicTotalSales / staffList.length)
    : clinicTotalSales;

  // ── 4. Per-staff calculation + upsert ────────────────────────────────────
  const results: StaffCommissionResult[] = [];

  for (const staff of staffList) {
    // Pull the attendance aggregate for this staff + month
    const attendance = await prisma.attendance.findUnique({
      where: { staffProfileId_month: { staffProfileId: staff.id, month: monthStr } },
    });

    // If no attendance record exists, treat as fully attended (no deductions)
    const attendanceInput = attendance
      ? {
          totalWorkDays: attendance.totalWorkDays,
          mcDays:        Number(attendance.mcDays),
          elDays:        Number(attendance.elDays),
          unpaidDays:    Number(attendance.unpaidDays),
          timeSlipDays:  Number(attendance.timeSlipDays),
          alDays:        Number(attendance.alDays),
          lateCount:     attendance.lateCount,
        }
      : {
          totalWorkDays: 26,
          mcDays:        0,
          elDays:        0,
          unpaidDays:    0,
          timeSlipDays:  0,
          alDays:        0,
          lateCount:     0,
        };

    const calc = calculateStaffCommission({
      totalCollectedTreatmentSales: salesPerStaff,
      attendance:                   attendanceInput,
      tiers,
      tierType,
      forfeitThreshold,
    });

    // Upsert StaffCommission row (always DRAFT — Finance locks manually).
    // Cast to any: compound unique key types require a regenerated Prisma client.
    const row = await (prisma as any).staffCommission.upsert({
      where:  { staffProfileId_month: { staffProfileId: staff.id, month: monthStr } },
      create: {
        staffProfileId:  staff.id,
        month:           monthStr,
        totalSales:      salesPerStaff,
        grossCommission: calc.grossCommission,
        attendedDays:    calc.attendedDays,
        totalWorkDays:   calc.totalWorkDays,
        proRatedComm:    calc.proRatedCommission,
        forfeited:       calc.forfeited,
        forfeitReason:   calc.forfeitReason ?? undefined,
        status:          "DRAFT",
      },
      update: {
        totalSales:      salesPerStaff,
        grossCommission: calc.grossCommission,
        attendedDays:    calc.attendedDays,
        totalWorkDays:   calc.totalWorkDays,
        proRatedComm:    calc.proRatedCommission,
        forfeited:       calc.forfeited,
        forfeitReason:   calc.forfeitReason ?? undefined,
        status:          "DRAFT",
      },
      select: { id: true },
    });

    results.push({
      staffProfileId:    staff.id,
      staffName:         staff.user.name,
      totalSales:        salesPerStaff,
      grossCommission:   calc.grossCommission,
      attendedDays:      calc.attendedDays,
      totalWorkDays:     calc.totalWorkDays,
      proRatedCommission: calc.proRatedCommission,
      forfeited:         calc.forfeited,
      forfeitReason:     calc.forfeitReason,
      commissionId:      row.id,
    });
  }

  return { clinicId, month: monthStr, method: config.method, results, poolDivided };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lock / unlock helpers (used by the API route)
// ─────────────────────────────────────────────────────────────────────────────

export async function lockStaffCommission(
  commissionId: string,
  _lockedBy:    string,
  prisma:       PrismaClient = prismaDefault,
) {
  return prisma.staffCommission.update({
    where: { id: commissionId },
    data:  { status: "LOCKED", lockedAt: new Date() },
  });
}

export async function reverseStaffCommission(
  commissionId: string,
  prisma:       PrismaClient = prismaDefault,
) {
  return prisma.staffCommission.update({
    where: { id: commissionId },
    data:  { status: "REVERSED" },
  });
}
