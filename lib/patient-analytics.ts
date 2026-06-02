import { prisma } from "./prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { getUserClinics } from "./selected-clinic";

export type DateRange = "month" | "quarter" | "year" | "all";

export async function guardAnalytics() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) return null;
  return session;
}

/** Resolve which clinic ids to include. */
export async function resolveClinicIds(clinicId?: string | null): Promise<string[]> {
  if (clinicId) return [clinicId];
  const clinics = await getUserClinics();
  return clinics.map((c) => c.id);
}

export function rangeStart(range: DateRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "month")   return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "quarter") return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return new Date(now.getFullYear(), 0, 1); // year
}

/** Previous period start/end for trend comparison. */
export function previousRange(range: DateRange): { start: Date; end: Date } | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "month") {
    return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) };
  }
  if (range === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return { start: new Date(now.getFullYear(), (q - 1) * 3, 1), end: new Date(now.getFullYear(), q * 3, 1) };
  }
  return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear(), 0, 1) };
}

function baseWhere(clinicIds: string[], range: DateRange) {
  const start = rangeStart(range);
  return {
    deletedAt: null,
    homeClinicId: { in: clinicIds },
    ...(start ? { createdAt: { gte: start } } : {}),
  };
}

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 1000) / 10;
}

// ── Source analysis ────────────────────────────────────────────────────────
export async function sourceReport(clinicIds: string[], range: DateRange) {
  const where = baseWhere(clinicIds, range);
  const [patients, sources] = await Promise.all([
    prisma.patient.findMany({ where, select: { sourceId: true } }),
    prisma.patientSource.findMany({ select: { id: true, name: true } }),
  ]);
  const total = patients.length;
  const counts = new Map<string, number>();
  for (const p of patients) counts.set(p.sourceId ?? "none", (counts.get(p.sourceId ?? "none") ?? 0) + 1);

  // Previous-period counts for trend
  const prev = previousRange(range);
  let prevCounts = new Map<string, number>();
  if (prev) {
    const prevPatients = await prisma.patient.findMany({
      where: { deletedAt: null, homeClinicId: { in: clinicIds }, createdAt: { gte: prev.start, lt: prev.end } },
      select: { sourceId: true },
    });
    for (const p of prevPatients) prevCounts.set(p.sourceId ?? "none", (prevCounts.get(p.sourceId ?? "none") ?? 0) + 1);
  }

  const breakdown = sources.map((s) => {
    const count = counts.get(s.id) ?? 0;
    const prevCount = prevCounts.get(s.id) ?? 0;
    const trend = prevCount === 0 ? (count > 0 ? 100 : 0) : Math.round(((count - prevCount) / prevCount) * 1000) / 10;
    return { sourceId: s.id, sourceName: s.name, count, percentage: pct(count, total), trend };
  }).filter((b) => b.count > 0).sort((a, b) => b.count - a.count);

  return { total, breakdown };
}

// ── Referral breakdown + commission summary ────────────────────────────────
const REFERRAL_LABELS: Record<string, string> = {
  PATIENT: "Patient Referral", INTERNAL_DOCTOR: "Doctor Referral",
  INTERNAL_CLINIC: "Clinic Referral", EXTERNAL: "External Referral",
};

