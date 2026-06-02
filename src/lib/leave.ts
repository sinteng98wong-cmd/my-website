import { prisma } from "./prisma";
import type { HrLeaveType, LeaveBalance } from "@prisma/client";

/**
 * Malaysia public holidays (national). Hardcoded for the current year.
 * Format: "MM-DD". State holidays are intentionally omitted.
 */
const MY_PUBLIC_HOLIDAYS: string[] = [
  "01-01", // New Year's Day
  "02-01", // Federal Territory Day (KL/Labuan/Putrajaya)
  "05-01", // Labour Day
  "08-31", // Merdeka Day
  "09-16", // Malaysia Day
  "12-25", // Christmas
  // Movable feasts vary yearly — add the current year's dates here as needed:
  // Chinese New Year, Hari Raya Aidilfitri, Hari Raya Aidiladha,
  // Wesak, Deepavali, Awal Muharram, Maulidur Rasul, Thaipusam.
];

function isPublicHoliday(date: Date): boolean {
  const key = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return MY_PUBLIC_HOLIDAYS.includes(key);
}

/**
 * Working days between two dates (inclusive), excluding Sundays and
 * Malaysian public holidays.
 */
export async function calculateLeaveDays(
  startDate: Date,
  endDate: Date,
  _clinicId: string
): Promise<number> {
  const start = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
  const end   = new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()));
  if (end < start) return 0;

  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getUTCDay(); // 0 = Sunday
    if (dow !== 0 && !isPublicHoliday(cur)) days++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

/** Years of completed service as of a date. */
function yearsOfService(joinDate: Date, asOfDate: Date): number {
  let years = asOfDate.getFullYear() - joinDate.getFullYear();
  const m = asOfDate.getMonth() - joinDate.getMonth();
  if (m < 0 || (m === 0 && asOfDate.getDate() < joinDate.getDate())) years--;
  return Math.max(0, years);
}

/**
 * Entitled days based on Malaysia Employment Act tiers + years of service.
 */
export function calculateEntitlement(
  leaveType: HrLeaveType,
  joinDate: Date,
  asOfDate: Date
): number {
  const yos = yearsOfService(joinDate, asOfDate);

  switch (leaveType) {
    case "ANNUAL":
      if (yos < 2) return 8;
      if (yos <= 5) return 12;
      return 16;
    case "MEDICAL":
      if (yos < 2) return 14;
      if (yos <= 5) return 18;
      return 22;
    case "MATERNITY":      return 98;  // 2023 amendment
    case "PATERNITY":      return 7;
    case "HOSPITALISATION": return 60;
    case "COMPASSIONATE":  return 3;
    case "EMERGENCY":      return 3;    // employer discretion
    case "REPLACEMENT":    return 0;    // earned, not entitled by default
    case "UNPAID":         return 0;
    default:               return 0;
  }
}

/**
 * Get the leave balance for a staff member, creating it (with the correct
 * entitlement) if it does not yet exist.
 */
export async function getLeaveBalance(
  staffProfileId: string,
  year: number,
  leaveType: HrLeaveType
): Promise<LeaveBalance> {
  const existing = await prisma.leaveBalance.findUnique({
    where: { staffProfileId_year_leaveType: { staffProfileId, year, leaveType } },
  });
  if (existing) return existing;

  const profile = await prisma.staffProfile.findUnique({
    where: { id: staffProfileId },
    select: { joinDate: true },
  });
  const joinDate = profile?.joinDate ?? new Date(year, 0, 1);
  const entitled = calculateEntitlement(leaveType, joinDate, new Date(year, 11, 31));

  return prisma.leaveBalance.create({
    data: {
      staffProfileId, year, leaveType,
      entitled, taken: 0, pending: 0, carriedOver: 0, forfeited: 0,
      balance: entitled,
    },
  });
}

function recomputeBalance(b: { entitled: any; taken: any; pending: any; carriedOver: any }): number {
  return Number(b.entitled) + Number(b.carriedOver) - Number(b.taken) - Number(b.pending);
}

/** Move days from pending → taken, recompute balance. Called on approval. */
export async function deductLeaveBalance(
  staffProfileId: string,
  leaveType: HrLeaveType,
  days: number,
  year: number
): Promise<void> {
  const b = await getLeaveBalance(staffProfileId, year, leaveType);
  const taken   = Number(b.taken) + days;
  const pending = Math.max(0, Number(b.pending) - days);
  await prisma.leaveBalance.update({
    where: { id: b.id },
    data: { taken, pending, balance: recomputeBalance({ ...b, taken, pending }) },
  });
}

/**
 * Restore balance when leave is rejected/cancelled/withdrawn.
 * `fromTaken` = true when reversing an already-APPROVED leave.
 */
export async function restoreLeaveBalance(
  staffProfileId: string,
  leaveType: HrLeaveType,
  days: number,
  year: number,
  fromTaken = false
): Promise<void> {
  const b = await getLeaveBalance(staffProfileId, year, leaveType);
  let taken = Number(b.taken);
  let pending = Number(b.pending);
  if (fromTaken) taken = Math.max(0, taken - days);
  else pending = Math.max(0, pending - days);
  await prisma.leaveBalance.update({
    where: { id: b.id },
    data: { taken, pending, balance: recomputeBalance({ ...b, taken, pending }) },
  });
}

/**
 * Carry over unused ANNUAL leave to the next year (capped), forfeit the rest.
 */
export async function processYearEndCarryOver(
  staffProfileId: string,
  fromYear: number,
  maxCarryOver = 8
): Promise<void> {
  const prev = await prisma.leaveBalance.findUnique({
    where: { staffProfileId_year_leaveType: { staffProfileId, year: fromYear, leaveType: "ANNUAL" } },
  });
  if (!prev) return;

  const remaining = recomputeBalance(prev);
  const carry     = Math.max(0, Math.min(remaining, maxCarryOver));
  const forfeited = Math.max(0, remaining - carry);

  // Mark forfeiture on the closing year
  await prisma.leaveBalance.update({
    where: { id: prev.id },
    data: { forfeited, balance: 0 },
  });

  // Seed/refresh next year's balance with carried-over days
  const next = await getLeaveBalance(staffProfileId, fromYear + 1, "ANNUAL");
  await prisma.leaveBalance.update({
    where: { id: next.id },
    data: { carriedOver: carry, balance: recomputeBalance({ ...next, carriedOver: carry }) },
  });
}
