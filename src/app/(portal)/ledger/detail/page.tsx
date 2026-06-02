import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import Link from "next/link";
import { DetailExportButtons } from "./DetailExportButtons";
import { notDeleted } from "@/lib/soft-delete";

const PAYMENT_LABELS: Record<string, string> = {
  CASH_CURRENT: "Cash — Current Month",
  CASH_NEXT:    "Cash — Next Month",
  CREDIT_CARD:  "Credit Card",
  FPX:          "FPX",
  EWALLET:      "eWallet",
  ATOME:        "Atome",
  PANEL:        "Panel",
};

const PAYMENT_COLORS: Record<string, string> = {
  CASH_CURRENT: "bg-green-50 border-green-300 text-green-800",
  CASH_NEXT:    "bg-teal-50 border-teal-300 text-teal-800",
  CREDIT_CARD:  "bg-blue-50 border-blue-300 text-blue-800",
  FPX:          "bg-indigo-50 border-indigo-300 text-indigo-800",
  EWALLET:      "bg-violet-50 border-violet-300 text-violet-800",
  ATOME:        "bg-pink-50 border-pink-300 text-pink-800",
  PANEL:        "bg-purple-50 border-purple-300 text-purple-800",
};

function fmt(n: number | string) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
}

type ViewMode = "monthly" | "period";

