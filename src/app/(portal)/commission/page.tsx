import React from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DoctorCommissionTable } from "./DoctorCommissionTable";
import { StaffCommissionTable }  from "./StaffCommissionTable";
import { LocumPayoutTable, type LocumDoctorGroup } from "./LocumPayoutTable";
import { Stethoscope, Users, Calculator, Banknote, FileCheck, Wallet, type LucideIcon } from "lucide-react";
const CalcIcon = Calculator;

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

function buildDoctorGroups(rows: any[]) {
  const map = new Map<string, { doctorId: string; doctorName: string; rows: any[] }>();
  for (const c of rows) {
    if (!map.has(c.doctorId)) {
      map.set(c.doctorId, {
        doctorId:   c.doctorId,
        doctorName: c.treatment?.doctor?.user?.name ?? "Unknown Doctor",
        rows:       [],
      });
    }
    map.get(c.doctorId)!.rows.push({
      id:           c.id,
      treatmentId:  c.treatmentId,
      month:        (c as any).month,
      status:       c.status,
      txAmount:     Number(c.txAmount),
      labFee:       Number(c.labFee),
      doctorSplit:  Number(c.doctorSplit),
      doctorRate:   Number(c.doctorRate),
      finalPayout:  Number(c.finalPayout),
      isTopUp:      c.isTopUp,
      treatment:    c.treatment,
      patientId:    c.treatment?.visit?.patient?.id ?? "",
    });
  }
  return Array.from(map.values()).map(g => ({
    ...g,
    total:       g.rows.reduce((s: number, r: any) => s + r.finalPayout, 0),
    allLockable: g.rows.every((r: any) => r.status === "DRAFT" || r.status === "PENDING_LOCK"),
  }));
}

const TABS = [
  { key: "doctor", label: "Doctor Commission", Icon: Stethoscope },
  { key: "staff",  label: "Staff Commission",  Icon: Users },
  { key: "locum",  label: "Locum Payout",      Icon: Wallet },
  { key: "calc",   label: "Payroll Calculator", Icon: Calculator },
] as const;

