import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requirePermission, hasPermission } from "@/lib/rbac";
import { getSelectedClinicId, getUserClinics } from "@/lib/selected-clinic";
import { notDeleted } from "@/lib/soft-delete";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PatientAnalyticsClient } from "./patients/PatientAnalyticsClient";
import { PayrollReportClient } from "./payroll/PayrollReportClient";
import { ReferralCommissionsClient } from "./referral-commissions/ReferralCommissionsClient";

function fmt(n: number | string) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
}

const ALL_TABS = [
  { key: "summary",   label: "Monthly Summary"       },
  { key: "patients",  label: "Patient Analytics"     },
  { key: "payroll",   label: "Payroll Report"        },
  { key: "referrals", label: "Referral Commissions"  },
] as const;
type TabKey = typeof ALL_TABS[number]["key"];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { tab?: string; month?: string };
}) {
  await requirePermission("ledger:view");

  const session  = await getServerSession(authOptions);
  const role     = (session?.user as any)?.role as string ?? "";
  const isSuperAdmin    = role === "SUPER_ADMIN";
  const isFinance       = role === "FINANCE";
  const isManager       = role === "CLINIC_MANAGER";
  const canSeePatients  = isSuperAdmin || isFinance || isManager;
  const canSeePayroll   = isSuperAdmin || isFinance;
  const canSeeReferrals = isSuperAdmin || isFinance;

  // Build list of tabs visible to this role
  const visibleTabs = ALL_TABS.filter((t) => {
    if (t.key === "patients")  return canSeePatients;
    if (t.key === "payroll")   return canSeePayroll;
    if (t.key === "referrals") return canSeeReferrals;
    return true; // summary always visible
  });

  const tab   = (searchParams.tab ?? "summary") as TabKey;
  const month = searchParams.month ?? new Date().toISOString().slice(0, 7);

  // Guard: redirect to summary if trying to access a tab they can't see
  const tabAllowed = visibleTabs.some((t) => t.key === tab);
  if (!tabAllowed) redirect("/reports?tab=summary");

  // Fetch clinics for client components
  const clinics = (tab === "patients" || tab === "payroll")
    ? (await getUserClinics()).map((c) => ({ id: c.id, name: c.name }))
    : [];

  // ── Only fetch summary data when on that tab ─────────────────────────
  let summaryData: Awaited<ReturnType<typeof fetchSummary>> | null = null;
  if (tab === "summary") {
    summaryData = await fetchSummary(month);
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Reports &amp; Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {tab === "summary" ? `Monthly overview — ${month}` : ALL_TABS.find((t) => t.key === tab)?.label}
          </p>
        </div>
        {tab === "summary" && (
          <form className="flex items-center gap-2">
            <input type="hidden" name="tab" value="summary" />
            <input type="month" name="month" defaultValue={month} className="form-input w-40" />
            <button type="submit" className="btn-primary">Apply</button>
          </form>
        )}
      </div>

      {/* Tab bar */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-0 -mb-px">
          {visibleTabs.map((t) => (
            <Link
              key={t.key}
              href={`/reports?tab=${t.key}${t.key === "summary" ? `&month=${month}` : ""}`}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "border-blue-600 text-blue-700 bg-blue-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === "summary" && summaryData && <SummaryTab data={summaryData} month={month} />}
      {tab === "patients"  && <PatientAnalyticsClient clinics={clinics} />}
      {tab === "payroll"   && <PayrollReportClient   clinics={clinics} />}
      {tab === "referrals" && <ReferralCommissionsClient isSuperAdmin={isSuperAdmin} />}
    </div>
  );
}

// ── Summary data fetcher ─────────────────────────────────────────────────────

async function fetchSummary(month: string) {
  const clinicId = getSelectedClinicId();
  const [year, mon] = month.split("-").map(Number);
  const from = new Date(year, mon - 1, 1);
  const to   = new Date(year, mon, 1);
  const clinicFilter = clinicId ? { clinicId } : {};

  const [ledgers, invoices, doctorComms, staffComms] = await Promise.all([
    prisma.dailyLedger.findMany({
      where: { date: { gte: from, lt: to }, ...clinicFilter },
      include: { clinic: { select: { id: true, name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.invoice.findMany({
      where: notDeleted({
        createdAt: { gte: from, lt: to },
        ...(clinicId ? { visit: { clinicId } } : {}),
      }),
      include: {
        visit: {
          include: {
            patient: { select: { isForeigner: true } },
            treatments: { include: { treatmentType: { select: { name: true } } } },
          },
        },
        payments: { select: { method: true, amount: true } },
      },
    }),
    prisma.doctorCommission.findMany({
      where: { month, ...(clinicId ? { treatment: { visit: { clinicId } } } : {}) },
    }),
    prisma.staffCommission.findMany({ where: { month } }),
  ]);

  return { ledgers, invoices, doctorComms, staffComms };
}

// ── Summary tab (server-rendered) ────────────────────────────────────────────

function SummaryTab({
  data: { ledgers, invoices, doctorComms, staffComms },
  month,
}: {
  data: Awaited<ReturnType<typeof fetchSummary>>;
  month: string;
}) {
  const totalRevenue  = ledgers.reduce((s, l) => s + Number(l.totalSales), 0);
  const totalProfFee  = ledgers.reduce((s, l) => s + Number(l.professionalFee), 0);
  const totalProducts = ledgers.reduce((s, l) => s + Number(l.productSales), 0);
  const totalSST      = ledgers.reduce((s, l) => s + Number(l.sst), 0);
  const totalPatients = ledgers.reduce((s, l) => s + l.patientCount, 0);
  const totalDays     = ledgers.length;

  const payments = {
    cash:    ledgers.reduce((s, l) => s + Number(l.cashCurrent) + Number(l.cashNext), 0),
    card:    ledgers.reduce((s, l) => s + Number(l.creditCard), 0),
    fpx:     ledgers.reduce((s, l) => s + Number(l.fpx), 0),
    ewallet: ledgers.reduce((s, l) => s + Number(l.ewallet), 0),
    atome:   ledgers.reduce((s, l) => s + Number(l.atome), 0),
  };

  const clinicMap: Record<string, { name: string; revenue: number; patients: number; days: number }> = {};
  for (const l of ledgers) {
    if (!clinicMap[l.clinicId]) clinicMap[l.clinicId] = { name: l.clinic.name, revenue: 0, patients: 0, days: 0 };
    clinicMap[l.clinicId].revenue  += Number(l.totalSales);
    clinicMap[l.clinicId].patients += l.patientCount;
    clinicMap[l.clinicId].days     += 1;
  }
  const clinicRows = Object.values(clinicMap).sort((a, b) => b.revenue - a.revenue);

  const txMap: Record<string, { name: string; count: number; revenue: number }> = {};
  for (const inv of invoices) {
    for (const t of inv.visit.treatments) {
      if (!txMap[t.treatmentTypeId]) txMap[t.treatmentTypeId] = { name: t.treatmentType.name, count: 0, revenue: 0 };
      txMap[t.treatmentTypeId].count++;
      txMap[t.treatmentTypeId].revenue += Number(t.billedAmount);
    }
  }
  const txRows = Object.values(txMap).sort((a, b) => b.revenue - a.revenue);

  const totalDocComm   = doctorComms.reduce((s, c) => s + Number(c.finalPayout), 0);
  const totalStaffComm = staffComms.reduce((s, c) => s + Number(c.proRatedComm), 0);

  const outstanding    = invoices.filter((i) => !i.collectedAt);
  const outstandingAmt = outstanding.reduce((s, i) => s + Number(i.total), 0);
  const foreignInv     = invoices.filter((i) => i.visit.patient.isForeigner).length;
  const localInv       = invoices.length - foreignInv;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Total Revenue",  value: fmt(totalRevenue),             sub: `${totalDays} days recorded` },
          { label: "Prof. Fee",      value: fmt(totalProfFee),             sub: `${totalRevenue > 0 ? ((totalProfFee / totalRevenue) * 100).toFixed(0) : 0}% of revenue` },
          { label: "Patients Seen",  value: totalPatients.toLocaleString(), sub: `${localInv} local · ${foreignInv} foreign` },
          { label: "Doctor Comm.",   value: fmt(totalDocComm),             sub: "Total payable" },
          { label: "Outstanding",    value: fmt(outstandingAmt),           sub: `${outstanding.length} unpaid invoices` },
        ].map((c) => (
          <div key={c.label} className="stat-card">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-xl font-semibold text-slate-900 mt-1">{c.value}</p>
            <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Revenue by Branch */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Revenue by Branch</h2>
          {clinicRows.length === 0 ? <p className="text-sm text-slate-400">No data</p> : (
            <div className="space-y-3">
              {clinicRows.map((c) => {
                const pct = totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0;
                return (
                  <div key={c.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-700 truncate">{c.name}</span>
                      <span className="font-medium text-slate-900 ml-2 flex-shrink-0">{fmt(c.revenue)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{c.patients} patients · {c.days} days</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment Methods */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Payment Methods</h2>
          <div className="space-y-2">
            {[
              { label: "Cash",    value: payments.cash,    cls: "bg-green-400" },
              { label: "Card",    value: payments.card,    cls: "bg-blue-400" },
              { label: "FPX",     value: payments.fpx,     cls: "bg-indigo-400" },
              { label: "eWallet", value: payments.ewallet, cls: "bg-purple-400" },
              { label: "Atome",   value: payments.atome,   cls: "bg-orange-400" },
            ].map((p) => {
              const pct = totalRevenue > 0 ? (p.value / totalRevenue) * 100 : 0;
              return (
                <div key={p.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">{p.label}</span>
                    <span className="font-medium text-slate-900">{fmt(p.value)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${p.cls}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>SST Collected</span><span className="font-medium">{fmt(totalSST)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Product Sales</span><span className="font-medium">{fmt(totalProducts)}</span>
            </div>
          </div>
        </div>

        {/* Commission Summary */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Commission Summary</h2>
          <div className="space-y-3 mb-4">
            {[
              { label: "Doctor Commission", value: fmt(totalDocComm) },
              { label: "Staff Commission",  value: fmt(totalStaffComm) },
              { label: "Total Payable",     value: fmt(totalDocComm + totalStaffComm), bold: true },
            ].map((r) => (
              <div key={r.label} className={`flex justify-between text-sm ${r.bold ? "pt-2 border-t border-slate-100 font-semibold" : ""}`}>
                <span className="text-slate-600">{r.label}</span>
                <span className="text-slate-900">{r.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <Link href="/commission" className="text-xs text-blue-600 hover:underline">View Details →</Link>
          </div>
        </div>
      </div>

      {/* Treatment Breakdown */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Treatment Breakdown</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Treatment", "Procedures", "Revenue", "Avg. per Procedure", "% of Revenue"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {txRows.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">No data for this period</td></tr>
            )}
            {txRows.map((t) => {
              const pct = totalRevenue > 0 ? (t.revenue / totalRevenue) * 100 : 0;
              const avg = t.count > 0 ? t.revenue / t.count : 0;
              return (
                <tr key={t.name} className="table-row">
                  <td className="px-5 py-3 font-medium text-slate-900">{t.name}</td>
                  <td className="px-5 py-3 text-slate-600">{t.count}</td>
                  <td className="px-5 py-3 font-semibold">{fmt(t.revenue)}</td>
                  <td className="px-5 py-3 text-slate-600">{fmt(avg)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 w-8">{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Daily Revenue */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Daily Revenue</h2>
          <Link href="/ledger" className="text-xs text-blue-600 hover:underline">Full Ledger →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Date", "Clinic", "Patients", "Prof. Fee", "SST", "Total", "Cash", "Card", "FPX", "eWallet"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledgers.length === 0 && (
                <tr><td colSpan={10} className="px-5 py-8 text-center text-slate-400">No ledger entries</td></tr>
              )}
              {ledgers.map((l) => (
                <tr key={l.id} className="table-row">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {new Date(l.date).toLocaleDateString("en-MY", { day: "2-digit", month: "short" })}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{l.clinic.name}</td>
                  <td className="px-4 py-2.5 text-center">{l.patientCount}</td>
                  <td className="px-4 py-2.5">{fmt(Number(l.professionalFee))}</td>
                  <td className="px-4 py-2.5 text-slate-500">{fmt(Number(l.sst))}</td>
                  <td className="px-4 py-2.5 font-semibold">{fmt(Number(l.totalSales))}</td>
                  <td className="px-4 py-2.5">{fmt(Number(l.cashCurrent) + Number(l.cashNext))}</td>
                  <td className="px-4 py-2.5">{fmt(Number(l.creditCard))}</td>
                  <td className="px-4 py-2.5">{fmt(Number(l.fpx))}</td>
                  <td className="px-4 py-2.5">{fmt(Number(l.ewallet))}</td>
                </tr>
              ))}
              {ledgers.length > 0 && (
                <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                  <td className="px-4 py-3 text-slate-900" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-center">{totalPatients}</td>
                  <td className="px-4 py-3">{fmt(totalProfFee)}</td>
                  <td className="px-4 py-3">{fmt(totalSST)}</td>
                  <td className="px-4 py-3 text-blue-700">{fmt(totalRevenue)}</td>
                  <td className="px-4 py-3">{fmt(payments.cash)}</td>
                  <td className="px-4 py-3">{fmt(payments.card)}</td>
                  <td className="px-4 py-3">{fmt(payments.fpx)}</td>
                  <td className="px-4 py-3">{fmt(payments.ewallet)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