export async function referralReport(clinicIds: string[], range: DateRange) {
  const where = baseWhere(clinicIds, range);
  const referred = await prisma.patient.findMany({
    where: { ...where, referralType: { not: null } },
    select: {
      referralType: true,
      referredByPatientId: true, referredByPatient: { select: { id: true, name: true } },
      referredByDoctorId: true,  referredByDoctor:  { select: { id: true, name: true, userClinics: { select: { clinic: { select: { name: true } } }, take: 1 } } },
      referredByClinicId: true,  referredByClinic:  { select: { id: true, name: true } },
      externalReferrerName: true, externalReferrerType: true,
    },
  });
  const total = referred.length;

  const byTypeCount = new Map<string, number>();
  const docMap = new Map<string, { doctorId: string; doctorName: string; clinicName: string; referralCount: number }>();
  const cliMap = new Map<string, { clinicId: string | null; clinicName: string; referralCount: number }>();
  const patMap = new Map<string, { patientId: string; patientName: string; referralCount: number }>();
  const extMap = new Map<string, { externalName: string; externalReferrerType: string; referralCount: number }>();

  for (const r of referred) {
    byTypeCount.set(r.referralType!, (byTypeCount.get(r.referralType!) ?? 0) + 1);
    if (r.referredByDoctor) {
      const k = r.referredByDoctor.id;
      const cur = docMap.get(k) ?? { doctorId: k, doctorName: r.referredByDoctor.name, clinicName: r.referredByDoctor.userClinics[0]?.clinic.name ?? "", referralCount: 0 };
      cur.referralCount++; docMap.set(k, cur);
    }
    if (r.referredByClinic) {
      const k = r.referredByClinic.id;
      const cur = cliMap.get(k) ?? { clinicId: k, clinicName: r.referredByClinic.name, referralCount: 0 };
      cur.referralCount++; cliMap.set(k, cur);
    }
    if (r.referredByPatient) {
      const k = r.referredByPatient.id;
      const cur = patMap.get(k) ?? { patientId: k, patientName: r.referredByPatient.name, referralCount: 0 };
      cur.referralCount++; patMap.set(k, cur);
    }
    if (r.referralType === "EXTERNAL" && r.externalReferrerName) {
      const k = `${r.externalReferrerName}|${r.externalReferrerType ?? ""}`;
      const cur = extMap.get(k) ?? { externalName: r.externalReferrerName, externalReferrerType: r.externalReferrerType ?? "person", referralCount: 0 };
      cur.referralCount++; extMap.set(k, cur);
    }
  }

  // Commission totals per referrer (all-time, by referrer entity)
  const commissions = await prisma.referralCommission.findMany({
    where: { patient: { homeClinicId: { in: clinicIds } } },
    select: { doctorId: true, clinicId: true, patientId: true, calculatedAmount: true, status: true, referralType: true },
  });
  const docComm = new Map<string, number>(), cliComm = new Map<string, number>(), patComm = new Map<string, number>();
  for (const c of commissions) {
    const amt = Number(c.calculatedAmount);
    if (c.doctorId) docComm.set(c.doctorId, (docComm.get(c.doctorId) ?? 0) + amt);
    if (c.clinicId) cliComm.set(c.clinicId, (cliComm.get(c.clinicId) ?? 0) + amt);
    if (c.patientId) patComm.set(c.patientId, (patComm.get(c.patientId) ?? 0) + amt);
  }

  const byType = (["PATIENT", "INTERNAL_DOCTOR", "INTERNAL_CLINIC", "EXTERNAL"] as const).map((t) => ({
    type: t, label: REFERRAL_LABELS[t], count: byTypeCount.get(t) ?? 0, percentage: pct(byTypeCount.get(t) ?? 0, total),
  }));

  // Commission summary
  const sumByStatus = { PENDING: 0, APPROVED: 0, PAID: 0, VOIDED: 0 } as Record<string, number>;
  const byTypeComm = new Map<string, { count: number; pendingAmount: number; approvedAmount: number; paidAmount: number }>();
  for (const c of commissions) {
    const amt = Number(c.calculatedAmount);
    sumByStatus[c.status] = (sumByStatus[c.status] ?? 0) + amt;
    const cur = byTypeComm.get(c.referralType) ?? { count: 0, pendingAmount: 0, approvedAmount: 0, paidAmount: 0 };
    cur.count++;
    if (c.status === "PENDING")  cur.pendingAmount  += amt;
    if (c.status === "APPROVED") cur.approvedAmount += amt;
    if (c.status === "PAID")     cur.paidAmount     += amt;
    byTypeComm.set(c.referralType, cur);
  }

  return {
    referralBreakdown: {
      byType,
      topReferringDoctors:  [...docMap.values()].map((d) => ({ ...d, totalCommission: docComm.get(d.doctorId) ?? 0 })).sort((a, b) => b.referralCount - a.referralCount).slice(0, 10),
      topReferringClinics:  [...cliMap.values()].map((c) => ({ ...c, totalCommission: c.clinicId ? cliComm.get(c.clinicId) ?? 0 : 0 })).sort((a, b) => b.referralCount - a.referralCount).slice(0, 10),
      topReferringPatients: [...patMap.values()].map((p) => ({ ...p, totalCommission: patComm.get(p.patientId) ?? 0 })).sort((a, b) => b.referralCount - a.referralCount).slice(0, 10),
      topExternalReferrers: [...extMap.values()].sort((a, b) => b.referralCount - a.referralCount).slice(0, 10),
    },
    commissionSummary: {
      totalPending:  sumByStatus.PENDING,
      totalApproved: sumByStatus.APPROVED,
      totalPaid:     sumByStatus.PAID,
      totalVoided:   sumByStatus.VOIDED,
      byType: [...byTypeComm.entries()].map(([referralType, v]) => ({ referralType, label: REFERRAL_LABELS[referralType] ?? referralType, ...v })),
    },
  };
}

