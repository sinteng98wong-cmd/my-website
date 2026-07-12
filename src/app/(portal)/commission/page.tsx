import React from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StaffCommissionTable }  from "./StaffCommissionTable";
import { LocumPayoutTable, type LocumDoctorGroup } from "./LocumPayoutTable";
import { DailySignoffPanel, type DayRow } from "./DailySignoffPanel";
import { MonthlyCommissionPanel, type MonthlyData } from "./MonthlyCommissionPanel";
import { CaseProgressPanel, type CaseRow } from "./CaseProgressPanel";
import { getEffectiveSchemes, matchScheme, computeStageRelease, isScanCode, getEffectiveScanRates, scanFlatRate } from "@/services/locum-payout.service";
import { redirect } from "next/navigation";
import { Users, Calculator, Banknote, FileCheck, Wallet, BadgeCheck, type LucideIcon } from "lucide-react";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

const TABS = [
  { key: "locum",  label: "Doctor Payout",     Icon: Wallet },
  { key: "staff",  label: "Staff Commission",  Icon: Users },
] as const;

export default async function CommissionPage({
  searchParams,
}: {
  searchParams: { month?: string; tab?: string; view?: string; day?: string; signoffDoctor?: string; payoutView?: string };
}) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role   as string;
  const userId  = (session?.user as any)?.id     as string;

  // Commission entitlement is not for counter/clinical staff. Counters get the
  // cash-only reconciliation page; storekeepers have no business here.
  if (["RECEPTIONIST", "NURSE"].includes(role)) redirect("/commission/counter-daily");
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "DOCTOR"].includes(role)) redirect("/dashboard");

  const month       = searchParams.month ?? new Date().toISOString().slice(0, 7);
  const tabParam    = searchParams.tab ?? "locum";
  const tab         = (TABS.some(t => t.key === tabParam) ? tabParam : "locum") as typeof TABS[number]["key"];
  const view        = searchParams.view === "doctor" ? "doctor" : "status";
  const isDoctor  = role === "DOCTOR";
  const canLock   = ["SUPER_ADMIN", "FINANCE"].includes(role);
  const canRun    = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);

  const { getSelectedClinicId } = await import("@/lib/selected-clinic");
  const selectedClinicId = getSelectedClinicId() ?? "";

  // DoctorProfile id for the signed-in doctor (needed for payout ownership check)
  const ownDoctorProfileId = isDoctor && userId
    ? await prisma.doctorProfile.findFirst({ where: { userId }, select: { id: true } })
        .then(r => r?.id ?? null).catch(() => null)
    : null;

  const [staffComms, stmtRows, locumLines] = await Promise.all([
    tab === "staff"
      ? prisma.staffCommission.findMany({
          where:   { month },
          include: { staffProfile: { include: { user: { select: { name: true } } } } },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : Promise.resolve([]),

    // Monthly statements for all doctors
    (prisma as any).locumReconciliationStatement.findMany({
      where:  { month },
      select: { id: true, doctorId: true, status: true, finalPayout: true },
    }).catch(() => []),

    // Payout lines — every doctor's per-treatment earnings
    (prisma as any).locumPayoutLine.findMany({
      where: {
        month,
        ...(selectedClinicId ? { clinicId: selectedClinicId } : {}),
        ...(isDoctor && ownDoctorProfileId ? { doctorProfileId: ownDoctorProfileId } : {}),
      },
      include: {
        treatment: {
          include: {
            treatmentType: { select: { code: true, name: true } },
            visit:         { include: { patient: { select: { name: true, patientRef: true } } } },
          },
        },
        treatmentPlan: {
          select: {
            planRef: true, title: true, status: true, totalAmount: true, totalPaid: true,
            stages: { select: { status: true, order: true }, orderBy: { order: "asc" } },
          },
        },
        doctorProfile: {
          select: {
            id:      true,
            dayRate: true,
            user:    { select: { name: true } },
            engagements: {
              where:  { month },
              select: { sessionsWorked: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }).catch(() => []),
  ]);

  // Statement lookup: DoctorProfile.id → { id, status }
  const stmtByDoctor: Record<string, { id: string; status: string }> = {};
  for (const s of stmtRows as any[]) stmtByDoctor[s.doctorId] = { id: s.id, status: s.status };

  // Classify each line into a workflow bucket for the status-grouped view,
  // and compute how much of the case the completed stages have earned so far
  const schemes = await getEffectiveSchemes(selectedClinicId || null).catch(() => []);
  const scanRates = await getEffectiveScanRates(selectedClinicId || null).catch(() => []);
  function classify(l: any): { bucket: string; accruedPct: number | null } {
    if (l.status === "VOIDED") return { bucket: "voided", accruedPct: null };
    if (l.status === "PAID")   return { bucket: "paid",   accruedPct: null };

    const scheme = matchScheme(schemes, l.treatment.treatmentType.code, l.subType ?? null);
    let accruedPct: number | null = null;
    let stage: ReturnType<typeof computeStageRelease> | null = null;
    if (l.treatmentPlan && scheme && scheme.stages.length > 0) {
      stage = computeStageRelease(scheme, {
        planStages:      (l.treatmentPlan.stages ?? []) as { status: string }[],
        planStatus:      l.treatmentPlan.status,
        totalPackage:    Number(l.treatmentPlan.totalAmount),
        totalCollected:  Number(l.treatmentPlan.totalPaid),
        labFeeConfirmed: !!l.labFeeConfirmed,
      });
      accruedPct = stage.accruedPct;
    }

    if (l.status === "PENDING_RELEASE") return { bucket: "ready_to_pay", accruedPct };
    if (!l.counterVerifiedAt || !l.doctorVerifiedAt) return { bucket: "pending_verification", accruedPct };
    if (l.treatment.labJobId && !l.labFeeConfirmed)  return { bucket: "pending_lab", accruedPct };

    if (stage && scheme) {
      const releasable = Number(l.entitledAmount) * stage.releasablePct / 100;
      if (releasable > Number(l.releasedAmount) + 0.005) return { bucket: "ready_to_release", accruedPct };
      if (scheme.paymentTracked) return { bucket: "pending_payment", accruedPct };
      const blockers = stage.breakdown.filter(b => !b.satisfied);
      if (blockers.some(b => b.blockedType === "payment")) return { bucket: "pending_payment", accruedPct };
      if (blockers.some(b => b.blockedType === "lab"))     return { bucket: "pending_lab", accruedPct };
      return { bucket: "pending_completion", accruedPct };
    }
    if (!l.completionMarkedAt) return { bucket: "pending_completion", accruedPct };
    return { bucket: "ready_to_release", accruedPct };
  }

  // Group payout lines by doctor
  function buildLocumGroups(lines: any[]): LocumDoctorGroup[] {
    const map = new Map<string, LocumDoctorGroup>();
    for (const l of lines) {
      const dp  = l.doctorProfile;
      const did = dp.id as string;
      if (!map.has(did)) {
        const sessionsWorked = (dp.engagements as any[]).reduce((s: number, e: any) => s + (e.sessionsWorked ?? 0), 0);
        const dayRate        = Number(dp.dayRate ?? 0);
        map.set(did, {
          doctorProfileId: did,
          doctorName:      dp.user?.name ?? "Unknown Doctor",
          dayRate,
          sessionsWorked,
          basicPayFloor:   sessionsWorked * dayRate,
          totalBilled:     0,
          totalNetPool:    0,
          totalEntitled:   0,
          totalReleased:   0,
          lines:           [],
        });
      }
      const g = map.get(did)!;
      const { bucket, accruedPct } = classify(l);
      const line = {
        id:                 l.id,
        category:           l.category,
        status:             l.status,
        bucket,
        accruedPct,
        billedAmount:       Number(l.billedAmount),
        labFee:             Number(l.labFee),
        labFeeConfirmed:    l.labFeeConfirmed,
        sst:                Number(l.sst),
        doctorSplit:        Number(l.doctorSplit),
        netPool:            Number(l.netPool),
        entitledAmount:     Number(l.entitledAmount),
        releasedAmount:     Number(l.releasedAmount),
        counterVerifiedAt:  l.counterVerifiedAt?.toISOString() ?? null,
        doctorVerifiedAt:   l.doctorVerifiedAt?.toISOString()  ?? null,
        labFeeLoggedAt:     l.labFeeLoggedAt?.toISOString()    ?? null,
        completionMarkedAt: l.completionMarkedAt?.toISOString() ?? null,
        pendingReleaseAt:   l.pendingReleaseAt?.toISOString()  ?? null,
        paidAt:             l.paidAt?.toISOString()            ?? null,
        forceReleasedAt:    l.forceReleasedAt?.toISOString()   ?? null,
        subType:            l.subType    ?? null,
        toothCodes:         l.toothCodes ?? null,
        notes:              l.notes ?? null,
        treatment: {
          treatmentType: { name: l.treatment.treatmentType.name, code: l.treatment.treatmentType.code },
          visit:         { patient: { name: l.treatment.visit.patient.name, patientRef: l.treatment.visit.patient.patientRef } },
          labJobId:      l.treatment.labJobId ?? null,
        },
        treatmentPlan: l.treatmentPlan
          ? { planRef: l.treatmentPlan.planRef, title: l.treatmentPlan.title, status: l.treatmentPlan.status,
              totalAmount: Number(l.treatmentPlan.totalAmount), totalPaid: Number(l.treatmentPlan.totalPaid) }
          : null,
      };
      g.lines.push(line);
      g.totalBilled   += line.billedAmount;
      g.totalNetPool  += line.netPool;
      g.totalEntitled += line.entitledAmount;
      g.totalReleased += line.releasedAmount;
    }
    return Array.from(map.values());
  }

  const locumGroups = buildLocumGroups(locumLines as any[]);

  // ── Daily sign-off panel data ─────────────────────────────────────────
  // Doctors see their own day; manage roles pick any doctor.
  const canPickDoctor = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);
  const todayMYT = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  const day = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day ?? "") ? searchParams.day! : todayMYT;

  let signoffDoctors: { id: string; name: string }[] = [];
  let signoffDoctorId = ownDoctorProfileId ?? "";
  if (canPickDoctor) {
    signoffDoctors = (await prisma.doctorProfile.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    })).map(d => ({ id: d.id, name: d.user.name }));
    signoffDoctorId = searchParams.signoffDoctor && signoffDoctors.some(d => d.id === searchParams.signoffDoctor)
      ? searchParams.signoffDoctor
      : (signoffDoctors[0]?.id ?? "");
  }

  let dayRows: DayRow[] = [];
  let signedAt: string | null = null;
  let signoffDoctorName: string | null = null;
  let signoffDoctorRate = 0;
  if (tab === "locum" && signoffDoctorId) {
    const dayStart = new Date(day);
    const dayEnd   = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const inDay = (d: Date | string | null | undefined) => {
      if (!d) return false;
      const t = new Date(d).getTime();
      return t >= dayStart.getTime() && t < dayEnd.getTime();
    };

    const lineSelect = {
      id: true, status: true, category: true, doctorVerifiedAt: true, subType: true,
      labFee: true, labFeeConfirmed: true, treatmentPlanId: true,
    };

    const [profile, sameDayTreatments, stageLines, signoffRow] = await Promise.all([
      prisma.doctorProfile.findUnique({ where: { id: signoffDoctorId }, select: { defaultRate: true } }),

      // A. Treatments recorded at visits that day
      prisma.treatment.findMany({
        where: {
          doctorId: signoffDoctorId,
          visit: { visitDate: { gte: dayStart, lt: dayEnd }, deletedAt: null },
        },
        include: {
          treatmentType: { select: { code: true, name: true } },
          visit: { select: { visitDate: true, patient: { select: { name: true, patientRef: true } } } },
          locumPayoutLines: { where: { doctorProfileId: signoffDoctorId }, select: lineSelect },
        },
        orderBy: { createdAt: "asc" },
      }),

      // B. The doctor's staged cases with a stage completed that day
      //    (the case itself may have been billed on an earlier visit)
      (prisma as any).locumPayoutLine.findMany({
        where: {
          doctorProfileId: signoffDoctorId,
          treatmentPlanId: { not: null },
          treatmentPlan:   { stages: { some: { completedAt: { gte: dayStart, lt: dayEnd } } } },
        },
        select: {
          ...lineSelect,
          treatment: {
            select: {
              id: true, billedAmount: true, collectedAmount: true, labFee: true,
              treatmentType: { select: { code: true, name: true } },
              visit: { select: { visitDate: true, patient: { select: { name: true, patientRef: true } } } },
            },
          },
          treatmentPlan: {
            select: { id: true, stages: { select: { name: true, order: true, completedAt: true }, orderBy: { order: "asc" } } },
          },
        },
      }).catch(() => []),

      (prisma as any).doctorDailySignoff.findFirst({
        where: { doctorId: signoffDoctorId, date: dayStart },
        select: { signedAt: true },
      }).catch(() => null),
    ]);

    signoffDoctorRate = Number(profile?.defaultRate ?? 0);

    // Patient installments recorded that day, per plan
    const planIds = Array.from(new Set([
      ...(stageLines as any[]).map(l => l.treatmentPlanId),
      ...(sameDayTreatments as any[]).flatMap(t => t.locumPayoutLines.map((l: any) => l.treatmentPlanId)),
    ].filter(Boolean)));
    const planPayments = planIds.length
      ? await prisma.treatmentPlanPayment.groupBy({
          by: ["planId"],
          where: { planId: { in: planIds as string[] }, paidAt: { gte: dayStart, lt: dayEnd } },
          _sum:  { amount: true },
        }).catch(() => [])
      : [];
    const paidByPlan = new Map(planPayments.map((p: any) => [p.planId, Number(p._sum.amount ?? 0)]));

    // Stage weightage gained that day: plan stage i ↔ scheme stage i (by order)
    function weightageToday(line: any, planStages: { name: string; completedAt: Date | null }[], code: string) {
      const scheme = matchScheme(schemes, code, line?.subType ?? null);
      const stagesDone: string[] = [];
      let pct = 0;
      planStages.forEach((s, i) => {
        if (inDay(s.completedAt)) {
          stagesDone.push(s.name);
          pct += scheme?.stages[i]?.percent ?? 0;
        }
      });
      return { stagesDone, pct };
    }

    const rowsMap = new Map<string, DayRow>();

    // B rows first (carry stage weightage); A rows fill in the rest
    for (const l of stageLines as any[]) {
      const t = l.treatment;
      const { stagesDone, pct } = weightageToday(l, l.treatmentPlan.stages, t.treatmentType.code);
      const billed = Number(t.billedAmount);
      const labFee = Number(l.labFee);
      const net    = Math.max(0, billed - labFee);
      rowsMap.set(l.id, {
        id:             l.id,
        patientName:    t.visit.patient.name,
        patientRef:     t.visit.patient.patientRef,
        treatmentName:  t.treatmentType.name,
        subType:        l.subType ?? null,
        section:        "progressive",
        stagesDone,
        weightagePct:   pct,
        paidToday:      (inDay(t.visit.visitDate) ? Number(t.collectedAmount) : 0) + (paidByPlan.get(l.treatmentPlanId) ?? 0),
        billed,
        labFee,
        labFeeConfirmed: !!l.labFeeConfirmed,
        net,
        gained:         Math.round(net * pct) / 100,
        lineStatus:     l.status,
        doctorVerified: !!l.doctorVerifiedAt,
      });
    }

    for (const t of sameDayTreatments as any[]) {
      const line = t.locumPayoutLines[0] ?? null;
      if (line && rowsMap.has(line.id)) continue; // already covered by B
      const code    = t.treatmentType.code;
      const scan    = isScanCode(code);
      const staged  = !!line && line.category !== "ONE_OFF" && !scan;
      const billed  = Number(t.billedAmount);
      const labFee  = Number(line?.labFee ?? t.labFee);
      const net     = Math.max(0, billed - labFee);
      const planPaid = line?.treatmentPlanId ? (paidByPlan.get(line.treatmentPlanId) ?? 0) : 0;
      rowsMap.set(line?.id ?? `t-${t.id}`, {
        id:             line?.id ?? `t-${t.id}`,
        patientName:    t.visit.patient.name,
        patientRef:     t.visit.patient.patientRef,
        treatmentName:  t.treatmentType.name,
        subType:        line?.subType ?? null,
        section:        scan ? "scan" : staged ? "progressive" : "oneoff",
        stagesDone:     [],
        weightagePct:   staged ? 0 : 100,
        paidToday:      Number(t.collectedAmount) + planPaid,
        billed,
        labFee,
        labFeeConfirmed: line ? !!line.labFeeConfirmed : null,
        net,
        gained:         scan ? scanFlatRate(scanRates, code) : staged ? 0 : net, // scans: configurable flat rate; staged earns via stages
        lineStatus:     line?.status ?? null,
        doctorVerified: !!line?.doctorVerifiedAt,
      });
    }

    dayRows = Array.from(rowsMap.values());
    signedAt = signoffRow?.signedAt?.toISOString() ?? null;
    signoffDoctorName = canPickDoctor
      ? (signoffDoctors.find(d => d.id === signoffDoctorId)?.name ?? null)
      : null;
  }

  // ── Monthly commission summary (spreadsheet-style) ────────────────────
  const payoutView: "daily" | "monthly" | "cases" =
    searchParams.payoutView === "monthly" ? "monthly"
    : searchParams.payoutView === "cases" ? "cases"
    : "daily";
  let monthly: MonthlyData | null = null;
  if (tab === "locum" && signoffDoctorId && payoutView === "monthly") {
    const mStart = new Date(`${month}-01T00:00:00+08:00`);
    const [my, mm] = month.split("-").map(Number);
    const nextM = mm === 12 ? `${my + 1}-01` : `${my}-${String(mm + 1).padStart(2, "0")}`;
    const mEnd = new Date(`${nextM}-01T00:00:00+08:00`);
    const inMonth = (d: Date | string | null | undefined) => {
      if (!d) return false;
      const t = new Date(d).getTime();
      return t >= mStart.getTime() && t < mEnd.getTime();
    };

    const CATEGORY_LABEL: Record<string, string> = {
      "One-Off":       "Gross Collection (One-Off)",
      "RCT":           "ENDO Case (Root Canal)",
      "Denture Case":  "Denture Case",
      "Crown / Bridge":"Crown / Bridge Case",
      "Ortho":         "Ortho Case",
      "Aligner":       "Aligner Case",
    };
    const CATEGORY_ORDER = ["One-Off", "RCT", "Denture Case", "Crown / Bridge", "Ortho", "Aligner"];

    const [monthTreatments, monthStageLines] = await Promise.all([
      prisma.treatment.findMany({
        where: { doctorId: signoffDoctorId, visit: { visitDate: { gte: mStart, lt: mEnd }, deletedAt: null } },
        select: {
          id: true, billedAmount: true, labFee: true,
          treatmentType: { select: { code: true, name: true } },
          locumPayoutLines: { where: { doctorProfileId: signoffDoctorId }, select: { id: true, category: true, labFee: true, subType: true, treatmentPlanId: true } },
        },
      }),
      (prisma as any).locumPayoutLine.findMany({
        where: { doctorProfileId: signoffDoctorId, treatmentPlanId: { not: null }, treatmentPlan: { stages: { some: { completedAt: { gte: mStart, lt: mEnd } } } } },
        select: {
          id: true, labFee: true, subType: true, treatmentPlanId: true,
          treatment: { select: { billedAmount: true, treatmentType: { select: { code: true } } } },
          treatmentPlan: { select: { stages: { select: { completedAt: true }, orderBy: { order: "asc" } } } },
        },
      }).catch(() => []),
    ]);

    const catAmount = new Map<string, number>();
    const scanCount = new Map<string, number>();
    const seenLine = new Set<string>();

    // Progressive stage-completions in month (source B)
    for (const l of monthStageLines as any[]) {
      seenLine.add(l.id);
      const scheme = matchScheme(schemes, l.treatment.treatmentType.code, l.subType ?? null);
      let pct = 0;
      (l.treatmentPlan.stages as any[]).forEach((s, i) => { if (inMonth(s.completedAt)) pct += scheme?.stages[i]?.percent ?? 0; });
      const net = Math.max(0, Number(l.treatment.billedAmount) - Number(l.labFee));
      const gained = Math.round(net * pct) / 100;
      const cat = scheme?.name ?? "One-Off";
      catAmount.set(cat, (catAmount.get(cat) ?? 0) + gained);
    }

    // Same-month treatments (source A): one-off net + scans; progressive already in B
    for (const t of monthTreatments as any[]) {
      const line = t.locumPayoutLines[0] ?? null;
      const code = t.treatmentType.code;
      if (isScanCode(code)) { scanCount.set(code, (scanCount.get(code) ?? 0) + 1); continue; }
      if (line && seenLine.has(line.id)) continue;
      const staged = !!line && line.category !== "ONE_OFF";
      if (staged) continue; // progressive counts only via completed stages (source B)
      const net = Math.max(0, Number(t.billedAmount) - Number(line?.labFee ?? t.labFee));
      catAmount.set("One-Off", (catAmount.get("One-Off") ?? 0) + net);
    }

    const categories = CATEGORY_ORDER
      .map(key => ({ key, label: CATEGORY_LABEL[key] ?? key, amount: Math.round((catAmount.get(key) ?? 0) * 100) / 100 }));
    const grossTotal = Math.round(categories.reduce((s, c) => s + c.amount, 0) * 100) / 100;
    const professionalFee = Math.round(grossTotal * signoffDoctorRate) / 100;

    const scans = scanRates
      .map(r => {
        const patients = Array.from(scanCount.entries())
          .filter(([code]) => code.toUpperCase() === r.code || code.toUpperCase().includes(r.code))
          .reduce((s, [, n]) => s + n, 0);
        return { code: r.code, label: r.label, patients, rate: r.rate, net: Math.round(patients * r.rate * 100) / 100 };
      })
      .filter(s => s.patients > 0);
    const scanTotal = Math.round(scans.reduce((s, r) => s + r.net, 0) * 100) / 100;

    monthly = {
      categories,
      grossTotal,
      doctorRate: signoffDoctorRate,
      professionalFee,
      scans,
      scanTotal,
      totalPayable: Math.round((professionalFee + scanTotal) * 100) / 100,
    };
  }

  // ── Case Progress rows (monthly, per-case weightage) ──────────────────
  let caseRows: CaseRow[] = [];
  if (tab === "locum" && signoffDoctorId && payoutView === "cases") {
    caseRows = (locumLines as any[])
      .filter(l => l.doctorProfile.id === signoffDoctorId && !isScanCode(l.treatment.treatmentType.code))
      .map(l => {
        const { bucket, accruedPct } = classify(l);
        const billed = Number(l.billedAmount);
        const labFee = Number(l.labFee);
        const net    = Number(l.netPool);
        const wt     = accruedPct ?? 100; // one-off (no stage scheme) counts fully
        return {
          id:              l.id,
          patientName:     l.treatment.visit.patient.name,
          patientRef:      l.treatment.visit.patient.patientRef,
          treatmentName:   l.treatment.treatmentType.name,
          planRef:         l.treatmentPlan?.planRef ?? null,
          bucket,
          billed,
          labFee,
          labFeeConfirmed: l.labFeeConfirmed,
          net,
          weightagePct:    wt,
          gained:          Math.round(net * wt) / 100,
        };
      });
  }

  // Summary stats
  const totalEntitled = locumGroups.reduce((s, g) => s + g.totalEntitled, 0);
  const totalReleased = locumGroups.reduce((s, g) => s + g.totalReleased, 0);
  const totalPending  = totalEntitled - totalReleased;
  const totalLines    = locumGroups.reduce((s, g) => s + g.lines.length, 0);
  const lockedStmts   = (stmtRows as any[]).filter((s: any) => s.status === "LOCKED").length;

  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Commission</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track earnings, verify payouts and approve staff commission for{" "}
            <span className="font-medium text-slate-700">{month}</span>
          </p>
        </div>
        <form className="flex items-center gap-2">
          <label className="text-sm text-slate-600 font-medium">Month</label>
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="form-input w-40"
          />
          <button type="submit" className="btn-primary">Apply</button>
        </form>
      </div>

      {/* ── Summary stat cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Doctor Entitled" value={RM(totalEntitled)} sub={`${totalLines} treatment lines · ${locumGroups.length} doctors`} color="blue" Icon={Banknote} />
        <StatCard label="Released" value={RM(totalReleased)} sub={totalPending > 0 ? `${RM(totalPending)} pending` : "all released"} color="purple" Icon={BadgeCheck} />
        <StatCard label="Monthly Statements" value={`${(stmtRows as any[]).length}`} sub={`${lockedStmts} locked`} color="amber" Icon={FileCheck} />
        <div className="card p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <div className="icon-box-sm bg-slate-100 text-slate-500"><Calculator size={16} /></div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Doctor Payroll</p>
          </div>
          <Link href="/hr/doctor-payroll" className="mt-3 btn-primary text-xs justify-center">
            Open Doctor Payroll
          </Link>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-0 -mb-px">
          {TABS.map(t => (
            <a
              key={t.key}
              href={`?month=${month}&tab=${t.key}`}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "border-blue-600 text-blue-700 bg-blue-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              <t.Icon size={14} />
              {t.label}
            </a>
          ))}
        </nav>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────── */}

      {tab === "locum" && (
        <>
          {(isDoctor || canPickDoctor) && signoffDoctorId && (
            <>
              {/* Daily / Monthly sub-tabs */}
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-medium w-fit">
                <a href={`?tab=locum&month=${month}&view=${view}&payoutView=daily&day=${day}${signoffDoctorId ? `&signoffDoctor=${signoffDoctorId}` : ""}`}
                  className={`px-4 py-2 transition-colors ${payoutView === "daily" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  Daily
                </a>
                <a href={`?tab=locum&month=${month}&view=${view}&payoutView=monthly${signoffDoctorId ? `&signoffDoctor=${signoffDoctorId}` : ""}`}
                  className={`px-4 py-2 transition-colors ${payoutView === "monthly" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  Monthly
                </a>
                <a href={`?tab=locum&month=${month}&view=${view}&payoutView=cases${signoffDoctorId ? `&signoffDoctor=${signoffDoctorId}` : ""}`}
                  className={`px-4 py-2 transition-colors ${payoutView === "cases" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  Cases
                </a>
              </div>

              {/* Doctor picker for Monthly/Cases (Daily has its own) */}
              {canPickDoctor && payoutView !== "daily" && (
                <form className="flex items-center gap-2">
                  <input type="hidden" name="tab" value="locum" />
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="view" value={view} />
                  <input type="hidden" name="payoutView" value={payoutView} />
                  <label className="text-xs font-medium text-slate-600">Doctor</label>
                  <select name="signoffDoctor" defaultValue={signoffDoctorId} className="form-input w-auto text-sm py-1.5">
                    {signoffDoctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <button type="submit" className="btn-secondary text-xs">View</button>
                </form>
              )}

              {payoutView === "cases"
                ? <CaseProgressPanel month={month} doctorName={signoffDoctorName} doctorRate={signoffDoctorRate} rows={caseRows} />
                : payoutView === "monthly" && monthly
                ? <MonthlyCommissionPanel month={month} doctorName={signoffDoctorName} data={monthly} />
                : <DailySignoffPanel
                    day={day}
                    month={month}
                    view={view}
                    isDoctor={isDoctor}
                    canPickDoctor={canPickDoctor}
                    doctors={signoffDoctors}
                    selectedDoctorId={signoffDoctorId}
                    doctorName={signoffDoctorName}
                    doctorRate={signoffDoctorRate}
                    rows={dayRows}
                    signedAt={signedAt}
                  />}
            </>
          )}
          <LocumPayoutTable
            groups={locumGroups}
            month={month}
            role={role}
            view={view}
            ownDoctorId={ownDoctorProfileId}
            stmtByDoctor={stmtByDoctor}
          />
        </>
      )}

      {tab === "staff" && (
        <StaffCommissionTable
          rows={staffComms.map((c: any) => ({
            id:              c.id,
            staffName:       c.staffProfile.user.name,
            attendedDays:    Number(c.attendedDays),
            totalWorkDays:   c.totalWorkDays,
            grossCommission: Number(c.grossCommission),
            proRatedComm:    Number(c.proRatedComm),
            forfeited:       c.forfeited,
            forfeitReason:   c.forfeitReason ?? null,
            status:          c.status,
          }))}
          clinicId={selectedClinicId}
          month={month}
          canRun={canRun}
          canLock={canLock}
        />
      )}
    </div>
  );
}


// ── Stat card helper ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, Icon }: {
  label: string; value: string; sub: string;
  color: "blue" | "amber" | "purple";
  Icon: LucideIcon;
}) {
  const iconClass = {
    blue:   "icon-box-blue",
    amber:  "icon-box-amber",
    purple: "icon-box-purple",
  }[color];

  return (
    <div className="stat-card flex items-start gap-3">
      <div className={iconClass}><Icon size={20} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}
