import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import Link from "next/link";
import { LedgerExportButtons } from "./LedgerExportButtons";

function fmt(n: number | string) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
}
function fmtShort(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR", maximumFractionDigits: 0 }).format(n);
}

type ViewMode = "monthly" | "daily" | "period";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: {
    month?: string;
    clinicId?: string;
    view?: string;
    from?: string;
    to?: string;
  };
}) {
  await requirePermission("ledger:view");

  const view     = (searchParams.view ?? "monthly") as ViewMode;
  const clinicId = searchParams.clinicId ?? getSelectedClinicId();
  const month    = searchParams.month ?? new Date().toISOString().slice(0, 7);

  // Derive date range
  let from: Date;
  let to: Date;
  let periodLabel: string;

  if (view === "period") {
    const rawFrom = searchParams.from ?? new Date().toISOString().slice(0, 10);
    const rawTo   = searchParams.to   ?? new Date().toISOString().slice(0, 10);
    from = new Date(rawFrom + "T00:00:00");
    to   = new Date(rawTo   + "T23:59:59");
    periodLabel = `${rawFrom} → ${rawTo}`;
  } else {
    const [year, mon] = month.split("-").map(Number);
    from = new Date(year, mon - 1, 1);
    to   = new Date(year, mon, 0, 23, 59, 59);
    periodLabel = month;
  }

  const fromISO = from.toISOString().slice(0, 10);
  const toISO   = to.toISOString().slice(0, 10);

  // SQL filter for clinic (safe — uses parameterised Prisma.sql)
  const clinicFilter = clinicId
    ? Prisma.sql`AND v."clinicId" = ${clinicId}`
    : Prisma.empty;

  type VisitCountRow  = { clinicId: string; day: string; count: bigint };
  type DoctorSaleRow  = {
    clinicId: string; day: string;
    doctorId: string; doctorName: string;
    visits: bigint; totalBilled: number;
  };

  const [entries, clinics, panelProviders, visitCountRows, doctorSaleRows] = await Promise.all([
    // ── Existing: pre-aggregated financial snapshot ──────────────────────
    prisma.dailyLedger.findMany({
      where: {
        date: { gte: from, lte: to },
        ...(clinicId ? { clinicId } : {}),
      },
      include: { clinic: { select: { id: true, name: true } } },
      orderBy: [{ clinicId: "asc" }, { date: "asc" }],
    }),

    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),

    prisma.panelProvider.findMany({
      where: { active: true, ...(clinicId ? { clinicId } : {}) },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),

    // ── NEW: actual visit counts from Visit table ─────────────────────────
    prisma.$queryRaw<VisitCountRow[]>(Prisma.sql`
      SELECT
        v."clinicId",
        TO_CHAR(v."visitDate", 'YYYY-MM-DD') AS day,
        COUNT(*)::bigint                      AS count
      FROM "Visit" v
      WHERE v."visitDate" >= ${from}
        AND v."visitDate" <= ${to}
        AND v."deletedAt" IS NULL
        ${clinicFilter}
      GROUP BY v."clinicId", TO_CHAR(v."visitDate", 'YYYY-MM-DD')
    `),

    // ── NEW: doctor-level daily sales from Treatment table ────────────────
    prisma.$queryRaw<DoctorSaleRow[]>(Prisma.sql`
      SELECT
        v."clinicId",
        TO_CHAR(v."visitDate", 'YYYY-MM-DD')   AS day,
        dp.id                                   AS "doctorId",
        u.name                                  AS "doctorName",
        COUNT(DISTINCT v.id)::bigint            AS visits,
        COALESCE(SUM(t."billedAmount"), 0)::float AS "totalBilled"
      FROM "Treatment" t
      JOIN "Visit"         v  ON v.id  = t."visitId"
      JOIN "DoctorProfile" dp ON dp.id = t."doctorId"
      JOIN "User"          u  ON u.id  = dp."userId"
      WHERE v."visitDate" >= ${from}
        AND v."visitDate" <= ${to}
        AND v."deletedAt" IS NULL
        AND t."doctorId"  IS NOT NULL
        ${clinicFilter}
      GROUP BY v."clinicId",
               TO_CHAR(v."visitDate", 'YYYY-MM-DD'),
               dp.id,
               u.name
      ORDER BY TO_CHAR(v."visitDate", 'YYYY-MM-DD') ASC, u.name ASC
    `),
  ]);

  // ── Build visit-count lookup maps ─────────────────────────────────────────
  // key: "clinicId_YYYY-MM-DD" → visit count
  const visitCountMap  = new Map<string, number>();
  // key: clinicId → total visits in period
  const clinicVisitMap = new Map<string, number>();
  let totalVisits = 0;
  for (const row of visitCountRows) {
    const key = `${row.clinicId}_${row.day}`;
    const n   = Number(row.count);
    visitCountMap.set(key, n);
    clinicVisitMap.set(row.clinicId, (clinicVisitMap.get(row.clinicId) ?? 0) + n);
    totalVisits += n;
  }

  // ── Doctor summary (period aggregation) ──────────────────────────────────
  const doctorSummaryMap = new Map<string, { name: string; visits: number; totalBilled: number }>();
  for (const row of doctorSaleRows) {
    const existing = doctorSummaryMap.get(row.doctorId) ?? { name: row.doctorName, visits: 0, totalBilled: 0 };
    existing.visits      += Number(row.visits);
    existing.totalBilled += Number(row.totalBilled);
    doctorSummaryMap.set(row.doctorId, existing);
  }
  const doctorSummaryRows = [...doctorSummaryMap.entries()]
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.totalBilled - a.totalBilled);

  // clinic name lookup for doctor-detail table
  const clinicNameMap = new Map(clinics.map(c => [c.id, c.name]));

  // ── Financial totals (from DailyLedger) ──────────────────────────────────
  const T = {
    patients:  totalVisits,                                                  // ← actual visits
    profFee:   entries.reduce((s, e) => s + Number(e.professionalFee), 0),
    products:  entries.reduce((s, e) => s + Number(e.productSales), 0),
    sst:       entries.reduce((s, e) => s + Number(e.sst), 0),
    total:     entries.reduce((s, e) => s + Number(e.totalSales), 0),
    cashCurr:  entries.reduce((s, e) => s + Number(e.cashCurrent), 0),
    cashNext:  entries.reduce((s, e) => s + Number(e.cashNext), 0),
    card:      entries.reduce((s, e) => s + Number(e.creditCard), 0),
    fpx:       entries.reduce((s, e) => s + Number(e.fpx), 0),
    ewallet:   entries.reduce((s, e) => s + Number(e.ewallet), 0),
    atome:     entries.reduce((s, e) => s + Number(e.atome), 0),
    days:      entries.length,
  };

  const cashTotal    = T.cashCurr + T.cashNext;
  const cardTotal    = T.card;
  const digitalTotal = T.fpx + T.ewallet + T.atome;

  const panelTotals: Record<string, number> = {};
  for (const e of entries) {
    const pc = e.panelCollections as Record<string, number>;
    if (pc && typeof pc === "object") {
      for (const [key, val] of Object.entries(pc)) {
        panelTotals[key] = (panelTotals[key] ?? 0) + Number(val);
      }
    }
  }
  const panelTotal = Object.values(panelTotals).reduce((s, v) => s + v, 0);

  // ── Per-clinic rollup ─────────────────────────────────────────────────────
  const clinicMap: Record<string, {
    name: string; patients: number; profFee: number; products: number; sst: number; total: number;
    cashCurr: number; cashNext: number; card: number; fpx: number; ewallet: number; atome: number;
    panel: number; days: number;
  }> = {};
  for (const e of entries) {
    if (!clinicMap[e.clinicId]) {
      clinicMap[e.clinicId] = {
        name:     e.clinic.name,
        patients: clinicVisitMap.get(e.clinicId) ?? 0, // ← actual visits
        profFee: 0, products: 0, sst: 0, total: 0,
        cashCurr: 0, cashNext: 0, card: 0, fpx: 0, ewallet: 0, atome: 0,
        panel: 0, days: 0,
      };
    }
    const c = clinicMap[e.clinicId];
    c.profFee  += Number(e.professionalFee);
    c.products += Number(e.productSales);
    c.sst      += Number(e.sst);
    c.total    += Number(e.totalSales);
    c.cashCurr += Number(e.cashCurrent);
    c.cashNext += Number(e.cashNext);
    c.card     += Number(e.creditCard);
    c.fpx      += Number(e.fpx);
    c.ewallet  += Number(e.ewallet);
    c.atome    += Number(e.atome);
    c.days     += 1;
    const pc = e.panelCollections as Record<string, number>;
    if (pc) c.panel += Object.values(pc).reduce((s, v) => s + Number(v), 0);
  }
  const clinicRows = Object.values(clinicMap).sort((a, b) => b.total - a.total);

  // Show daily breakdown when view is "daily" or "period"
  const showDailyTable = view === "daily" || view === "period";

  return (
    <div>
      {/* ── Header + Filters ── */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Collection Ledger</h1>
          <p className="text-sm text-slate-500 mt-0.5">{periodLabel}</p>
          <div className="flex items-center gap-3 mt-1">
            <Link
              href={`/ledger/detail?from=${fromISO}&to=${toISO}${clinicId ? `&clinicId=${clinicId}` : ""}&view=period`}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Patient-level detail →
            </Link>
            <span className="text-slate-300">|</span>
            <Link
              href={`/ledger/cash-banking?month=${month}${clinicId ? `&clinicId=${clinicId}` : ""}`}
              className="text-xs text-green-700 hover:text-green-900 font-medium"
            >
              Cash banking →
            </Link>
          </div>
        </div>

        <form className="flex flex-wrap items-end gap-2">
          {/* Clinic selector */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Branch</label>
            <select name="clinicId" defaultValue={clinicId ?? ""} className="form-input w-auto">
              <option value="">All Branches</option>
              {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* View mode toggle */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">View</label>
            <div className="flex border border-slate-300 rounded-md overflow-hidden">
              {([["monthly","Monthly"],["daily","Daily"],["period","Period"]] as const).map(([v,l]) => (
                <button key={v} type="submit" name="view" value={v}
                  className={`px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    view === v ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Date inputs */}
          {view === "period" ? (
            <>
              <div>
                <label className="block text-xs text-slate-500 mb-1">From</label>
                <input type="date" name="from" defaultValue={fromISO} className="form-input w-auto" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">To</label>
                <input type="date" name="to" defaultValue={toISO} className="form-input w-auto" />
              </div>
              <div className="self-end">
                <button type="submit" name="view" value="period" className="btn-primary">Apply</button>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Month</label>
              <input type="month" name="month" defaultValue={month} className="form-input w-auto" />
            </div>
          )}
        </form>

        <LedgerExportButtons from={fromISO} to={toISO} clinicId={clinicId ?? undefined} />
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Collection",   value: fmt(T.total),   sub: `${T.days} days · ${T.patients} patients` },
          { label: "Professional Fee",   value: fmt(T.profFee), sub: `${T.total ? ((T.profFee/T.total)*100).toFixed(0) : 0}% of total` },
          { label: "SST Collected",      value: fmt(T.sst),     sub: "Foreign patients" },
          { label: "Product Sales",      value: fmt(T.products),sub: "Non-treatment" },
        ].map(c => (
          <div key={c.label} className="stat-card">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-xl font-semibold text-slate-900 mt-1">{c.value}</p>
            <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Collection Type Summary ── */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Cash",    value: cashTotal,    sub: "Cash collections",              color: "text-green-700"  },
            { label: "Card",    value: cardTotal,    sub: "Credit card",                   color: "text-blue-700"   },
            { label: "Digital", value: digitalTotal, sub: "FPX · eWallet · Atome",         color: "text-indigo-700" },
            { label: "Panel",   value: panelTotal,   sub: `${panelProviders.length} provider(s)`, color: "text-purple-700" },
          ].map(c => (
            <div key={c.label} className="stat-card">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{c.label}</p>
              <p className={`text-xl font-semibold mt-1 ${c.color}`}>{fmt(c.value)}</p>
              <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Per-Clinic Collection Table ── */}
      <div className="card mb-6">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            Collection by Branch — {periodLabel}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide border-r border-slate-200">Branch</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Pts</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-green-600 uppercase tracking-wide">Cash</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-blue-600 uppercase tracking-wide">Card</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-indigo-600 uppercase tracking-wide">FPX</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-indigo-600 uppercase tracking-wide">eWallet</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-indigo-600 uppercase tracking-wide">Atome</th>
                {panelProviders.map(p => (
                  <th key={p.id} className="px-4 py-2.5 text-right text-xs font-medium text-purple-600 uppercase tracking-wide whitespace-nowrap">{p.code}</th>
                ))}
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-700 uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody>
              {clinicRows.length === 0 && (
                <tr><td colSpan={11 + panelProviders.length} className="px-5 py-8 text-center text-slate-400">No ledger entries for this period</td></tr>
              )}
              {clinicRows.map(c => (
                <tr key={c.name} className="table-row">
                  <td className="px-4 py-3 font-medium text-slate-900 border-r border-slate-100">{c.name}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{c.patients}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-700">{fmtShort(c.cashCurr + c.cashNext)}</td>
                  <td className="px-4 py-3 text-right font-mono text-blue-700">{fmtShort(c.card)}</td>
                  <td className="px-4 py-3 text-right font-mono text-indigo-700">{fmtShort(c.fpx)}</td>
                  <td className="px-4 py-3 text-right font-mono text-indigo-600">{fmtShort(c.ewallet)}</td>
                  <td className="px-4 py-3 text-right font-mono text-indigo-500">{fmtShort(c.atome)}</td>
                  {panelProviders.map(p => (
                    <td key={p.id} className="px-4 py-3 text-right font-mono text-purple-700">{fmtShort(panelTotals[p.code] ?? 0)}</td>
                  ))}
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{fmtShort(c.total)}</td>
                </tr>
              ))}
              {clinicRows.length > 0 && (
                <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold text-sm">
                  <td className="px-4 py-3 text-slate-900 border-r border-slate-100">TOTAL</td>
                  <td className="px-4 py-3 text-right">{T.patients}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-700">{fmt(T.cashCurr + T.cashNext)}</td>
                  <td className="px-4 py-3 text-right font-mono text-blue-700">{fmt(T.card)}</td>
                  <td className="px-4 py-3 text-right font-mono text-indigo-700">{fmt(T.fpx)}</td>
                  <td className="px-4 py-3 text-right font-mono text-indigo-600">{fmt(T.ewallet)}</td>
                  <td className="px-4 py-3 text-right font-mono text-indigo-500">{fmt(T.atome)}</td>
                  {panelProviders.map(p => (
                    <td key={p.id} className="px-4 py-3 text-right font-mono text-purple-700">{fmt(panelTotals[p.code] ?? 0)}</td>
                  ))}
                  <td className="px-4 py-3 text-right font-mono text-slate-900 text-base">{fmt(T.total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Sales by Doctor ── */}
      <div className="card mb-6">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Sales by Doctor — {periodLabel}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {showDailyTable ? "Daily breakdown per doctor" : "Period summary per doctor"} · based on treatment billings
            </p>
          </div>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-medium">
            {doctorSummaryRows.length} doctor{doctorSummaryRows.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="overflow-x-auto">
          {showDailyTable ? (
            /* ── Daily / Period view: one row per doctor per day ── */
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Date</th>
                  {!clinicId && (
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Branch</th>
                  )}
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Doctor</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Pts</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Sales</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Avg / Pt</th>
                </tr>
              </thead>
              <tbody>
                {doctorSaleRows.length === 0 && (
                  <tr>
                    <td colSpan={clinicId ? 5 : 6} className="px-5 py-8 text-center text-slate-400">
                      No treatment data for this period
                    </td>
                  </tr>
                )}
                {doctorSaleRows.map((row, i) => {
                  const visits = Number(row.visits);
                  const billed = Number(row.totalBilled);
                  return (
                    <tr key={i} className="table-row">
                      <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                        {new Date(row.day + "T00:00:00").toLocaleDateString("en-MY", {
                          day: "2-digit", month: "short", weekday: "short",
                          ...(view === "period" ? { year: "numeric" } : {}),
                        })}
                      </td>
                      {!clinicId && (
                        <td className="px-4 py-2.5 text-slate-500 text-xs">
                          {clinicNameMap.get(row.clinicId) ?? row.clinicId}
                        </td>
                      )}
                      <td className="px-4 py-2.5 font-medium text-slate-900">{row.doctorName}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{visits}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-900">{fmtShort(billed)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-400">
                        {visits > 0 ? fmtShort(billed / visits) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* ── Monthly view: summary per doctor ── */
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Doctor</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Patients</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Total Sales</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Avg / Patient</th>
                </tr>
              </thead>
              <tbody>
                {doctorSummaryRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                      No treatment data for this period
                    </td>
                  </tr>
                )}
                {doctorSummaryRows.map(d => (
                  <tr key={d.id} className="table-row">
                    <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{d.visits}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-900">{fmtShort(d.totalBilled)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">
                      {d.visits > 0 ? fmtShort(d.totalBilled / d.visits) : "—"}
                    </td>
                  </tr>
                ))}
                {doctorSummaryRows.length > 0 && (() => {
                  const sumVisits = doctorSummaryRows.reduce((s, d) => s + d.visits, 0);
                  const sumBilled = doctorSummaryRows.reduce((s, d) => s + d.totalBilled, 0);
                  return (
                    <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold text-sm">
                      <td className="px-4 py-3 text-slate-900">TOTAL</td>
                      <td className="px-4 py-3 text-right">{sumVisits}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(sumBilled)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-400">
                        {sumVisits > 0 ? fmtShort(sumBilled / sumVisits) : "—"}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Daily Entries Table (Daily + Period views) ── */}
      {showDailyTable && (
        <div className="card overflow-x-auto">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Daily Entries — {periodLabel}
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Date","Branch","Pts","Prof Fee","Products","SST","Total","Cash","Card","FPX","eWallet","Atome"].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
                {panelProviders.map(p => (
                  <th key={p.id} className="px-3 py-3 text-left text-xs font-medium text-purple-500 uppercase tracking-wide whitespace-nowrap">{p.code}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr><td colSpan={12 + panelProviders.length} className="px-5 py-8 text-center text-slate-400">No records</td></tr>
              )}
              {entries.map(e => {
                const dateKey    = `${e.clinicId}_${e.date.toISOString().slice(0, 10)}`;
                const realPts    = visitCountMap.get(dateKey) ?? 0;
                const pc         = e.panelCollections as Record<string, number> ?? {};
                return (
                  <tr key={e.id} className="table-row">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                      {new Date(e.date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", weekday: "short", year: view === "period" ? "numeric" : undefined })}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{e.clinic.name}</td>
                    <td className="px-3 py-2 text-center">{realPts}</td>
                    <td className="px-3 py-2 font-mono">{fmtShort(Number(e.professionalFee))}</td>
                    <td className="px-3 py-2 font-mono">{fmtShort(Number(e.productSales))}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{fmtShort(Number(e.sst))}</td>
                    <td className="px-3 py-2 font-mono font-semibold">{fmtShort(Number(e.totalSales))}</td>
                    <td className="px-3 py-2 font-mono text-green-700">{fmtShort(Number(e.cashCurrent) + Number(e.cashNext))}</td>
                    <td className="px-3 py-2 font-mono text-blue-700">{fmtShort(Number(e.creditCard))}</td>
                    <td className="px-3 py-2 font-mono text-indigo-700">{fmtShort(Number(e.fpx))}</td>
                    <td className="px-3 py-2 font-mono text-indigo-600">{fmtShort(Number(e.ewallet))}</td>
                    <td className="px-3 py-2 font-mono text-indigo-500">{fmtShort(Number(e.atome))}</td>
                    {panelProviders.map(p => (
                      <td key={p.id} className="px-3 py-2 font-mono text-purple-700">{fmtShort(Number(pc[p.code] ?? 0))}</td>
                    ))}
                  </tr>
                );
              })}
              {entries.length > 0 && (
                <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold text-sm">
                  <td className="px-3 py-3" colSpan={2}>Total</td>
                  <td className="px-3 py-3 text-center">{T.patients}</td>
                  <td className="px-3 py-3 font-mono">{fmtShort(T.profFee)}</td>
                  <td className="px-3 py-3 font-mono">{fmtShort(T.products)}</td>
                  <td className="px-3 py-3 font-mono">{fmtShort(T.sst)}</td>
                  <td className="px-3 py-3 font-mono text-blue-700">{fmtShort(T.total)}</td>
                  <td className="px-3 py-3 font-mono text-green-700">{fmtShort(T.cashCurr + T.cashNext)}</td>
                  <td className="px-3 py-3 font-mono text-blue-700">{fmtShort(T.card)}</td>
                  <td className="px-3 py-3 font-mono text-indigo-700">{fmtShort(T.fpx)}</td>
                  <td className="px-3 py-3 font-mono text-indigo-600">{fmtShort(T.ewallet)}</td>
                  <td className="px-3 py-3 font-mono text-indigo-500">{fmtShort(T.atome)}</td>
                  {panelProviders.map(p => (
                    <td key={p.id} className="px-3 py-3 font-mono text-purple-700">{fmtShort(panelTotals[p.code] ?? 0)}</td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
