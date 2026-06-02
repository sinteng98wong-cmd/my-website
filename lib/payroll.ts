import { prisma } from "./prisma";
import type { PayrollRun } from "@prisma/client";

const SOCSO_CEIL = 4000;
const EIS_CEIL = 4000;

const round = (n: number) => Math.round(n * 100) / 100;

/** Derive age from a Malaysian IC (YYMMDD-PB-###G). Falls back to 35. */
export function ageFromIc(icNo?: string | null): number {
  if (!icNo) return 35;
  const digits = icNo.replace(/\D/g, "");
  if (digits.length < 6) return 35;
  const yy = parseInt(digits.slice(0, 2), 10);
  const mm = parseInt(digits.slice(2, 4), 10);
  const dd = parseInt(digits.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return 35;
  const now = new Date();
  const century = yy <= (now.getFullYear() % 100) ? 2000 : 1900;
  const birthYear = century + yy;
  let age = now.getFullYear() - birthYear;
  const beforeBirthday = now.getMonth() + 1 < mm || (now.getMonth() + 1 === mm && now.getDate() < dd);
  if (beforeBirthday) age--;
  return age >= 0 && age < 120 ? age : 35;
}

// ── EPF ─────────────────────────────────────────────────────────────────────
export function calculateEpf(basicSalary: number, age: number): { employee: number; employer: number } {
  if (basicSalary <= 0) return { employee: 0, employer: 0 };
  const empRate = age > 60 ? 0.055 : 0.11;
  const erRate  = age > 60 ? 0.065 : basicSalary <= 5000 ? 0.13 : 0.12;
  return { employee: round(basicSalary * empRate), employer: round(basicSalary * erRate) };
}

// ── SOCSO ───────────────────────────────────────────────────────────────────
export function calculateSocso(basicSalary: number, age: number): { employee: number; employer: number } {
  const insured = Math.min(basicSalary, SOCSO_CEIL);
  if (age >= 60) {
    // Second category: employer only 1.25%
    return { employee: 0, employer: round(insured * 0.0125) };
  }
  return { employee: round(insured * 0.005), employer: round(insured * 0.0175) };
}

// ── EIS ─────────────────────────────────────────────────────────────────────
export function calculateEis(basicSalary: number, age: number): { employee: number; employer: number } {
  if (age >= 60) return { employee: 0, employer: 0 };
  const insured = Math.min(basicSalary, EIS_CEIL);
  return { employee: round(insured * 0.002), employer: round(insured * 0.002) };
}

// ── PCB (monthly tax) ────────────────────────────────────────────────────────
const TAX_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 5000, rate: 0 },
  { upTo: 20000, rate: 0.01 },
  { upTo: 35000, rate: 0.03 },
  { upTo: 50000, rate: 0.08 },
  { upTo: 70000, rate: 0.13 },
  { upTo: 100000, rate: 0.21 },
  { upTo: 250000, rate: 0.24 },
  { upTo: 400000, rate: 0.245 },
  { upTo: 600000, rate: 0.25 },
  { upTo: 1000000, rate: 0.26 },
  { upTo: Infinity, rate: 0.28 },
];

export function calculatePcb(monthlyBasic: number, allowances: number): number {
  const annualGross = (monthlyBasic + allowances) * 12;
  const chargeable = Math.max(0, annualGross - 9000); // standard individual relief
  let tax = 0;
  let prev = 0;
  for (const b of TAX_BRACKETS) {
    if (chargeable > prev) {
      const slice = Math.min(chargeable, b.upTo) - prev;
      tax += slice * b.rate;
      prev = b.upTo;
    } else break;
  }
  return round(tax / 12);
}

// ── Overtime ─────────────────────────────────────────────────────────────────
export function calculateOvertime(
  basicSalary: number,
  overtimeMinutes: number,
  dayType: "NORMAL" | "REST" | "PUBLIC_HOLIDAY"
): number {
  if (overtimeMinutes <= 0 || basicSalary <= 0) return 0;
  const hourlyRate = basicSalary / 26 / 8;
  const multiplier = dayType === "PUBLIC_HOLIDAY" ? 3 : dayType === "REST" ? 2 : 1.5;
  return round((overtimeMinutes / 60) * hourlyRate * multiplier);
}

