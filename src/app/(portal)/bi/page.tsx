"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts"
import { TrendingUp, TrendingDown, Minus, RefreshCw, Download } from "lucide-react"
import * as XLSX from "xlsx"

// ── Types ─────────────────────────────────────────────────────────────────

type SummaryData = {
  totalRevenue: number
  totalRevenueChangePct: number | null
  totalInvoices: number
  totalPatients: number
  newPatients: number
  avgInvoiceValue: number
  topClinic: string | null
  topDoctor: string | null
}

type RevenueData = {
  totalRevenue: number
  revenueChangePct: number | null
  invoiceCount: number
  avgInvoiceValue: number
  profFees: number
  products: number
  sst: number
  byPaymentMethod: { method: string; amount: number; percentage: number }[]
  byTreatmentCategory: { category: string; amount: number; count: number }[]
  trend: { date: string; revenue: number }[]
}

type ClinicRevenue = {
  clinicId: string
  clinicName: string
  totalRevenue: number
  invoiceCount: number
  avgInvoiceValue: number
  newPatients: number
  returningPatients: number
  revenueChangePct: number | null
  revenuePerDay: number
}

type DoctorData = {
  doctorId: string
  doctorName: string
  clinicName: string
  revenue: number
  treatmentCount: number
  patientCount: number
  avgRevenuePerPatient: number
  treatmentsPerDay: number
  revenuePerDay: number
}

type ProductivityData = {
  totalTreatments: number
  treatmentsPerDoctor: number
  avgTreatmentsPerDay: number
  topTreatments: { name: string; count: number; revenue: number; pct: number }[]
  doctorUtilisation: {
    doctorName: string
    scheduledDays: number
    workedDays: number
    treatments: number
    revenue: number
  }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)

const CHART_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16"]

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-slate-400">—</span>
  if (pct > 0)
    return (
      <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600">
        <TrendingUp size={12} />+{pct}%
      </span>
    )
  if (pct < 0)
    return (
      <span className="flex items-center gap-0.5 text-xs font-medium text-red-500">
        <TrendingDown size={12} />{pct}%
      </span>
    )
  return (
    <span className="flex items-center gap-0.5 text-xs text-slate-400">
      <Minus size={12} />0%
    </span>
  )
}