export default async function LedgerDetailPage({
  searchParams,
}: {
  searchParams: { month?: string; clinicId?: string; view?: string; from?: string; to?: string };
}) {
  await requirePermission("ledger:view");

  const view     = (searchParams.view ?? "monthly") as ViewMode;
  const clinicId = searchParams.clinicId ?? getSelectedClinicId();
  const month    = searchParams.month ?? new Date().toISOString().slice(0, 7);

  let from: Date;
  let to: Date;
  let periodLabel: string;
  let fromISO: string;
  let toISO: string;

  if (view === "period") {
    fromISO = searchParams.from ?? new Date().toISOString().slice(0, 10);
    toISO   = searchParams.to   ?? new Date().toISOString().slice(0, 10);
    from = new Date(fromISO + "T00:00:00");
    to   = new Date(toISO   + "T23:59:59");
    periodLabel = `${fromISO} → ${toISO}`;
  } else {
    const [year, mon] = month.split("-").map(Number);
    from = new Date(year, mon - 1, 1);
    to   = new Date(year, mon, 0, 23, 59, 59);
    fromISO = from.toISOString().slice(0, 10);
    toISO   = to.toISOString().slice(0, 10);
    periodLabel = month;
  }

  const [invoices, clinics] = await Promise.all([
    prisma.invoice.findMany({
      where: notDeleted({
        visit: {
          visitDate: { gte: from, lte: to },
          ...(clinicId ? { clinicId } : {}),
        },
      }),
      include: {
        visit: {
          include: {
            patient: {
              select: { name: true, icNumber: true, passportNo: true, isForeigner: true },
            },
            treatments: {
              include: {
                doctor: { include: { user: { select: { name: true } } } },
              },
            },
          },
        },
        payments: { include: { panelProvider: { select: { name: true, code: true } } } },
      },
      orderBy: [{ visit: { visitDate: "asc" } }],
    }),
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const clinicNameMap = Object.fromEntries(clinics.map(c => [c.id, c.name]));

  // Build flat list of payment lines, each carrying invoice context
  type PaymentRow = {
    invoiceId: string; invoiceRef: string; clinicId: string;
    patient: typeof invoices[0]["visit"]["patient"];
    visitDate: string;
    doctors: string;
    subtotal: number; sst: number; total: number;
    method: string;
    lineAmount: number;
    panelProvider?: { name: string; code: string } | null;
  };

  const paymentRows: PaymentRow[] = [];
  for (const inv of invoices) {
    const doctors = Array.from(new Set(
      inv.visit.treatments.filter(t => t.doctor?.user?.name).map(t => t.doctor!.user.name)
    )).join(", ") || "—";
    for (const p of inv.payments) {
      paymentRows.push({
        invoiceId:     inv.id,
        invoiceRef:    inv.invoiceRef,
        clinicId:      inv.visit.clinicId,
        patient:       inv.visit.patient,
        visitDate:     inv.visit.visitDate.toString(),
        doctors,
        subtotal:      Number(inv.subtotal),
        sst:           Number(inv.sst),
        total:         Number(inv.total),
        method:        p.method,
        lineAmount:    Number(p.amount),
        panelProvider: p.panelProvider,
      });
    }
  }

  // Group payment rows by method
  const groups: Record<string, PaymentRow[]> = {};
  for (const row of paymentRows) {
    if (!groups[row.method]) groups[row.method] = [];
    groups[row.method].push(row);
  }

  const paymentOrder = ["CASH_CURRENT","CASH_NEXT","CREDIT_CARD","FPX","EWALLET","ATOME","PANEL"];
  const sortedKeys   = paymentOrder.filter(k => groups[k]);

  const grandTotal    = invoices.reduce((s, i) => s + Number(i.total), 0);
  const grandSST      = invoices.reduce((s, i) => s + Number(i.sst), 0);
  const grandSubtotal = invoices.reduce((s, i) => s + Number(i.subtotal), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="mb-1">
            <Link href="/ledger" className="text-sm text-slate-500 hover:text-slate-700">← Collection Ledger</Link>
          </div>
          <h1 className="page-title">Collection Detail</h1>
          <p className="text-sm text-slate-500 mt-0.5">{periodLabel} · {invoices.length} invoices</p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <form className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Branch</label>
              <select name="clinicId" defaultValue={clinicId ?? ""} className="form-input w-auto">
                <option value="">All Branches</option>
                {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">View</label>
              <div className="flex border border-slate-300 rounded-md overflow-hidden">
                {([["monthly","Monthly"],["period","Period"]] as const).map(([v,l]) => (
                  <button key={v} type="submit" name="view" value={v}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                      view === v ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

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

          <DetailExportButtons
            from={fromISO}
            to={toISO}
            clinicId={clinicId ?? undefined}
          />
        </div>
      </div>

      {/* Grand totals */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="stat-card">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Amount Before SST</p>
            <p className="text-xl font-semibold text-slate-900 mt-1">{fmt(grandSubtotal)}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">SST Collected</p>
            <p className="text-xl font-semibold text-amber-700 mt-1">{fmt(grandSST)}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Collection</p>
            <p className="text-xl font-semibold text-blue-700 mt-1">{fmt(grandTotal)}</p>
            <p className="text-xs text-slate-400 mt-1">{invoices.length} invoices</p>
          </div>
        </div>
      )}

      {invoices.length === 0 && (
        <div className="card p-12 text-center text-slate-400">No invoices found for {periodLabel}</div>
      )}

      {/* Payment method groups — one row per payment LINE */}
      {sortedKeys.map(key => {
        const rows       = groups[key];
        const groupAmt   = rows.reduce((s, r) => s + r.lineAmount, 0);
        const colorClass = PAYMENT_COLORS[key] ?? "bg-slate-50 border-slate-300 text-slate-700";

        return (
          <div key={key} className="card mb-6 overflow-hidden">
            <div className={`px-5 py-3 border-b flex items-center justify-between ${colorClass}`}>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm">{PAYMENT_LABELS[key] ?? key}</span>
                <span className="text-xs opacity-75">{rows.length} line{rows.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="font-mono text-sm font-semibold">{fmt(groupAmt)}</div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    {["Patient Name","IC / Passport","Branch","Visit Date","Doctor","Invoice","Amt (this method)","Invoice Total"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const vDate = new Date(row.visitDate);
                    return (
                      <tr key={i} className="table-row">
                        <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">{row.patient.name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                          {row.patient.isForeigner ? (row.patient.passportNo ?? "—") : (row.patient.icNumber ?? "—")}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{clinicNameMap[row.clinicId] ?? "—"}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                          {vDate.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{row.doctors}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-blue-600">{row.invoiceRef}</td>
                        <td className="px-4 py-2.5 font-mono text-right font-semibold text-slate-900">{fmt(row.lineAmount)}</td>
                        <td className="px-4 py-2.5 font-mono text-right text-slate-500">{fmt(row.total)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-sm">
                    <td className="px-4 py-2.5 text-slate-700" colSpan={6}>Subtotal — {PAYMENT_LABELS[key] ?? key}</td>
                    <td className="px-4 py-2.5 font-mono text-right text-blue-700">{fmt(groupAmt)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Grand total footer */}
      {invoices.length > 0 && (
        <div className="card p-5 bg-slate-900 border-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold">Grand Total — {periodLabel}</span>
            <div className="flex items-center gap-8 font-mono text-sm">
              <div className="text-slate-300">Before SST: <span className="text-white font-bold">{fmt(grandSubtotal)}</span></div>
              <div className="text-slate-300">SST: <span className="text-amber-400 font-bold">{fmt(grandSST)}</span></div>
              <div className="text-slate-300">Total: <span className="text-blue-300 font-bold text-base">{fmt(grandTotal)}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