// ── Unpaid leave ─────────────────────────────────────────────────────────────
export function calculateUnpaidLeaveDeduction(basicSalary: number, unpaidDays: number): number {
  if (unpaidDays <= 0 || basicSalary <= 0) return 0;
  return round((basicSalary / 26) * unpaidDays);
}

// ── Pay slip data ────────────────────────────────────────────────────────────
export interface PaySlipData {
  staffProfileId: string;
  basicSalary: number;
  allowances: number;
  overtime: number;
  commission: number;
  claims: number;
  grossSalary: number;
  epfEmployee: number;
  epfEmployer: number;
  socsoEmployee: number;
  socsoEmployer: number;
  eisEmployee: number;
  eisEmployer: number;
  incomeTax: number;
  unpaidLeaveDeduction: number;
  otherDeductions: number;
  netSalary: number;
  daysWorked: number;
  daysAbsent: number;
  daysLeave: number;
  daysPublicHoliday: number;
  overtimeMinutes: number;
}

const ALLOWANCE_TYPES = ["MEAL", "TRANSPORT", "TELEPHONE"];

export async function buildPaySlip(
  staffProfileId: string,
  clinicId: string,
  month: string,
  _payrollRunId: string
): Promise<PaySlipData> {
  const [y, m] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd   = new Date(Date.UTC(y, m, 1));

  const profile = await prisma.staffProfile.findUnique({
    where: { id: staffProfileId },
    select: { basicSalary: true, icNo: true },
  });
  const basicSalary = Number(profile?.basicSalary ?? 0);
  const age = ageFromIc(profile?.icNo);

  // Attendance (daily records)
  const attendance = await prisma.attendanceRecord.findMany({
    where: { staffProfileId, clinicId, date: { gte: monthStart, lt: monthEnd } },
  });
  let daysWorked = 0, daysAbsent = 0, daysPublicHoliday = 0, overtimeMinutes = 0;
  for (const a of attendance) {
    if (a.status === "PRESENT" || a.status === "LATE" || a.status === "REMOTE") daysWorked++;
    else if (a.status === "ABSENT") daysAbsent++;
    else if (a.status === "PUBLIC_HOLIDAY") daysPublicHoliday++;
    overtimeMinutes += a.overtimeMinutes ?? 0;
  }

  // Approved leave overlapping the month
  const leaves = await prisma.leaveApplication.findMany({
    where: { staffProfileId, clinicId, status: "APPROVED", startDate: { lt: monthEnd }, endDate: { gte: monthStart } },
  });
  const daysLeave = leaves.reduce((s, l) => s + Number(l.totalDays), 0);
  const unpaidDays = leaves.filter((l) => l.leaveType === "UNPAID").reduce((s, l) => s + Number(l.totalDays), 0);

  // Commission for the month
  const comm = await prisma.staffCommission.aggregate({
    where: { staffProfileId, month, forfeited: false },
    _sum: { proRatedComm: true },
  });
  const commission = Number(comm._sum.proRatedComm ?? 0);

  // Paid claims this month, split into allowances vs reimbursements
  const paidClaims = await prisma.staffClaim.findMany({
    where: { staffProfileId, clinicId, status: "PAID", paidAt: { gte: monthStart, lt: monthEnd } },
    select: { claimType: true, amount: true },
  });
  let allowances = 0, claims = 0;
  for (const c of paidClaims) {
    if (ALLOWANCE_TYPES.includes(c.claimType)) allowances += Number(c.amount);
    else claims += Number(c.amount);
  }

  const overtime = calculateOvertime(basicSalary, overtimeMinutes, "NORMAL");
  const grossSalary = round(basicSalary + allowances + overtime + commission + claims);

  const epf = calculateEpf(basicSalary, age);
  const socso = calculateSocso(basicSalary, age);
  const eis = calculateEis(basicSalary, age);
  const incomeTax = calculatePcb(basicSalary, allowances);
  const unpaidLeaveDeduction = calculateUnpaidLeaveDeduction(basicSalary, unpaidDays);
  const otherDeductions = 0;

  const netSalary = round(
    grossSalary - epf.employee - socso.employee - eis.employee - incomeTax - unpaidLeaveDeduction - otherDeductions
  );

  return {
    staffProfileId, basicSalary, allowances, overtime, commission, claims, grossSalary,
    epfEmployee: epf.employee, epfEmployer: epf.employer,
    socsoEmployee: socso.employee, socsoEmployer: socso.employer,
    eisEmployee: eis.employee, eisEmployer: eis.employer,
    incomeTax, unpaidLeaveDeduction, otherDeductions, netSalary,
    daysWorked, daysAbsent, daysLeave, daysPublicHoliday, overtimeMinutes,
  };
}