export default async function CommissionPage({
  searchParams,
}: {
  searchParams: { month?: string; tab?: string; treatmentId?: string };
}) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role   as string;
  const userId  = (session?.user as any)?.id     as string;

  const month       = searchParams.month ?? new Date().toISOString().slice(0, 7);
  const tab         = (searchParams.tab ?? "doctor") as typeof TABS[number]["key"];
  const treatmentId = searchParams.treatmentId ?? null;
  const isDoctor  = role === "DOCTOR";
  const canLock   = ["SUPER_ADMIN", "FINANCE"].includes(role);
  const canFlag   = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);
  const canRun    = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);

  const { getSelectedClinicId } = await import("@/lib/selected-clinic");
  const selectedClinicId = getSelectedClinicId() ?? "";

  // DoctorProfile id for the signed-in doctor (needed for locum tab ownership check)
  const ownDoctorProfileId = isDoctor && userId
    ? await prisma.doctorProfile.findFirst({ where: { userId }, select: { id: true } })
        .then(r => r?.id ?? null).catch(() => null)
    : null;

  const [doctorComms, staffComms, stmtRows, locumLines] = await Promise.all([
    tab === "doctor"
      ? prisma.doctorCommission.findMany({
          where:   { month, ...(selectedClinicId ? { treatment: { visit: { clinicId: selectedClinicId } } } : {}), ...(isDoctor ? { doctorId: userId } : {}) },
          include: {
            treatment: {
              include: {
                treatmentType: { select: { name: true } },
                visit:         { include: { patient: { select: { id: true, name: true } } } },
                doctor:        { include: { user: { select: { name: true } } } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : Promise.resolve([]),

    tab === "staff"
      ? prisma.staffCommission.findMany({
          where:   { month },
          include: { staffProfile: { include: { user: { select: { name: true } } } } },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : Promise.resolve([]),

    // Monthly statements for all doctors — used in the Doctor tab
    tab === "doctor"
      ? (prisma as any).locumReconciliationStatement.findMany({
          where:  { month },
          select: { id: true, doctorId: true, status: true, finalPayout: true },
        }).catch(() => [])
      : Promise.resolve([]),

    // Locum payout lines — used in the Locum tab
    tab === "locum"
      ? (prisma as any).locumPayoutLine.findMany({
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
              select: { planRef: true, title: true, status: true, totalAmount: true, totalPaid: true },
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
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Build a quick lookup: doctorProfileId → statement
  const stmtByDoctor = new Map<string, any>(
    (stmtRows as any[]).map((s: any) => [s.doctorId, s]),
  );

  // Group locum lines by doctor
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
          totalEntitled:   0,
          totalReleased:   0,
          lines:           [],
        });
      }
      const g = map.get(did)!;
      const line = {
        id:                 l.id,
        category:           l.category,
        status:             l.status,
        billedAmount:       Number(l.billedAmount),
        labFee:             Number(l.labFee),
        labFeeConfirmed:    l.labFeeConfirmed,
        sst:                Number(l.sst),
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
      g.totalEntitled += line.entitledAmount;
      g.totalReleased += line.releasedAmount;
    }
    return Array.from(map.values());
  }

  const locumGroups = buildLocumGroups(locumLines as any[]);

  // Summary stats
  const totalDoctor = doctorComms.reduce((s: number, c: any) => s + Number(c.finalPayout), 0);
  const totalStaff  = staffComms.reduce((s: number,  c: any) => s + Number(c.proRatedComm), 0);

  const lockedDr  = doctorComms.filter((c: any) => c.status === "LOCKED").length;
  const draftDr   = doctorComms.filter((c: any) => c.status === "DRAFT").length;

  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Commission</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage and approve doctor &amp; staff commission for{" "}
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
        <StatCard label="Doctor Commission" value={RM(totalDoctor)} sub={`${draftDr} draft · ${lockedDr} locked`} color="blue"   Icon={Banknote} />
        <StatCard label="Monthly Statements" value={`${(stmtRows as any[]).length}`} sub={`${(stmtRows as any[]).filter((s:any) => s.status === "LOCKED").length} locked`} color="amber" Icon={FileCheck} />
        <StatCard label="Staff Commission"  value={RM(totalStaff)}  sub={`${staffComms.length} records`} color="purple" Icon={Users} />
        <div className="card p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <div className="icon-box-sm bg-slate-100 text-slate-500"><CalcIcon size={16} /></div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Payroll Calc</p>
          </div>
          <Link href={`/commission/payroll-calc?month=${month}`} className="mt-3 btn-primary text-xs justify-center">
            Open Calculator
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

      {tab === "doctor" && (
        <DoctorCommissionTable
          groups={buildDoctorGroups(doctorComms)}
          month={month}
          canLock={canLock}
          canFlag={canFlag}
          canViewPatient={canFlag || isDoctor}
          initialAdjustTreatmentId={treatmentId}
          stmtByDoctor={Object.fromEntries(stmtByDoctor)}
        />
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

      {tab === "locum" && (
        <LocumPayoutTable
          groups={locumGroups}
          month={month}
          role={role}
          ownDoctorId={ownDoctorProfileId}
        />
      )}

      {tab === "calc" && (
        <div className="card p-10 flex flex-col items-center gap-4 text-center">
          <div className="icon-box w-14 h-14 rounded-2xl bg-blue-50 text-blue-600"><Calculator size={28} /></div>
          <div>
            <p className="font-semibold text-slate-800">Payroll Calculator</p>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">
              Calculate professional fee payouts for any doctor using the 3-type engine — then generate a monthly statement.
            </p>
          </div>
          <Link href={`/commission/payroll-calc?month=${month}`} className="btn-primary">
            Open Payroll Calculator
          </Link>
        </div>
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
