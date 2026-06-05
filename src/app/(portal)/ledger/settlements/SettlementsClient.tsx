"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Clinic = { id: string; name: string };

type Group = {
  method: string;
  methodLabel: string;
  bankId: string | null;
  bankName: string | null;
  expectedAmount: number;
  settledActual: number;
  pendingAmount: number;
  expectedCount: number;
  settledCount: number;
  pendingCount: number;
  variance: number;
};

type SettlementData = {
  month: string;
  clinicId: string | null;
  groups: Group[];
  totals: { expectedAmount: number; settledActual: number; pendingAmount: number; variance: number };
};

type Bank = { id: string; name: string; settlementDays: number; isActive: boolean };

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

export function SettlementsClient({
  clinics,
  initialMonth,
  initialClinicId,
  canEditConfig,
}: {
  clinics: Clinic[];
  initialMonth: string;
  initialClinicId: string;
  canEditConfig: boolean;
}) {
  const [month,    setMonth]    = useState(initialMonth);
  const [clinicId, setClinicId] = useState(initialClinicId);
  const [data,     setData]     = useState<SettlementData | null>(null);
  const [loading,  setLoading]  = useState(true);

  // Mark-settled modal
  const [settleGroup, setSettleGroup] = useState<Group | null>(null);
  const [settleDate,  setSettleDate]  = useState(new Date().toISOString().slice(0, 10));
  const [settleAmt,   setSettleAmt]   = useState("");
  const [saving,      setSaving]      = useState(false);

  // Banks manager
  const [showBanks, setShowBanks] = useState(false);
  const [banks,     setBanks]     = useState<Bank[]>([]);
  const [draft,     setDraft]     = useState<Record<string, { name: string; days: string }>>({});
  const [newName,   setNewName]   = useState("");
  const [newDays,   setNewDays]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ month, ...(clinicId ? { clinicId } : {}) });
    const res = await fetch(`/api/ledger/settlements?${qs}`);
    setData(res.ok ? await res.json() : null);
    setLoading(false);
  }, [month, clinicId]);

  useEffect(() => { load(); }, [load]);

  async function loadBanks() {
    const res = await fetch("/api/admin/settlement-banks");
    const rows: Bank[] = res.ok ? await res.json() : [];
    setBanks(rows);
    const d: Record<string, { name: string; days: string }> = {};
    for (const b of rows) d[b.id] = { name: b.name, days: String(b.settlementDays) };
    setDraft(d);
  }

  async function saveBank(id: string) {
    const e = draft[id];
    if (!e) return;
    await fetch(`/api/admin/settlement-banks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: e.name, settlementDays: Number(e.days || 0) }),
    });
    await loadBanks();
  }

  async function toggleBank(b: Bank) {
    await fetch(`/api/admin/settlement-banks/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !b.isActive }),
    });
    await loadBanks();
  }

  async function addBank() {
    if (!newName.trim()) return;
    await fetch("/api/admin/settlement-banks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), settlementDays: Number(newDays || 0) }),
    });
    setNewName(""); setNewDays("");
    await loadBanks();
  }

  async function handleSettle(e: React.FormEvent) {
    e.preventDefault();
    if (!settleGroup || !clinicId) return;
    setSaving(true);
    await fetch("/api/ledger/settlements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinicId,
        month,
        method: settleGroup.method,
        bankId: settleGroup.bankId,
        settledDate: settleDate,
        ...(settleAmt ? { actualAmount: parseFloat(settleAmt) } : {}),
      }),
    });
    setSaving(false);
    setSettleGroup(null);
    setSettleAmt("");
    await load();
  }

  const totals = data?.totals;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="mb-1">
            <Link href="/ledger" className="text-sm text-slate-500 hover:text-slate-700">← Collection Ledger</Link>
          </div>
          <h1 className="page-title">Settlement Tracking</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Money expected vs. actually received — by payment method &amp; bank — {month}
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
            <label className="block text-xs text-slate-500 mb-1">Settlement Month</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="form-input w-auto" />
          </div>
          {canEditConfig && (
            <button onClick={() => { setShowBanks(s => { if (!s) loadBanks(); return !s; }); }} className="btn-outline">
              {showBanks ? "Hide Banks" : "Manage Banks"}
            </button>
          )}
        </div>
      </div>

      {/* Banks manager */}
      {showBanks && canEditConfig && (
        <div className="card p-5 mb-6 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Banks &amp; Acquirers</h2>
          <p className="text-xs text-slate-500 mb-4">
            Each bank&apos;s settlement delay (days until the money reaches your account). Picked per payment; drives the expected settlement date.
          </p>
          <div className="space-y-2 mb-4">
            {banks.map(b => (
              <div key={b.id} className={`flex items-center gap-2 bg-white border border-slate-200 rounded-md px-3 py-2 ${!b.isActive ? "opacity-50" : ""}`}>
                <input
                  className="form-input flex-1 text-sm"
                  value={draft[b.id]?.name ?? ""}
                  onChange={e => setDraft(d => ({ ...d, [b.id]: { ...d[b.id], name: e.target.value } }))}
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400">T+</span>
                  <input
                    type="number" min="0" className="form-input w-16 text-sm"
                    value={draft[b.id]?.days ?? ""}
                    onChange={e => setDraft(d => ({ ...d, [b.id]: { ...d[b.id], days: e.target.value } }))}
                  />
                  <span className="text-xs text-slate-400">days</span>
                </div>
                <button onClick={() => saveBank(b.id)} className="text-xs text-blue-600 hover:underline">Save</button>
                <button onClick={() => toggleBank(b)} className="text-xs text-slate-500 hover:underline">
                  {b.isActive ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-2 border-t border-slate-200 pt-3">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">New bank / acquirer</label>
              <input className="form-input w-full text-sm" placeholder="e.g. Hong Leong Bank" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Days (T+)</label>
              <input type="number" min="0" className="form-input w-20 text-sm" value={newDays} onChange={e => setNewDays(e.target.value)} />
            </div>
            <button onClick={addBank} className="btn-primary text-sm">Add</button>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Expected</p>
          <p className="text-xl font-semibold text-slate-900 mt-1">{fmt(totals?.expectedAmount ?? 0)}</p>
          <p className="text-xs text-slate-400 mt-1">All methods, this month</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Settled</p>
          <p className="text-xl font-semibold text-green-700 mt-1">{fmt(totals?.settledActual ?? 0)}</p>
          <p className="text-xs text-slate-400 mt-1">Actually received</p>
        </div>
        <div className={`stat-card ${(totals?.pendingAmount ?? 0) > 0 ? "border-amber-300 bg-amber-50" : ""}`}>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Pending</p>
          <p className={`text-xl font-semibold mt-1 ${(totals?.pendingAmount ?? 0) > 0 ? "text-amber-700" : "text-slate-400"}`}>
            {fmt(totals?.pendingAmount ?? 0)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Awaiting settlement</p>
        </div>
        <div className={`stat-card ${(totals?.variance ?? 0) !== 0 ? "border-red-200" : ""}`}>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Variance</p>
          <p className={`text-xl font-semibold mt-1 ${
            (totals?.variance ?? 0) < 0 ? "text-red-600" : (totals?.variance ?? 0) > 0 ? "text-amber-600" : "text-slate-400"
          }`}>
            {fmt(totals?.variance ?? 0)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Settled − expected</p>
        </div>
      </div>

      {/* Group table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">By Method &amp; Bank</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Method", "Bank", "Expected", "Settled", "Pending", "Variance", "Status", ""].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">Loading…</td></tr>
              )}
              {!loading && (!data || data.groups.length === 0) && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">No payments expected to settle in {month}</td></tr>
              )}
              {!loading && data?.groups.map(g => {
                const fullySettled = g.pendingCount === 0;
                return (
                  <tr key={`${g.method}|${g.bankId ?? "none"}`} className="table-row">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{g.methodLabel}</td>
                    <td className="px-4 py-2.5 text-slate-600">{g.bankName ?? <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{fmt(g.expectedAmount)}</td>
                    <td className="px-4 py-2.5 font-mono text-green-700">{fmt(g.settledActual)}</td>
                    <td className="px-4 py-2.5 font-mono text-amber-700">{g.pendingAmount > 0 ? fmt(g.pendingAmount) : "—"}</td>
                    <td className={`px-4 py-2.5 font-mono font-medium ${
                      g.variance < 0 ? "text-red-600" : g.variance > 0 ? "text-amber-600" : "text-slate-400"
                    }`}>
                      {g.variance === 0 ? "—" : fmt(g.variance)}
                    </td>
                    <td className="px-4 py-2.5">
                      {fullySettled
                        ? <span className="badge-green">Settled</span>
                        : <span className="badge-amber">{g.pendingCount} pending</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {!fullySettled && clinicId && (
                        <button
                          onClick={() => { setSettleGroup(g); setSettleAmt(String(g.pendingAmount)); setSettleDate(new Date().toISOString().slice(0, 10)); }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Mark settled
                        </button>
                      )}
                      {!fullySettled && !clinicId && (
                        <span className="text-xs text-slate-400" title="Select a branch to reconcile">select branch</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mark-settled modal */}
      {settleGroup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-1">
              Mark {settleGroup.methodLabel}{settleGroup.bankName ? ` · ${settleGroup.bankName}` : ""} settled
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              {settleGroup.pendingCount} pending payment{settleGroup.pendingCount !== 1 ? "s" : ""}, expected {fmt(settleGroup.pendingAmount)}.
            </p>
            <form onSubmit={handleSettle} className="space-y-3">
              <div>
                <label className="form-label">Settlement Date <span className="text-red-500">*</span></label>
                <input type="date" required className="form-input" value={settleDate} onChange={e => setSettleDate(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Actual Amount Received (MYR)</label>
                <input type="number" step="0.01" min="0" className="form-input" value={settleAmt} onChange={e => setSettleAmt(e.target.value)} />
                {settleAmt && parseFloat(settleAmt) !== settleGroup.pendingAmount && (
                  <p className={`text-xs mt-1 font-medium ${parseFloat(settleAmt) < settleGroup.pendingAmount ? "text-red-600" : "text-amber-600"}`}>
                    Variance: {fmt(parseFloat(settleAmt) - settleGroup.pendingAmount)}
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-1">Leave as-is to settle the full expected amount.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setSettleGroup(null)} className="btn-outline">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Confirm Settled"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
