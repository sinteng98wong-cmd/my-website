/**
 * Payroll payment workflow — roles, guards and state transitions.
 *
 * Chain of custody for a monthly payroll:
 *
 *   HR locks the payroll run              (PayrollRun DRAFT → LOCKED)
 *   1st approver approves each payslip    (PaySlip  PENDING → APPROVED)
 *   Accounts prepares the bank payment    (PayrollBankPayment PENDING_APPROVAL)
 *   2nd approver approves the payment     (PayrollBankPayment → PAID, slips PAID)
 *   HR releases the individual payslip    (PaySlip  PAID → RELEASED)
 *
 * The approvers are configured per clinic (ClinicPayrollConfig) — never the
 * Payment Voucher director/PIC, and never a hard-coded user.
 *
 * The functions here are pure so the rules can be unit tested without a DB.
 */

/** HR — locks the run and releases individual payslips. */
export const HR_PAYROLL_ROLES = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];
/** Accounts — prepares/uploads the bank payment. May never approve it. */
export const ACCOUNTS_ROLES = ["SUPER_ADMIN", "FINANCE"];

export type PaySlipStatus = "PENDING" | "APPROVED" | "PAID" | "RELEASED";

export interface ClinicPayrollSettings {
  firstApproverId: string | null;
  secondApproverId: string | null;
  headNurseStaffProfileId: string | null;
  lunchOtAllowed: boolean;
  lunchOtMaxMinutes: number;
}

/** Used when a clinic has no ClinicPayrollConfig row yet. */
export const DEFAULT_PAYROLL_SETTINGS: ClinicPayrollSettings = {
  firstApproverId: null,
  secondApproverId: null,
  headNurseStaffProfileId: null,
  lunchOtAllowed: false,
  lunchOtMaxMinutes: 60,
};

export type Guard = { ok: true } | { ok: false; status: number; error: string };

const ok: Guard = { ok: true };
const deny = (status: number, error: string): Guard => ({ ok: false, status, error });

/**
 * 1st payment approver — approves an individual payslip after the HR lock.
 * The clinic must have one configured; Super Admin may stand in.
 */
export function checkFirstApprover(
  cfg: ClinicPayrollSettings,
  userId: string,
  role: string
): Guard {
  if (!cfg.firstApproverId)
    return deny(422, "No 1st payment approver configured for this clinic. Set one in Payroll Settings first.");
  if (userId === cfg.firstApproverId) return ok;
  if (role === "SUPER_ADMIN") return ok;
  return deny(403, "Only the clinic's 1st payment approver can approve this payslip.");
}

/**
 * 2nd payment approver — signs off the bank payment, which releases the money.
 * Whoever prepared the payment (Accounts) can never approve it, Super Admin
 * included: that separation is the whole point of the second signature.
 */
export function checkSecondApprover(
  cfg: ClinicPayrollSettings,
  userId: string,
  role: string,
  preparedById: string
): Guard {
  if (!cfg.secondApproverId)
    return deny(422, "No 2nd payment approver configured for this clinic. Set one in Payroll Settings first.");
  if (userId === preparedById)
    return deny(403, "Accounts prepared this bank payment and cannot approve it.");
  if (userId === cfg.secondApproverId) return ok;
  if (role === "SUPER_ADMIN") return ok;
  return deny(403, "Only the clinic's 2nd payment approver can approve this bank payment.");
}

/**
 * Monthly attendance submission is the designated branch Head Nurse's job —
 * not every authenticated staff member's.
 */
export function checkHeadNurse(
  cfg: ClinicPayrollSettings,
  staffProfileId: string | null,
  role: string
): Guard {
  if (!cfg.headNurseStaffProfileId)
    return deny(422, "No Head Nurse designated for this branch. Set one in Payroll Settings first.");
  if (staffProfileId && staffProfileId === cfg.headNurseStaffProfileId) return ok;
  if (role === "SUPER_ADMIN") return ok;
  return deny(403, "Only the branch's designated Head Nurse can submit monthly attendance.");
}

/**
 * Lunch OT is a clinic-level permission. Recording it is refused outright at
 * clinics that do not grant it, rather than being waved through as an
 * attendance exception reason.
 */
export function checkLunchOt(cfg: ClinicPayrollSettings, minutes: number): Guard {
  if (!minutes) return ok;
  if (minutes < 0) return deny(422, "Lunch OT minutes cannot be negative.");
  if (!cfg.lunchOtAllowed)
    return deny(403, "Lunch OT is not permitted at this clinic.");
  if (minutes > cfg.lunchOtMaxMinutes)
    return deny(422, `Lunch OT is capped at ${cfg.lunchOtMaxMinutes} minutes per day at this clinic.`);
  return ok;
}

/** Approvers must be two different people for the two signatures to mean anything. */
export function checkApproverPair(firstApproverId?: string | null, secondApproverId?: string | null): Guard {
  if (firstApproverId && secondApproverId && firstApproverId === secondApproverId)
    return deny(422, "The 1st and 2nd payment approvers must be different people.");
  return ok;
}

/** Payslips eligible to go onto a bank payment: approved and not yet on one. */
export function isPayable(slip: { status: string; bankPaymentId: string | null }): boolean {
  return slip.status === "APPROVED" && !slip.bankPaymentId;
}

/** A run is fully settled once every payslip has been paid (or released). */
export function isRunSettled(slips: { status: string }[]): boolean {
  return slips.length > 0 && slips.every((s) => s.status === "PAID" || s.status === "RELEASED");
}

/** Bank payment reference: BP-202606-001 */
export function bankPaymentRef(month: string, sequence: number): string {
  return `BP-${month.replace("-", "")}-${String(sequence).padStart(3, "0")}`;
}