function Skeleton({ h = "h-4" }: { h?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${h} w-full`} />
}

function SectionSkeleton() {
  return (
    <div className="card p-5 space-y-3">
      <Skeleton h="h-5" />
      <Skeleton h="h-32" />
      <Skeleton h="h-4" />
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  changePct,
  loading,
}: {
  label: string
  value: string
  sub?: string
  changePct?: number | null
  loading: boolean
}) {
  return (
    <div className="stat-card flex flex-col gap-1">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      {loading ? (
        <Skeleton h="h-8" />
      ) : (
        <>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {sub && <p className="text-xs text-slate-500">{sub}</p>}
          {changePct !== undefined && <ChangeBadge pct={changePct ?? null} />}
        </>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function BIPage() {
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const isCrossClinic = role === "SUPER_ADMIN" || role === "FINANCE"

  const [period, setPeriod] = useState("this_month")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [clinicId, setClinicId] = useState<string>("")
  const [clinics, setClinics] = useState<{ id: string; name: string }[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [revenue, setRevenue] = useState<RevenueData | null>(null)
  const [byClinic, setByClinic] = useState<ClinicRevenue[]>([])
  const [byDoctor, setByDoctor] = useState<DoctorData[]>([])
  const [productivity, setProductivity] = useState<ProductivityData | null>(null)
  const [compareMetric, setCompareMetric] = useState<"totalRevenue" | "invoiceCount" | "avgInvoiceValue" | "newPatients">("totalRevenue")
  const [doctorSort, setDoctorSort] = useState<{ col: keyof DoctorData; dir: "asc" | "desc" }>({ col: "revenue", dir: "desc" })

  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingRevenue, setLoadingRevenue] = useState(true)
  const [loadingByClinic, setLoadingByClinic] = useState(true)
  const [loadingDoctor, setLoadingDoctor] = useState(true)
  const [loadingProd, setLoadingProd] = useState(true)

  // Load accessible clinics
  useEffect(() => {
    fetch("/api/me/clinics")
      .then((r) => r.json())
      .then((data) => {
        setClinics(data)
        if (data.length > 0 && !clinicId) setClinicId(data[0].id)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buildQS = useCallback(
    (extras: Record<string, string | undefined> = {}) => {
      const p = new URLSearchParams({ period })
      if (period === "custom" && from) p.set("from", from)
      if (period === "custom" && to) p.set("to", to)
      Object.entries(extras).forEach(([k, v]) => { if (v) p.set(k, v) })
      return p.toString()
    },
    [period, from, to]
  )

  // Fetch all sections progressively
  useEffect(() => {
    if (!session) return

    // Summary (always)
    setLoadingSummary(true)
    fetch(`/api/bi/summary?${buildQS()}`)
      .then((r) => r.json())
      .then(setSummary)
      .finally(() => setLoadingSummary(false))

    // Cross-branch (SUPER_ADMIN/FINANCE only)
    if (isCrossClinic) {
      setLoadingByClinic(true)
      fetch(`/api/bi/revenue/by-clinic?${buildQS()}`)
        .then((r) => r.json())
        .then(setByClinic)
        .finally(() => setLoadingByClinic(false))
    } else {
      setLoadingByClinic(false)
      setByClinic([])
    }

    // Clinic-specific sections
    if (!clinicId) return

    setLoadingRevenue(true)
    fetch(`/api/bi/revenue?${buildQS({ clinicId })}`)
      .then((r) => r.json())
      .then(setRevenue)
      .finally(() => setLoadingRevenue(false))

    setLoadingDoctor(true)
    fetch(`/api/bi/revenue/by-doctor?${buildQS({ clinicId })}`)
      .then((r) => r.json())
      .then(setByDoctor)
      .finally(() => setLoadingDoctor(false))

    setLoadingProd(true)
    fetch(`/api/bi/productivity?${buildQS({ clinicId })}`)
      .then((r) => r.json())
      .then(setProductivity)
      .finally(() => setLoadingProd(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, period, from, to, clinicId, refreshKey, isCrossClinic, buildQS])

  // ── Sorted doctors table ──────────────────────────────────────────────
  const sortedDoctors = [...byDoctor].sort((a, b) => {
    const av = a[doctorSort.col] as number
    const bv = b[doctorSort.col] as number
    return doctorSort.dir === "desc" ? bv - av : av - bv
  })

  function toggleSort(col: keyof DoctorData) {
    setDoctorSort((s) => ({
      col,
      dir: s.col === col && s.dir === "desc" ? "asc" : "desc",
    }))
  }

  // ── Excel export ──────────────────────────────────────────────────────
  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const periodLabel = period.replace("_", " ")

    if (summary) {
      const ws = XLSX.utils.json_to_sheet([summary])
      XLSX.utils.book_append_sheet(wb, ws, "Summary")
    }
    if (byClinic.length) {
      const ws = XLSX.utils.json_to_sheet(byClinic)
      XLSX.utils.book_append_sheet(wb, ws, "By Clinic")
    }
    if (byDoctor.length) {
      const ws = XLSX.utils.json_to_sheet(byDoctor)
      XLSX.utils.book_append_sheet(wb, ws, "By Doctor")
    }
    if (productivity?.topTreatments.length) {
      const ws = XLSX.utils.json_to_sheet(productivity.topTreatments)
      XLSX.utils.book_append_sheet(wb, ws, "Top Treatments")
    }
    if (revenue?.byPaymentMethod.length) {
      const ws = XLSX.utils.json_to_sheet(revenue.byPaymentMethod)
      XLSX.utils.book_append_sheet(wb, ws, "Payment Methods")
    }

    const scope = clinicId ? clinics.find((c) => c.id === clinicId)?.name ?? clinicId : "All"
    XLSX.writeFile(wb, `BI-${scope}-${periodLabel}.xlsx`)
  }

  // ── Cross-branch bar data ─────────────────────────────────────────────
  const METRIC_LABELS: Record<string, string> = {
    totalRevenue: "Revenue (RM)",
    invoiceCount: "Invoices",
    avgInvoiceValue: "Avg Invoice (RM)",
    newPatients: "New Patients",
  }
  const sortedByClinic = [...byClinic].sort((a, b) => (b[compareMetric] as number) - (a[compareMetric] as number))
  const bestClinicId = sortedByClinic[0]?.clinicId
  const worstClinicId = sortedByClinic[sortedByClinic.length - 1]?.clinicId

  // ── Multi-line trend by clinic (when no specific clinic selected) ─────
  const trendIsMulti = isCrossClinic && byClinic.length > 0 && !clinicId
  // For multi-line, we'd need per-clinic trend data. We'll show single-line if clinicId set.
  const singleTrend = revenue?.trend ?? []

  return (
    <div className="space-y-6 pb-10">
      {/* ── TOP BAR ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <TrendingUp size={22} className="text-blue-500" /> Business Intelligence
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Revenue &amp; staff productivity insights</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_quarter">This Quarter</option>
            <option value="this_year">This Year</option>
            <option value="custom">Custom</option>
          </select>
          {period === "custom" && (
            <>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
              />
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
              />
            </>
          )}

          {/* Clinic selector */}
          {isCrossClinic ? (
            <select
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-600">
              {clinics.find((c) => c.id === clinicId)?.name ?? "—"}
            </span>
          )}

          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white hover:bg-slate-50"
          >
            <RefreshCw size={14} /> Refresh
          </button>

          <button
            onClick={exportExcel}
            className="flex items-center gap-1.5 text-sm bg-blue-600 text-white rounded-lg px-3 py-2 hover:bg-blue-700"
          >
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* ── ROW 1: KPI CARDS ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard
          label="Total Revenue"
          value={RM(summary?.totalRevenue ?? 0)}
          changePct={summary?.totalRevenueChangePct ?? null}
          loading={loadingSummary}
        />
        <KPICard
          label="Invoices"
          value={(summary?.totalInvoices ?? 0).toLocaleString()}
          loading={loadingSummary}
        />
        <KPICard
          label="New Patients"
          value={(summary?.newPatients ?? 0).toLocaleString()}
          sub={`${(summary?.totalPatients ?? 0).toLocaleString()} total`}
          loading={loadingSummary}
        />
        <KPICard
          label="Avg Invoice"
          value={RM(summary?.avgInvoiceValue ?? 0)}
          loading={loadingSummary}
        />
        <KPICard
          label="Top Clinic"
          value={summary?.topClinic ?? "—"}
          loading={loadingSummary}
        />
        <KPICard
          label="Top Doctor"
          value={summary?.topDoctor ?? "—"}
          loading={loadingSummary}
        />
      </div>

      {/* ── ROW 2: REVENUE TREND ─────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Revenue Trend</h2>
        {loadingRevenue ? (
          <SectionSkeleton />
        ) : singleTrend.length === 0 ? (
          <p className="text-sm text-slate-400 py-10 text-center">No data for this period</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={singleTrend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                width={40}
              />
              <Tooltip
                formatter={(v: any) => [RM(Number(v)), "Revenue"]}
                labelFormatter={(l: any) => `Date: ${l}`}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── ROW 3: CROSS-BRANCH COMPARISON (SUPER_ADMIN / FINANCE) ────── */}
      {isCrossClinic && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Cross-Branch Comparison</h2>
            <div className="flex gap-1">
              {(["totalRevenue","invoiceCount","avgInvoiceValue","newPatients"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setCompareMetric(m)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    compareMetric === m
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {METRIC_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {loadingByClinic ? (
            <SectionSkeleton />
          ) : (
            <>
              {/* Bar chart */}
              <div className="card p-5">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={sortedByClinic}
                    margin={{ top: 4, right: 16, left: 0, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="clinicName"
                      tick={{ fontSize: 11 }}
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) =>
                        compareMetric === "totalRevenue" || compareMetric === "avgInvoiceValue"
                          ? `${(v / 1000).toFixed(0)}k`
                          : `${v}`
                      }
                      width={44}
                    />
                    <Tooltip
                      formatter={(v: any) =>
                        compareMetric === "totalRevenue" || compareMetric === "avgInvoiceValue"
                          ? [RM(Number(v)), METRIC_LABELS[compareMetric]]
                          : [Number(v).toLocaleString(), METRIC_LABELS[compareMetric]]
                      }
                    />
                    <Bar dataKey={compareMetric} radius={[4, 4, 0, 0]}>
                      {sortedByClinic.map((entry) => (
                        <Cell
                          key={entry.clinicId}
                          fill={
                            entry.clinicId === bestClinicId
                              ? "#10b981"
                              : entry.clinicId === worstClinicId
                              ? "#ef4444"
                              : "#3b82f6"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Comparison table */}
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="table-header">
                    <tr>
                      {["Clinic","Revenue","Δ%","Invoices","Avg Value","New Pts","Returning","Rev/Day"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedByClinic.map((c) => (
                      <tr
                        key={c.clinicId}
                        className={`table-row ${
                          c.clinicId === bestClinicId
                            ? "bg-emerald-50/50"
                            : c.clinicId === worstClinicId
                            ? "bg-red-50/50"
                            : ""
                        }`}
                      >
                        <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">{c.clinicName}</td>
                        <td className="px-4 py-2.5 font-mono">{RM(c.totalRevenue)}</td>
                        <td className="px-4 py-2.5"><ChangeBadge pct={c.revenueChangePct} /></td>
                        <td className="px-4 py-2.5">{c.invoiceCount.toLocaleString()}</td>
                        <td className="px-4 py-2.5 font-mono">{RM(c.avgInvoiceValue)}</td>
                        <td className="px-4 py-2.5">{c.newPatients.toLocaleString()}</td>
                        <td className="px-4 py-2.5">{c.returningPatients.toLocaleString()}</td>
                        <td className="px-4 py-2.5 font-mono">{RM(c.revenuePerDay)}</td>
                      </tr>
                    ))}
                    {sortedByClinic.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-slate-400">No data for this period</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ROW 4: REVENUE BREAKDOWN ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Payment method donut */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">By Payment Method</h2>
          {loadingRevenue ? (
            <SectionSkeleton />
          ) : (revenue?.byPaymentMethod.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center">No data</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie
                    data={revenue!.byPaymentMethod}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    dataKey="amount"
                    nameKey="method"
                  >
                    {revenue!.byPaymentMethod.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [RM(Number(v)), ""]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {revenue!.byPaymentMethod.map((pm, i) => (
                  <div key={pm.method} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      {pm.method}
                    </span>
                    <span className="text-slate-500">{pm.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Treatment category bar */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">By Treatment Category</h2>
          {loadingRevenue ? (
            <SectionSkeleton />
          ) : (revenue?.byTreatmentCategory.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={revenue!.byTreatmentCategory.slice(0, 8)}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 80, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  dataKey="category"
                  type="category"
                  tick={{ fontSize: 10 }}
                  width={78}
                />
                <Tooltip formatter={(v: any) => [RM(Number(v)), "Revenue"]} />
                <Bar dataKey="amount" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── ROW 5: STAFF PRODUCTIVITY ────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Staff Productivity</h2>
        {loadingDoctor ? (
          <SectionSkeleton />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Doctor revenue bar (top 10) */}
            <div className="card p-5 lg:col-span-2">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
                Revenue by Doctor (Top 10)
              </h3>
              {byDoctor.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={byDoctor.slice(0, 10)}
                    layout="vertical"
                    margin={{ top: 0, right: 16, left: 80, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      dataKey="doctorName"
                      type="category"
                      tick={{ fontSize: 10 }}
                      width={78}
                    />
                    <Tooltip formatter={(v: any) => [RM(Number(v)), "Revenue"]} />
                    <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                      {byDoctor.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={i === 0 ? "#10b981" : "#8b5cf6"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Sortable doctor table */}
            <div className="card overflow-x-auto lg:col-span-3">
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    {(
                      [
                        ["Doctor", "doctorName"],
                        ["Revenue", "revenue"],
                        ["Treatments", "treatmentCount"],
                        ["Patients", "patientCount"],
                        ["Tx/Day", "treatmentsPerDay"],
                        ["Rev/Patient", "avgRevenuePerPatient"],
                      ] as [string, keyof DoctorData][]
                    ).map(([label, col]) => (
                      <th
                        key={col}
                        onClick={() => typeof sortedDoctors[0]?.[col] === "number" ? toggleSort(col) : undefined}
                        className={`px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap ${
                          typeof sortedDoctors[0]?.[col] === "number" ? "cursor-pointer hover:text-slate-700" : ""
                        }`}
                      >
                        {label}
                        {doctorSort.col === col && (
                          <span className="ml-1">{doctorSort.dir === "desc" ? "↓" : "↑"}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedDoctors.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-400">No data</td>
                    </tr>
                  )}
                  {sortedDoctors.map((d, i) => (
                    <tr
                      key={d.doctorId}
                      className={`table-row ${i === 0 ? "bg-emerald-50/40" : ""}`}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">{d.doctorName}</td>
                      <td className="px-4 py-2.5 font-mono">{RM(d.revenue)}</td>
                      <td className="px-4 py-2.5">{d.treatmentCount}</td>
                      <td className="px-4 py-2.5">{d.patientCount}</td>
                      <td className="px-4 py-2.5">{d.treatmentsPerDay}</td>
                      <td className="px-4 py-2.5 font-mono">{RM(d.avgRevenuePerPatient)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── ROW 6: TOP TREATMENTS ────────────────────────────────────── */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Top Treatments</h2>
        </div>
        {loadingProd ? (
          <div className="p-5">
            <SectionSkeleton />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  {["Treatment","Count","Revenue","% of Total"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(productivity?.topTreatments ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400">No data</td>
                  </tr>
                )}
                {(productivity?.topTreatments ?? []).map((t, i) => (
                  <tr key={t.name + i} className="table-row">
                    <td className="px-5 py-3 font-medium text-slate-900">{t.name}</td>
                    <td className="px-5 py-3">{t.count.toLocaleString()}</td>
                    <td className="px-5 py-3 font-mono">{RM(t.revenue)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.min(100, t.pct)}%` }}
                          />
                        </div>
                        <span className="text-slate-500">{t.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── DOCTOR UTILISATION (from productivity) ────────────────────── */}
      {(productivity?.doctorUtilisation.length ?? 0) > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Doctor Utilisation</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  {["Doctor","Worked Days","Treatments","Revenue"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productivity!.doctorUtilisation.map((d, i) => (
                  <tr key={d.doctorName + i} className="table-row">
                    <td className="px-5 py-3 font-medium text-slate-900">{d.doctorName}</td>
                    <td className="px-5 py-3">{d.workedDays}</td>
                    <td className="px-5 py-3">{d.treatments.toLocaleString()}</td>
                    <td className="px-5 py-3 font-mono">{RM(d.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
