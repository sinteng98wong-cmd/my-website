"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Clinic = { id: string; name: string };

type MethodLine = { method: string; bankName: string | null; amount: number };

type ReceiptGroup = {
  settlementMonth: string;
  label: string;
  isCurrentMonth: boolean;
  amount: number;
  byMethod: MethodLine[];
};

type ClosingData = {
  month: string;
  monthLabel: string;
  invoiceCount: number;
  sales: {
    professionalFees: number;
    products: number;
    sst: number;
    panelDebtor: number;
    total: number;
  };
  receiptGroups: ReceiptGroup[];
  outstanding: { amount: number; byMethod: MethodLine[] };
  summary: {
    totalBilled: number;
    totalReceived: number;
    panelDebtor: number;
    outstanding: number;
    balance: number;
  };
};

const METHOD_LABELS: Record<string, string> = {
  CASH_CURRENT: "Cash (Current)", CASH_NEXT: "Cash (Next Month)",
  CREDIT_CARD: "Credit Card", FPX: "FPX",
  EWALLET: "eWallet", ATOME: "Atome", PANEL: "Panel", DEPOSIT: "Deposit",
};

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

function methodDesc(ml: MethodLine) {
  const label = METHOD_LABELS[ml.method] ?? ml.method;
  return ml.bankName ? `${label} · ${ml.bankName}` : label;
}