// ── Age analysis ───────────────────────────────────────────────────────────
const AGE_GROUPS: { group: string; label: string; min: number; max: number }[] = [
  { group: "0-12",  label: "Children",     min: 0,  max: 12 },
  { group: "13-17", label: "Teenagers",    min: 13, max: 17 },
  { group: "18-24", label: "Young Adults", min: 18, max: 24 },
  { group: "25-34", label: "Adults",       min: 25, max: 34 },
  { group: "35-44", label: "Adults",       min: 35, max: 44 },
  { group: "45-54", label: "Middle-aged",  min: 45, max: 54 },
  { group: "55-64", label: "Senior",       min: 55, max: 64 },
  { group: "65+",   label: "Elderly",      min: 65, max: 200 },
];

function ageFrom(dob: Date): number {
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

export async function ageReport(clinicIds: string[], range: DateRange) {
  const patients = await prisma.patient.findMany({ where: baseWhere(clinicIds, range), select: { dateOfBirth: true } });
  const total = patients.length;
  const ages: number[] = [];
  const counts = new Map<string, number>();
  let unknown = 0;
  for (const p of patients) {
    if (!p.dateOfBirth) { unknown++; continue; }
    const a = ageFrom(p.dateOfBirth);
    ages.push(a);
    const grp = AGE_GROUPS.find((g) => a >= g.min && a <= g.max);
    if (grp) counts.set(grp.group, (counts.get(grp.group) ?? 0) + 1);
  }
  const sorted = [...ages].sort((a, b) => a - b);
  const averageAge = ages.length ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : 0;
  const medianAge  = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

  const breakdown = [
    ...AGE_GROUPS.map((g) => ({ group: g.group, label: g.label, count: counts.get(g.group) ?? 0, percentage: pct(counts.get(g.group) ?? 0, total) })),
    { group: "unknown", label: "No DOB", count: unknown, percentage: pct(unknown, total) },
  ];

  return {
    averageAge, medianAge,
    youngest: sorted.length ? sorted[0] : 0,
    oldest:   sorted.length ? sorted[sorted.length - 1] : 0,
    breakdown,
  };
}

// ── Address analysis ───────────────────────────────────────────────────────
export async function addressReport(clinicIds: string[], range: DateRange) {
  const patients = await prisma.patient.findMany({
    where: baseWhere(clinicIds, range),
    select: { address: true, city: true, state: true, postcode: true },
  });
  const total = patients.length;
  const withAddress = patients.filter((p) => p.address || p.city || p.state).length;

  const stateCounts = new Map<string, number>();
  const cityCounts  = new Map<string, { city: string; state: string; count: number }>();
  const postCounts  = new Map<string, { postcode: string; city: string; count: number }>();
  for (const p of patients) {
    if (p.state) stateCounts.set(p.state, (stateCounts.get(p.state) ?? 0) + 1);
    if (p.city) {
      const key = `${p.city}|${p.state ?? ""}`;
      const cur = cityCounts.get(key) ?? { city: p.city, state: p.state ?? "", count: 0 };
      cur.count++; cityCounts.set(key, cur);
    }
    if (p.postcode) {
      const cur = postCounts.get(p.postcode) ?? { postcode: p.postcode, city: p.city ?? "", count: 0 };
      cur.count++; postCounts.set(p.postcode, cur);
    }
  }

  return {
    total,
    withAddress,
    withoutAddress: total - withAddress,
    coveragePercentage: pct(withAddress, total),
    byState: [...stateCounts.entries()].map(([state, count]) => ({ state, count, percentage: pct(count, total) })).sort((a, b) => b.count - a.count),
    byCity:  [...cityCounts.values()].sort((a, b) => b.count - a.count).slice(0, 20),
    byPostcode: [...postCounts.values()].sort((a, b) => b.count - a.count).slice(0, 20),
  };
}

// ── Gender analysis ────────────────────────────────────────────────────────
export async function genderReport(clinicIds: string[], range: DateRange) {
  const patients = await prisma.patient.findMany({ where: baseWhere(clinicIds, range), select: { gender: true } });
  const total = patients.length;
  const c = { MALE: 0, FEMALE: 0, OTHER: 0, unknown: 0 };
  for (const p of patients) {
    if (p.gender === "MALE") c.MALE++;
    else if (p.gender === "FEMALE") c.FEMALE++;
    else if (p.gender === "OTHER") c.OTHER++;
    else c.unknown++;
  }
  return {
    breakdown: [
      { gender: "MALE",    label: "Male",    count: c.MALE,    percentage: pct(c.MALE, total) },
      { gender: "FEMALE",  label: "Female",  count: c.FEMALE,  percentage: pct(c.FEMALE, total) },
      { gender: "OTHER",   label: "Other",   count: c.OTHER,   percentage: pct(c.OTHER, total) },
      { gender: "unknown", label: "Unknown", count: c.unknown, percentage: pct(c.unknown, total) },
    ],
  };
}