/** Active staff profiles at a clinic (home clinic or via UserClinic). */
async function clinicStaff(clinicId: string): Promise<string[]> {
  const ids = new Set<string>();
  const homed = await prisma.staffProfile.findMany({ where: { clinicId }, select: { id: true } });
  for (const s of homed) ids.add(s.id);
  const links = await prisma.userClinic.findMany({
    where: { clinicId, user: { active: true, staffProfile: { isNot: null } } },
    select: { user: { select: { staffProfile: { select: { id: true } } } } },
  });
  for (const l of links) if (l.user.staffProfile) ids.add(l.user.staffProfile.id);
  return [...ids];
}

export async function runPayroll(clinicId: string, month: string, runById: string): Promise<PayrollRun> {
  const existing = await prisma.payrollRun.findUnique({ where: { clinicId_month: { clinicId, month } } });
  if (existing) throw new Error(`Payroll for ${month} already exists for this clinic.`);

  const run = await prisma.payrollRun.create({
    data: {
      clinicId, month, status: "PROCESSING", runById,
      totalGross: 0, totalNet: 0, totalEpf: 0, totalSocso: 0, totalTax: 0,
    },
  });

  const staffIds = await clinicStaff(clinicId);
  let tG = 0, tN = 0, tEpf = 0, tSocso = 0, tTax = 0;

  for (const sid of staffIds) {
    const d = await buildPaySlip(sid, clinicId, month, run.id);
    await prisma.paySlip.create({
      data: {
        payrollRunId: run.id, staffProfileId: sid,
        basicSalary: d.basicSalary, allowances: d.allowances, overtime: d.overtime,
        commission: d.commission, claims: d.claims, grossSalary: d.grossSalary,
        epfEmployee: d.epfEmployee, epfEmployer: d.epfEmployer,
        socsoEmployee: d.socsoEmployee, socsoEmployer: d.socsoEmployer,
        eisEmployee: d.eisEmployee, eisEmployer: d.eisEmployer,
        incomeTax: d.incomeTax, unpaidLeaveDeduction: d.unpaidLeaveDeduction,
        otherDeductions: d.otherDeductions, netSalary: d.netSalary,
        daysWorked: d.daysWorked, daysAbsent: d.daysAbsent, daysLeave: Math.round(d.daysLeave),
        daysPublicHoliday: d.daysPublicHoliday, overtimeMinutes: d.overtimeMinutes,
      },
    });
    tG += d.grossSalary; tN += d.netSalary; tEpf += d.epfEmployee + d.epfEmployer;
    tSocso += d.socsoEmployee + d.socsoEmployer; tTax += d.incomeTax;
  }

  return prisma.payrollRun.update({
    where: { id: run.id },
    data: {
      status: "DRAFT",
      totalGross: round(tG), totalNet: round(tN), totalEpf: round(tEpf),
      totalSocso: round(tSocso), totalTax: round(tTax),
    },
    include: { slips: true },
  });
}
