"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Clinic = { id: string; name: string };
type LedgerDay = { date: string; clinicId: string; clinicName: string; cashCurrent: number };
type BankRecord = {
  id: string; clinicId: string; clinicName: string;
  periodFrom: string; periodTo: string;
  expectedCash: number; bankInAmount: number; variance: number;
  bankInDate: string; referenceNo?: string; bankName?: string; notes?: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

export function CashBankingClient({
  clinics,
  ledgerDays,
  bankRecords: initialRecords,
  month,
  clinicId,
}: {
  clinics: Clinic[];
  ledgerDays: LedgerDay[];
  bankRecords: BankRecord[];
  month: string;
  clinicId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [records, setRecords] = useState<BankRecord[]>(initialRecords);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    clinicId,
    periodFrom: "",
    periodTo:   "",
    bankInDate: today,
    referenceNo: "",
    bankName:   "",
    notes:      "",
    bankInAmount: "",
  });

  // Derive expectedCash from selected period + clinic
  const expectedCash = (() => {
    if (!form.periodFrom || !form.periodTo || !form.clinicId) return 0;
    return ledgerDays
      .filter(d =>
        d.clinicId === form.clinicId &&
        d.date >= form.periodFrom &&
        d.date <= form.periodTo
      )
      .reduce((s, d) => s + d.cashCurrent, 0);
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ledger/cash-banking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicId:     form.clinicId,
          periodFrom:   form.periodFrom,
          periodTo:     form.periodTo,
          expectedCash,
          bankInAmount: parseFloat(form.bankInAmount) || 0,
          bankInDate:   form.bankInDate,
          referenceNo:  form.referenceNo || undefined,
          bankName:     form.bankName    || undefined,
          notes:        form.notes       || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
        return;
      }
      const created = await res.json();
      const cName = clinics.find(c => c.id === created.clinicId)?.name ?? "";
      setRecords(prev => [{
        ...created,
        clinicName:  cName,
        periodFrom:  created.periodFrom.slice(0, 10),
        periodTo:    created.periodTo.slice(0, 10),
        bankInDate:  created.bankInDate.slice(0, 10),
        expectedCash: Number(created.expectedCash),
        bankInAmount: Number(created.bankInAmount),
        variance:     Number(created.variance),
      }, ...prev]);
      setShowForm(false);
      setForm({ clinicId, periodFrom: "", periodTo: "", bankInDate: today, referenceNo: "", bankName: "", notes: "", bankInAmount: "" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this banking record?")) return;
    setDeleting(id);
    await fetch(`/api/ledger/cash-banking?id=${id}`, { method: "DELETE" });
    setRecords(prev => prev.filter(r => r.id !== id));
    setDeleting(null);
  }

  // Summary
  const totalExpected = ledgerDays
    .filter(d => !clinicId || d.clinicId === clinicId)
    .reduce((s, d) => s + d.cashCurrent, 0);
  const totalBanked   = records.reduce((s, r) => s + r.bankInAmount, 0);
  const totalPending  = Math.max(0, totalExpected - totalBanked);

  // Mark which ledger days are covered by a bank record
  const coveredDates = new Set<string>();
  for (const r of records) {
    for (const d of ledgerDays) {
      if (d.clinicId === r.clinicId && d.date >= r.periodFrom && d.date <= r.periodTo) {
        coveredDates.add(`${d.clinicId}:${d.date}`);
      }
    }
  }

  return (
    <div>
      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Expected Cash</p>
          <p className="text-xl font-semibold text-slate-900 mt-1">{fmt(totalExpected)}</p>
          <p className="text-xs text-slate-400 mt-1">From daily ledger cash entries</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Banked In</p>
          <p className="text-xl font-semibold text-green-700 mt-1">{fmt(totalBanked)}</p>
          <p className="text-xs text-slate-400 mt-1">{records.length} banking record{records.length !== 1 ? "s" : ""}</p>
        </div>
        <div className={`stat-card ${totalPending > 0 ? "border-amber-300 bg-amber-50" : ""}`}>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Pending Bank-In</p>
          <p className={`text-xl font-semibold mt-1 ${totalPending > 0 ? "text-amber-700" : "text-slate-400"}`}>
            {fmt(totalPending)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Cash not yet banked</p>
        </div>
      </div>

      {/* Daily Cash Position Table */}
      <div className="card mb-6">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Daily Cash Position — {month}</h2>
          <button
            onClick={() => setShowForm(f => !f)}
            className="btn-primary text-sm"
          >
            {showForm ? "Cancel" : "+ Record Bank-In"}
          </button>
        </div>

        {/* Record Bank-In Form */}
        {showForm && (
          <div className="px-5 py-5 border-b border-slate-200 bg-blue-50">
            <h3 className="text-sm font-semibold text-blue-900 mb-4">New Bank-In Record</h3>
            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{error}</div>
            )}
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Branch</label>
                <select
                  className="form-input"
                  value={form.clinicId}
                  onChange={e => setForm(f => ({ ...f, clinicId: e.target.value }))}
                  required
                >
                  <option value="">Select branch…</option>
                  {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="form-label">Period From</label>
                  <input
                    type="date" className="form-input" required
                    value={form.periodFrom}
                    onChange={e => setForm(f => ({ ...f, periodFrom: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label">Period To</label>
                  <input
                    type="date" className="form-input" required
                    value={form.periodTo}
                    min={form.periodFrom}
                    onChange={e => setForm(f => ({ ...f, periodTo: e.target.value }))}
                  />
                </div>
              </div>

              {/* Expected cash preview */}
              {expectedCash > 0 && (
                <div className="col-span-2">
                  <div className="flex items-center gap-2 p-3 bg-white border border-blue-200 rounded-md text-sm">
                    <span className="text-slate-600">Expected cash for this period:</span>
                    <span className="font-semibold text-slate-900">{fmt(expectedCash)}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="form-label">Actual Bank-In Amount (MYR)</label>
                <input
                  type="number" step="0.01" min="0" className="form-input" required
                  placeholder="0.00"
                  value={form.bankInAmount}
                  onChange={e => setForm(f => ({ ...f, bankInAmount: e.target.value }))}
                />
                {form.bankInAmount && expectedCash > 0 && (
                  <p className={`text-xs mt-1 font-medium ${
                    parseFloat(form.bankInAmount) < expectedCash ? "text-red-600" :
                    parseFloat(form.bankInAmount) > expectedCash ? "text-amber-600" : "text-green-600"
                  }`}>
                    Variance: {fmt(parseFloat(form.bankInAmount) - expectedCash)}
                    {parseFloat(form.bankInAmount) < expectedCash ? " (shortage)" :
                     parseFloat(form.bankInAmount) > expectedCash ? " (excess)" : " (exact match)"}
                  </p>
                )}
              </div>

              <div>
                <label className="form-label">Bank-In Date</label>
                <input
                  type="date" className="form-input" required
                  value={form.bankInDate}
                  onChange={e => setForm(f => ({ ...f, bankInDate: e.target.value }))}
                />
              </div>

              <div>
                <label className="form-label">Bank Deposit Slip / Reference No.</label>
                <input
                  type="text" className="form-input" placeholder="e.g. DEP-2026-001"
                  value={form.referenceNo}
                  onChange={e => setForm(f => ({ ...f, referenceNo: e.target.value }))}
                />
              </div>

              <div>
                <label className="form-label">Bank Name</label>
                <input
                  type="text" className="form-input" placeholder="e.g. Maybank, CIMB"
                  value={form.bankName}
                  onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                />
              </div>

              <div className="col-span-2">
                <label className="form-label">Notes</label>
                <input
                  type="text" className="form-input" placeholder="Optional remarks"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div className="col-span-2 flex gap-3">
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? "Saving…" : "Save Bank-In Record"}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-outline">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Daily rows */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Date","Branch","Cash","Cash (Next Day)","Total Cash","Status"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledgerDays.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">No ledger entries for {month}</td></tr>
              )}
              {ledgerDays.map(d => {
                const banked = coveredDates.has(`${d.clinicId}:${d.date}`);
                return (
                  <tr key={`${d.clinicId}:${d.date}`} className={`table-row ${banked ? "bg-green-50" : ""}`}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                      {new Date(d.date).toLocaleDateString("en-MY", { weekday: "short", day: "2-digit", month: "short" })}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{d.clinicName}</td>
                    <td className="px-4 py-2.5 font-mono text-green-700">{fmt(d.cashCurrent)}</td>
                    <td className="px-4 py-2.5 font-mono text-green-500">{d.cashCurrent > 0 ? "—" : "—"}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">{fmt(d.cashCurrent)}</td>
                    <td className="px-4 py-2.5">
                      {banked
                        ? <span className="badge-green">Banked</span>
                        : <span className="badge-amber">Pending</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Banking Records */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Banking Records — {month}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Period Covered","Branch","Expected","Banked In","Variance","Bank-In Date","Ref No.","Bank","Notes",""].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr><td colSpan={10} className="px-5 py-8 text-center text-slate-400">No banking records yet</td></tr>
              )}
              {records.map(r => (
                <tr key={r.id} className="table-row">
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                    {r.periodFrom === r.periodTo
                      ? fmtDate(r.periodFrom)
                      : `${fmtDate(r.periodFrom)} – ${fmtDate(r.periodTo)}`}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{r.clinicName}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-700">{fmt(r.expectedCash)}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-green-700">{fmt(r.bankInAmount)}</td>
                  <td className={`px-4 py-2.5 font-mono font-medium ${
                    r.variance < 0 ? "text-red-600" : r.variance > 0 ? "text-amber-600" : "text-slate-400"
                  }`}>
                    {r.variance === 0 ? "—" : fmt(r.variance)}
                    {r.variance < 0 ? " ▼" : r.variance > 0 ? " ▲" : ""}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">{fmtDate(r.bankInDate)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{r.referenceNo ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.bankName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs max-w-xs truncate">{r.notes ?? ""}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={deleting === r.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                    >
                      {deleting === r.id ? "…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