export function MonthlyClosingClient({ clinics, initialMonth, initialClinicId }: {
  clinics: Clinic[];
  initialMonth: string;
  initialClinicId: string;
}) {
  const [month,    setMonth]    = useState(initialMonth);
  const [clinicId, setClinicId] = useState(initialClinicId);
  const [data,     setData]     = useState<ClosingData | null>(null);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ month, ...(clinicId ? { clinicId } : {}) });
    const res = await fetch(`/api/ledger/monthly-closing?${qs}`);
    setData(res.ok ? await res.json() : null);
    setLoading(false);
  }, [month, clinicId]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="mb-1">
            <Link href="/ledger" className="text-sm text-slate-500 hover:text-slate-700">← Daily Ledger</Link>
          </div>
          <h1 className="page-title">Monthly Closing</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Sales vs receipts reconciliation — {data?.monthLabel ?? month}
            {data && <span className="ml-2 text-slate-400">({data.invoiceCount} invoices)</span>}
          </p>
        </div>

        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Branch</label>
            <select value={clinicId} onChange={e => setClinicId(e.target.value)} className="form-input w-auto">
              <option value="">All Branches</option>
              {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Sales Month</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="form-input w-auto" />
          </div>
        </div>
      </div>

      {loading && (
        <div className="card p-8 text-center text-slate-400">Loading…</div>
      )}

      {!loading && data && (
        <div className="space-y-4">

          {/* ── SALES ─────────────────────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Sales — {data.monthLabel}</h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-600">Professional Fees</td>
                  <td className="px-5 py-3 text-right font-mono text-slate-800">{fmt(data.sales.professionalFees)}</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-600">Products</td>
                  <td className="px-5 py-3 text-right font-mono text-slate-800">{fmt(data.sales.products)}</td>
                </tr>
                {data.sales.sst > 0 && (
                  <tr className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-600">SST (6%)</td>
                    <td className="px-5 py-3 text-right font-mono text-slate-800">{fmt(data.sales.sst)}</td>
                  </tr>
                )}
                {data.sales.panelDebtor > 0 && (
                  <tr className="hover:bg-slate-50 bg-purple-50">
                    <td className="px-5 py-3 text-purple-700">Panel Debtor</td>
                    <td className="px-5 py-3 text-right font-mono text-purple-700">{fmt(data.sales.panelDebtor)}</td>
                  </tr>
                )}
                <tr className="bg-slate-800">
                  <td className="px-5 py-3 font-semibold text-white">Total Billed</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-white">{fmt(data.sales.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── RECEIPTS ──────────────────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Receipts (OR)</h2>
            </div>

            {data.receiptGroups.length === 0 && data.outstanding.amount === 0 && (
              <p className="px-5 py-6 text-slate-400 text-sm">No receipts recorded for this sales month yet.</p>
            )}

            {data.receiptGroups.map((g) => (
              <div key={g.settlementMonth}>
                {/* Group header */}
                <div className={`px-5 py-2.5 border-b border-slate-100 flex items-center justify-between ${g.isCurrentMonth ? "bg-green-50" : "bg-blue-50"}`}>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${g.isCurrentMonth ? "text-green-700" : "text-blue-700"}`}>
                    {g.label}
                  </span>
                  <span className={`font-mono font-bold text-sm ${g.isCurrentMonth ? "text-green-700" : "text-blue-700"}`}>
                    {fmt(g.amount)}
                  </span>
                </div>
                {/* Method breakdown */}
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-50">
                    {g.byMethod.map((ml, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-8 py-2.5 text-slate-500">{methodDesc(ml)}</td>
                        <td className="px-5 py-2.5 text-right font-mono text-slate-700">{fmt(ml.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {/* Outstanding */}
            {data.outstanding.amount > 0 && (
              <div>
                <div className="px-5 py-2.5 border-b border-slate-100 border-t flex items-center justify-between bg-amber-50">
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Outstanding — not yet received
                  </span>
                  <span className="font-mono font-bold text-sm text-amber-700">{fmt(data.outstanding.amount)}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-50">
                    {data.outstanding.byMethod.map((ml, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-8 py-2.5 text-slate-500">{methodDesc(ml)}</td>
                        <td className="px-5 py-2.5 text-right font-mono text-slate-500">{fmt(ml.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Total received */}
            {data.receiptGroups.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between bg-green-800">
                <span className="text-sm font-semibold text-white">Total Received</span>
                <span className="font-mono font-bold text-white">{fmt(s?.totalReceived ?? 0)}</span>
              </div>
            )}
          </div>

          {/* ── SUMMARY / BALANCE ─────────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Reconciliation Summary</h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-5 py-3 text-slate-600">Total Billed</td>
                  <td className="px-5 py-3 text-right font-mono text-slate-800">{fmt(s?.totalBilled ?? 0)}</td>
                </tr>
                <tr className="bg-green-50">
                  <td className="px-5 py-3 text-green-700">Total Received</td>
                  <td className="px-5 py-3 text-right font-mono text-green-700">({fmt(s?.totalReceived ?? 0)})</td>
                </tr>
                {(s?.panelDebtor ?? 0) > 0 && (
                  <tr className="bg-purple-50">
                    <td className="px-5 py-3 text-purple-700">Panel Debtor (outstanding)</td>
                    <td className="px-5 py-3 text-right font-mono text-purple-700">{fmt(s?.panelDebtor ?? 0)}</td>
                  </tr>
                )}
                {(s?.outstanding ?? 0) > 0 && (
                  <tr className="bg-amber-50">
                    <td className="px-5 py-3 text-amber-700">Other Outstanding</td>
                    <td className="px-5 py-3 text-right font-mono text-amber-700">{fmt(s?.outstanding ?? 0)}</td>
                  </tr>
                )}
                <tr className={`${(s?.balance ?? 0) === 0 ? "bg-green-800" : "bg-red-700"}`}>
                  <td className="px-5 py-3 font-bold text-white">Balance</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-white">
                    {fmt(s?.balance ?? 0)}
                    {(s?.balance ?? 0) === 0 && <span className="ml-2 text-green-200">✓ Balanced</span>}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Note on deferred */}
            {data.receiptGroups.some(g => !g.isCurrentMonth) && (
              <div className="px-5 py-3 border-t border-slate-200 bg-blue-50">
                <p className="text-xs text-blue-700">
                  💡 Deferred receipts are shown in the month they were actually received.
                  To reconcile deferred amounts, go to{" "}
                  <Link href="/ledger/settlements" className="underline font-medium">Settlements</Link> and mark them settled.
                </p>
              </div>
            )}
          </div>

        </div>
      )}

      {!loading && !data && (
        <div className="card p-8 text-center text-red-500 text-sm">Failed to load. Please try again.</div>
      )}
    </div>
  );
}
