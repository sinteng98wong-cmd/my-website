import React from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StaffCommissionTable }  from "./StaffCommissionTable";
import { LocumPayoutTable, type LocumDoctorGroup } from "./LocumPayoutTable";
import { DailySignoffPanel, type DayRow } from "./DailySignoffPanel";
import { getEffectiveSchemes, matchScheme, computeStageRelease } from "@/services/locum-payout.service";
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
  searchParams: { month?: string; tab?: string; view?: string; day?: string; signoffDoctor?: string };
}) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role   as string;
  const userId  = (session?.user as any)?.id     as string;

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
  if (tab === "locum" && signoffDoctorId) {
    const dayStart = new Date(day);
    const dayEnd   = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [dayTreatments, signoffRow] = await Promise.all([
      prisma.treatment.findMany({
        where: {
          doctorId: signoffDoctorId,
          visit: { visitDate: { gte: dayStart, lt: dayEnd }, deletedAt: null },
        },
        include: {
          treatmentType: { select: { name: true } },
          visit: { include: { patient: { select: { name: true, patientRef: true } } } },
          locumPayoutLines: {
            where:  { doctorProfileId: signoffDoctorId },
            select: { status: true, entitledAmount: true, doctorVerifiedAt: true, subType: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      (prisma as any).doctorDailySignoff.findFirst({
        where: { doctorId: signoffDoctorId, date: dayStart },
        select: { signedAt: true },
      }).catch(() => null),
    ]);

    dayRows = (dayTreatments as any[]).map(t => {
      const line = t.locumPayoutLines[0] ?? null;
      return {
        id:             t.id,
        patientName:    t.visit.patient.name,
        patientRef:     t.visit.patient.patientRef,
        treatmentName:  t.treatmentType.name,
        subType:        line?.subType ?? null,
        billed:         Number(t.billedAmount),
        collected:      Number(t.collectedAmount),
        labFee:         Number(t.labFee),
        entitled:       line ? Number(line.entitledAmount) : null,
        lineStatus:     line?.status ?? null,
        doctorVerified: !!line?.doctorVerifiedAt,
      };
    });
    signedAt = signoffRow?.signedAt?.toISOString() ?? null;
    signoffDoctorName = canPickDoctor
      ? (signoffDoctors.find(d => d.id === signoffDoctorId)?.name ?? null)
      : null;
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
            <DailySignoffPanel
              day={day}
              month={month}
              view={view}
              isDoctor={isDoctor}
              canPickDoctor={canPickDoctor}
              doctors={signoffDoctors}
              selectedDoctorId={signoffDoctorId}
              doctorName={signoffDoctorName}
              rows={dayRows}
              signedAt={signedAt}
            />
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
