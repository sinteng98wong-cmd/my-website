import { prisma } from "./prisma";
import { DEFAULT_PAYROLL_SETTINGS, checkLunchOt, type ClinicPayrollSettings, type Guard } from "./payroll-workflow";

/**
 * Per-clinic payroll settings (payment approvers, Head Nurse, Lunch OT).
 * Falls back to the defaults when a clinic has not been configured yet, so
 * callers can always rely on the guards to produce a clear error.
 */
export async function getClinicPayrollSettings(clinicId: string): Promise<ClinicPayrollSettings> {
  const cfg = await prisma.clinicPayrollConfig.findUnique({ where: { clinicId } });
  if (!cfg) return { ...DEFAULT_PAYROLL_SETTINGS };
  return {
    firstApproverId: cfg.firstApproverId,
    secondApproverId: cfg.secondApproverId,
    headNurseStaffProfileId: cfg.headNurseStaffProfileId,
    lunchOtAllowed: cfg.lunchOtAllowed,
    lunchOtMaxMinutes: cfg.lunchOtMaxMinutes,
  };
}

/** Clinics where this user is the designated Head Nurse. */
export async function headNurseClinicIds(userId: string): Promise<string[]> {
  const profile = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return [];
  const configs = await prisma.clinicPayrollConfig.findMany({
    where: { headNurseStaffProfileId: profile.id },
    select: { clinicId: true },
  });
  return configs.map((c) => c.clinicId);
}

/** Validate Lunch OT minutes against the clinic's Lunch OT permission. */
export async function guardLunchOt(clinicId: string, minutes: number | undefined | null): Promise<Guard> {
  if (!minutes) return { ok: true };
  const cfg = await getClinicPayrollSettings(clinicId);
  return checkLunchOt(cfg, minutes);
}

/**
 * Attendance for a month is frozen once the branch Head Nurse has submitted it.
 * Super Admin can still correct a submitted month.
 */
export async function guardMonthOpen(clinicId: string, date: Date, role: string): Promise<Guard> {
  if (role === "SUPER_ADMIN") return { ok: true };
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const submitted = await prisma.attendanceMonthSubmission.findUnique({
    where: { clinicId_month: { clinicId, month } },
  });
  if (!submitted) return { ok: true };
  return { ok: false, status: 409, error: `Attendance for ${month} has been submitted and is locked.` };
}
