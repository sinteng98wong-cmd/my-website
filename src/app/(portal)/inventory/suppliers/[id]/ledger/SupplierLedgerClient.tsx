"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

type Invoice = {
  id: string; invoiceRef: string; month: string; poRef: string | null;
  entity: string; branches: string; doCount: number;
  amount: number; sst: number; total: number;
  invoiceDate: string | null;
};
type Payment = {
  id: string; amount: number; paidAt: string;
  reference: string | null; notes: string | null;
};
type Supplier = {
  id: string; name: string; code: string | null;
  contactName: string | null; email: string | null; phone: string | null;
};

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

// "2026-05-15T..." → "2026-05"
function toMonth(iso: string) {
  return iso.slice(0, 7);
}

export function SupplierLedgerClient({
  supplier, invoices, payments, totalInvoiced, totalPaid,
}: {
  supplier:      Supplier;
  invoices:      Invoice[];
  payments:      Payment[];
  totalInvoiced: number;
  totalPaid:     number;
}) {
  const router      = useRouter();
  const outstanding = totalInvoiced - totalPaid;

  // ── Month filter ──────────────────────────────────────────────────────
  const [filterMonth, setFilterMonth] = useState<string>("all");

  // Build unique months from invoices (by invoiceDate) + payments (by paidAt)
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    invoices.forEach((i) => { if (i.invoiceDate) months.add(toMonth(i.invoiceDate)); });
    payments.forEach((p) => months.add(toMonth(p.paidAt)));
    return [...months].sort().reverse();
  }, [invoices, payments]);

  // ── Chronological ledger entries ──────────────────────────────────────
  type Entry = {
    date: string; label: string; ref: string;
    debit: number; credit: number; type: "invoice" | "payment";
  };

  const allEntries: Entry[] = useMemo(() => [
    ...invoices.map((i) => ({
      date:   i.invoiceDate ?? i.month + "-01",
      label:  `${i.invoiceRef}${i.poRef ? ` (${i.poRef})` : ""}${i.branches ? ` — ${i.branches}` : ""}`,
      ref:    i.invoiceRef,
      debit:  i.total,
      credit: 0,
      type:   "invoice" as const,
    })),
    ...payments.map((p) => ({
      date:   p.paidAt,
      label:  `Payment${p.reference ? ` · ${p.reference}` : ""}${p.notes ? ` — ${p.notes}` : ""}`,
      ref:    p.reference ?? "—",
      debit:  0,
      credit: p.amount,
      type:   "payment" as const,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date)), [invoices, payments]);

  // Opening balance = sum of all entries BEFORE the filter month
  const openingBalance = useMemo(() => {
    if (filterMonth === "all") return 0;
    return allEntries
      .filter((e) => toMonth(e.date) < filterMonth)
      .reduce((s, e) => s + e.debit - e.credit, 0);
  }, [allEntries, filterMonth]);

  const filteredEntries = useMemo(() => {
    if (filterMonth === "all") return allEntries;
    return allEntries.filter((e) => toMonth(e.date) === filterMonth);
  }, [allEntries, filterMonth]);

  const periodInvoiced = filteredEntries.reduce((s, e) => s + e.debit,  0);
  const periodPaid     = filteredEntries.reduce((s, e) => s + e.credit, 0);

  // ── Payment form ──────────────────────────────────────────────────────
  const [payForm, setPayForm] = useState({
    amount: "", paidAt: new Date().toISOString().slice(0, 10), reference: "", notes: "",
  });
  const [payOpen, setPayOpen] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) { setError("Enter a valid amount"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/inventory/suppliers/${supplier.id}/ledger`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, paidAt: payForm.paidAt, reference: payForm.reference, notes: payForm.notes }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error); return; }
      router.refresh();
      setPayOpen(false);
      setPayForm({ amount: "", paidAt: new Date().toISOString().slice(0, 10), reference: "", notes: "" });
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <Link href="/inventory/suppliers" className="text-sm text-slate-500 hover:text-slate-700">
          ← Suppliers
        </Link>
      </div>

      {/* Supplier header */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="page-title">{supplier.name}</h1>
            {supplier.code && <p className="text-xs font-mono text-slate-400 mt-0.5">{supplier.code}</p>}
            <div className="flex gap-4 mt-2 text-sm text-slate-500">
              {supplier.contactName && <span>{supplier.contactName}</span>}
              {supplier.email       && <span>{supplier.email}</span>}
              {supplier.phone       && <span>{supplier.phone}</span>}
            </div>
          </div>
          {/* All-time summary tiles */}
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Total Invoiced</p>
              <p className="text-lg font-bold text-slate-800">{fmt(totalInvoiced)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Total Paid</p>
              <p className="text-lg font-bold text-green-700">{fmt(totalPaid)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Outstanding</p>
              <p className={`text-lg font-bold ${outstanding > 0 ? "text-red-600" : "text-slate-500"}`}>
                {fmt(outstanding)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Record payment */}
      <div className="mb-6">
        {!payOpen ? (
          <button type="button" onClick={() => setPayOpen(true)} className="btn-primary">
            Record Payment
          </button>
        ) : (
          <form onSubmit={recordPayment} className="card p-5 space-y-4">
            <h2 className="font-semibold text-slate-800">Record Payment</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Amount (RM) *</label>
                <input type="number" step="0.01" min="0.01" required className="form-input"
                  value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Date</label>
                <input type="date" className="form-input"
                  value={payForm.paidAt} onChange={(e) => setPayForm((f) => ({ ...f, paidAt: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Reference (cheque / TT ref)</label>
                <input type="text" className="form-input font-mono"
                  value={payForm.reference} onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Notes</label>
                <input type="text" className="form-input"
                  value={payForm.notes} onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? "Saving…" : "Save Payment"}
              </button>
              <button type="button" onClick={() => setPayOpen(false)} className="btn-ghost">Cancel</button>
            </div>
          </form>
        )}
      </div>

      {/* Ledger */}
      <div className="card overflow-hidden">
        {/* Ledger header + month filter */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-4">
          <h2 className="font-semibold text-slate-700">Account Ledger</h2>
          <div className="flex items-center gap-3">
            {filterMonth !== "all" && (
              <div className="flex gap-4 text-xs text-slate-600">
                <span>Invoiced: <strong>{fmt(periodInvoiced)}</strong></span>
                <span>Paid: <strong className="text-green-700">{fmt(periodPaid)}</strong></span>
                <span>Net: <strong className={periodInvoiced - periodPaid > 0 ? "text-red-600" : "text-green-700"}>
                  {fmt(periodInvoiced - periodPaid)}
                </strong></span>
              </div>
            )}
            <select
              className="form-input text-sm py-1.5 w-36"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
            >
              <option value="all">All months</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {format(new Date(m + "-01"), "MMM yyyy")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Invoice Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Debit (Invoice)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Credit (Payment)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Balance</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening balance row when filtering by month */}
            {filterMonth !== "all" && (
              <tr className="bg-slate-50 border-b border-slate-200">
                <td className="px-4 py-2 text-xs text-slate-400 italic">
                  Before {format(new Date(filterMonth + "-01"), "MMM yyyy")}
                </td>
                <td className="px-4 py-2 text-xs text-slate-400 italic">Opening balance</td>
                <td className="px-4 py-2" />
                <td className="px-4 py-2" />
                <td className={`px-4 py-2 text-right text-sm font-semibold ${openingBalance > 0 ? "text-red-600" : "text-slate-500"}`}>
                  {fmt(openingBalance)}
                </td>
              </tr>
            )}

            {filteredEntries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No transactions{filterMonth !== "all" ? ` in ${format(new Date(filterMonth + "-01"), "MMMM yyyy")}` : ""}.
                </td>
              </tr>
            )}

            {(() => {
              let running = filterMonth !== "all" ? openingBalance : 0;
              return filteredEntries.map((e, i) => {
                running += e.debit - e.credit;
                return (
                  <tr key={i} className={`table-row ${e.type === "payment" ? "bg-green-50/40" : ""}`}>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {format(new Date(e.date), "d MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{e.label}</td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {e.debit > 0 ? fmt(e.debit) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-green-700 font-medium">
                      {e.credit > 0 ? fmt(e.credit) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${running > 0 ? "text-red-600" : "text-slate-500"}`}>
                      {fmt(running)}
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300">
              <td colSpan={2} className="px-4 py-3 font-semibold text-slate-700">
                {filterMonth !== "all"
                  ? `Total — ${format(new Date(filterMonth + "-01"), "MMMM yyyy")}`
                  : "Total (all time)"}
              </td>
              <td className="px-4 py-3 text-right font-bold text-slate-800">
                {fmt(filterMonth === "all" ? totalInvoiced : periodInvoiced)}
              </td>
              <td className="px-4 py-3 text-right font-bold text-green-700">
                {fmt(filterMonth === "all" ? totalPaid : periodPaid)}
              </td>
              <td className={`px-4 py-3 text-right font-bold text-lg ${outstanding > 0 ? "text-red-600" : "text-green-700"}`}>
                {fmt(outstanding)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
