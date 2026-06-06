"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Clinic        = { id: string; name: string };
type PanelProvider = { id: string; name: string; code: string };

type MethodRow = {
  method: string;
  billed: number; inMonth: number; nextMonths: number;
  confirmed: { amount: number; notes: string | null; by: string | null } | null;
  variance: number | null;
};

type RemittanceItem = {
  id: string; invoicePaymentId: string; allocatedAmount: number; matchType: string;
  invoicePayment: {
    invoice: { invoiceRef: string; visit: { patient: { name: string; patientRef: string } } };
    amount: number;
  };
};

type Remittance = {
  id: string; panelProviderId: string; remittanceRef: string | null;
  receivedDate: string; totalAmount: number; notes: string | null;
  panelProvider: { id: string; name: string };
  items: RemittanceItem[];
};

type PanelLine = {
  id: string; invoiceId: string; invoiceRef: string; visitDate: string;
  patientName: string; patientRef: string;
  provider: { id: string; name: string } | null;
  amount: number; allocated: number; unallocated: number;
  status: "MATCHED" | "PARTIAL" | "UNMATCHED";
};

type InvoiceLine = {
  id: string; invoiceRef: string; patientName: string; patientRef: string;
  payments: { method: string; amount: number; provider: string | null; panelStatus: string }[];
};

type DayRow = {
  date: string; invoiceCount: number; billed: number; cashCard: number; panel: number;
  panelStatus: "MATCHED" | "PARTIAL" | "UNMATCHED" | null;
  invoices: InvoiceLine[];
};

type ReconData = {
  recon: { id: string; clinicId: string; month: string; status: string; lockedAt: string | null; notes: string | null };
  summary: { totalBilled: number; settledInMonth: number; settledNextMonths: number; panelMatched: number; panelOutstanding: number };
  methodSettlement: MethodRow[];
  remittances: Remittance[];
  panelSummary: PanelLine[];
  dailyRows: DayRow[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-MY", { dateStyle: "medium" });
}
function methodLabel(m: string) {
  const map: Record<string, string> = {
    CASH_CURRENT: "Cash (Same Day)", CASH_NEXT: "Cash (Next Day)",
    CREDIT_CARD: "Credit Card", FPX: "FPX", EWALLET: "E-Wallet", ATOME: "Atome",
  };
  return map[m] ?? m;
}

const STATUS_BADGE: Record<string, string> = {
  MATCHED:   "badge-green",
  PARTIAL:   "badge-amber",
  UNMATCHED: "badge-red",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ReconClient({ clinics, panelProviders: initialProviders, initialClinicId, initialMonth, role }: {
  clinics: Clinic[];
  panelProviders: PanelProvider[];
  initialClinicId: string;
  initialMonth: string;
  role: string;
}) {
  const [clinicId,       setClinicId]       = useState(initialClinicId);
  const [month,          setMonth]          = useState(initialMonth);
  const [data,           setData]           = useState<ReconData | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState("");

  // Track A: editing
  const [methodDraft,    setMethodDraft]    = useState<Record<string, string>>({});
  const [savingMethods,  setSavingMethods]  = useState(false);

  // Track B: new remittance form
  const [showRemForm,    setShowRemForm]    = useState(false);
  const [remProvider,    setRemProvider]    = useState("");
  const [remRef,         setRemRef]         = useState("");
  const [remDate,        setRemDate]        = useState(new Date().toISOString().slice(0, 10));
  const [remAmount,      setRemAmount]      = useState("");
  const [remNotes,       setRemNotes]       = useState("");
  const [savingRem,      setSavingRem]      = useState(false);

  // Panel detail expanded remittance
  const [expandedRemId,  setExpandedRemId]  = useState<string | null>(null);

  // Manual match modal
  const [matchModal,     setMatchModal]     = useState<{ remId: string; providerName: string } | null>(null);
  const [matchPaymentId, setMatchPaymentId] = useState("");
  const [matchAmount,    setMatchAmount]    = useState("");
  const [savingMatch,    setSavingMatch]    = useState(false);

  // Daily listing expanded rows
  const [expandedDays,   setExpandedDays]   = useState<Set<string>>(new Set());

  // Panel providers (may need reload when clinic changes)
  const [panelProviders, setPanelProviders] = useState<PanelProvider[]>(initialProviders);

  const canLock    = ["SUPER_ADMIN", "FINANCE"].includes(role);
  const isLocked   = data?.recon.status === "LOCKED";

  // ── Load providers when clinic changes ──────────────────────────────────
  useEffect(() => {
    if (!clinicId) return;
    fetch(`/api/admin/panel-providers?clinicId=${clinicId}`)
      .then(r => r.ok ? r.json() : [])
      .then(setPanelProviders)
      .catch(() => {});
  }, [clinicId]);

  // ── Fetch reconciliation data ────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!clinicId || !month) return;
    setLoading(true); setError("");
    const res = await fetch(`/api/reconciliation?clinicId=${clinicId}&month=${month}`);
    if (res.ok) {
      const d = await res.json();
      setData(d);
      const drafts: Record<string, string> = {};
      for (const m of d.methodSettlement) {
        drafts[m.method] = String(m.confirmed?.amount ?? m.inMonth);
      }
      setMethodDraft(drafts);
    } else {
      setError("Failed to load reconciliation data");
    }
    setLoading(false);
  }, [clinicId, month]);

  useEffect(() => { load(); }, [load]);

  // ── Save method confirmations ────────────────────────────────────────────
  async function saveMethodConfirmations() {
    if (!data) return;
    setSavingMethods(true);
    for (const [method, val] of Object.entries(methodDraft)) {
      await fetch(`/api/reconciliation/${data.recon.id}/method-settlement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, confirmedAmount: parseFloat(val) || 0 }),
      });
    }
    setSavingMethods(false);
    await load();
  }

  // ── Toggle lock ──────────────────────────────────────────────────────────
  async function toggleLock() {
    if (!data) return;
    const action = isLocked ? "Unlock" : "Lock";
    if (!confirm(`${action} ${month}? ${isLocked ? "Finance can edit again." : "Invoice amounts for this month will become read-only."}`)) return;
    await fetch(`/api/reconciliation/${data.recon.id}/lock`, { method: "PATCH" });
    await load();
  }

  // ── Add remittance ────────────────────────────────────────────────────────
  async function addRemittance(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSavingRem(true);
    const res = await fetch(`/api/reconciliation/${data.recon.id}/panel-remittances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        panelProviderId: remProvider,
        remittanceRef:   remRef || undefined,
        receivedDate:    remDate,
        totalAmount:     parseFloat(remAmount),
        notes:           remNotes || undefined,
      }),
    });
    if (res.ok) {
      const newRem = await res.json();
      setShowRemForm(false); setRemProvider(""); setRemRef(""); setRemAmount(""); setRemNotes("");
      // Auto-match immediately
      await fetch(`/api/reconciliation/${data.recon.id}/panel-remittances/${newRem.id}/auto-match`, { method: "POST" });
      await load();
    }
    setSavingRem(false);
  }

  // ── Auto-match a remittance ───────────────────────────────────────────────
  async function autoMatch(remId: string) {
    if (!data) return;
    await fetch(`/api/reconciliation/${data.recon.id}/panel-remittances/${remId}/auto-match`, { method: "POST" });
    await load();
  }

  // ── Manual match ─────────────────────────────────────────────────────────
  async function submitManualMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !matchModal) return;
    setSavingMatch(true);
    await fetch(`/api/reconciliation/${data.recon.id}/panel-remittances/${matchModal.remId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoicePaymentId: matchPaymentId, allocatedAmount: parseFloat(matchAmount) }),
    });
    setSavingMatch(false);
    setMatchModal(null); setMatchPaymentId(""); setMatchAmount("");
    await load();
  }

  // ── Remove match item ─────────────────────────────────────────────────────
  async function removeItem(remId: string, itemId: string) {
    if (!data) return;
    await fetch(`/api/reconciliation/${data.recon.id}/panel-remittances/${remId}/items/${itemId}`, { method: "DELETE" });
    await load();
  }

  // ── Remittance status ─────────────────────────────────────────────────────
  function remStatus(rem: Remittance) {
    const allocated = rem.items.reduce((s, i) => s + i.allocatedAmount, 0);
    if (allocated >= rem.totalAmount) return "MATCHED";
    if (allocated > 0) return "PARTIAL";
    return "UNMATCHED";
  }

  // ── Toggle day expand ─────────────────────────────────────────────────────
  function toggleDay(date: string) {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  }

  // ── Month list (last 12 months) ───────────────────────────────────────────
  const monthOptions: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    monthOptions.push(d.toISOString().slice(0, 7));
  }

  // ── Unmatched panel payments for manual match picker ─────────────────────
  const unmatchedPanel = data?.panelSummary.filter(p => p.status !== "MATCHED") ?? [];

  if (!clinicId) return <p className="text-sm text-slate-500">No clinic selected.</p>;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Monthly Reconciliation</h1>
          <p className="text-sm text-slate-500 mt-0.5">Match collections against sales by month</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select className="form-input w-44" value={clinicId} onChange={e => setClinicId(e.target.value)}>
            {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="form-input w-36" value={month} onChange={e => setMonth(e.target.value)}>
            {monthOptions.map(m => (
              <option key={m} value={m}>{new Date(m + "-01").toLocaleDateString("en-MY", { year: "numeric", month: "long" })}</option>
            ))}
          </select>
          {data && canLock && (
            <button onClick={toggleLock}
              className={isLocked ? "btn-outline text-amber-600 border-amber-300 hover:bg-amber-50" : "btn-outline"}>
              {isLocked ? "🔒 Locked — Unlock" : "Lock Month"}
            </button>
          )}
          {data && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isLocked ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
              {isLocked ? "LOCKED" : "OPEN"}
            </span>
          )}
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

      {loading && <p className="text-sm text-slate-400">Loading…</p>}

      {data && (
        <>
          {/* ── Summary bar ── */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Total Billed",         value: fmt(data.summary.totalBilled),         color: "text-slate-800" },
              { label: "Settled in Month",      value: fmt(data.summary.settledInMonth),      color: "text-green-700" },
              { label: "Settled Next Month(s)", value: fmt(data.summary.settledNextMonths),   color: "text-blue-700" },
              { label: "Panel Matched",         value: fmt(data.summary.panelMatched),        color: "text-green-700" },
              { label: "Panel Outstanding",     value: fmt(data.summary.panelOutstanding),    color: data.summary.panelOutstanding > 0 ? "text-amber-700" : "text-slate-400" },
            ].map(c => (
              <div key={c.label} className="stat-card p-4">
                <p className="text-xs text-slate-500">{c.label}</p>
                <p className={`text-base font-bold mt-1 ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* ── Track A: Bank Settlement ── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Track A — Bank Settlement (Non-Panel)</h2>
              {!isLocked && (
                <button onClick={saveMethodConfirmations} disabled={savingMethods}
                  className="btn-primary text-xs py-1 px-3">
                  {savingMethods ? "Saving…" : "Save Confirmations"}
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  {["Method", "Billed This Month", "Expected Settled in Month", "You Confirm Received", "Variance", "Expected Next Month(s)"].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.methodSettlement.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-6 text-sm text-slate-400 text-center">No non-panel payments in this month.</td></tr>
                )}
                {data.methodSettlement.map(row => {
                  const variance = (parseFloat(methodDraft[row.method] || "0") || 0) - row.inMonth;
                  return (
                    <tr key={row.method} className="table-row">
                      <td className="px-5 py-3 font-medium text-slate-800">{methodLabel(row.method)}</td>
                      <td className="px-5 py-3 font-mono text-slate-600">{fmt(row.billed)}</td>
                      <td className="px-5 py-3 font-mono text-slate-600">{fmt(row.inMonth)}</td>
                      <td className="px-5 py-3">
                        {isLocked ? (
                          <span className="font-mono text-slate-700">{fmt(row.confirmed?.amount ?? row.inMonth)}</span>
                        ) : (
                          <input
                            className="form-input text-sm w-32 font-mono"
                            type="number" step="0.01" min="0"
                            value={methodDraft[row.method] ?? ""}
                            onChange={e => setMethodDraft(d => ({ ...d, [row.method]: e.target.value }))}
                          />
                        )}
                      </td>
                      <td className={`px-5 py-3 font-mono font-semibold ${Math.abs(variance) < 0.01 ? "text-green-600" : variance > 0 ? "text-blue-600" : "text-red-600"}`}>
                        {variance === 0 ? "—" : (variance > 0 ? "+" : "") + fmt(variance)}
                      </td>
                      <td className="px-5 py-3 font-mono text-blue-600">
                        {row.nextMonths > 0 ? fmt(row.nextMonths) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Track B: Panel Matching ── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Track B — Panel Matching</h2>
              {!isLocked && (
                <button onClick={() => setShowRemForm(v => !v)} className="btn-outline text-xs py-1 px-3">
                  {showRemForm ? "Cancel" : "+ Record Remittance"}
                </button>
              )}
            </div>

            {/* New remittance form */}
            {showRemForm && (
              <form onSubmit={addRemittance} className="px-5 py-4 border-b border-slate-200 bg-slate-50 space-y-3">
                <p className="text-xs font-semibold text-slate-600 mb-2">Record Panel Payment Received</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="form-label">Panel Provider</label>
                    <select className="form-input" value={remProvider} onChange={e => setRemProvider(e.target.value)} required>
                      <option value="">Select…</option>
                      {panelProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Date Received</label>
                    <input type="date" className="form-input" value={remDate} onChange={e => setRemDate(e.target.value)} required />
                  </div>
                  <div>
                    <label className="form-label">Amount (MYR)</label>
                    <input type="number" step="0.01" min="0.01" className="form-input" value={remAmount} onChange={e => setRemAmount(e.target.value)} required />
                  </div>
                  <div>
                    <label className="form-label">Reference (optional)</label>
                    <input className="form-input" value={remRef} onChange={e => setRemRef(e.target.value)} placeholder="Bank ref / claim no." />
                  </div>
                </div>
                <div>
                  <label className="form-label">Notes</label>
                  <input className="form-input" value={remNotes} onChange={e => setRemNotes(e.target.value)} placeholder="Optional" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={savingRem} className="btn-primary text-sm">
                    {savingRem ? "Saving…" : "Record & Auto-Match"}
                  </button>
                </div>
              </form>
            )}

            {/* Remittance list */}
            {data.remittances.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">No panel remittances recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.remittances.map(rem => {
                  const status    = remStatus(rem);
                  const allocated = rem.items.reduce((s, i) => s + Number(i.allocatedAmount), 0);
                  const unalloc   = Math.max(0, Number(rem.totalAmount) - allocated);
                  const expanded  = expandedRemId === rem.id;
                  return (
                    <div key={rem.id}>
                      <div className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50">
                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                          <span className="font-medium text-slate-800">{rem.panelProvider.name}</span>
                          <span className="text-slate-500">{fmtDate(rem.receivedDate)}</span>
                          <span className="text-slate-500 text-xs">{rem.remittanceRef ?? "—"}</span>
                          <span className="font-mono text-slate-700">{fmt(Number(rem.totalAmount))}</span>
                          <div className="flex items-center gap-2">
                            <span className={STATUS_BADGE[status] ?? "badge-slate"}>{status}</span>
                            {unalloc > 0 && <span className="text-xs text-amber-600">MYR {unalloc.toFixed(2)} unallocated</span>}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {!isLocked && (
                            <button onClick={() => autoMatch(rem.id)} className="btn-outline text-xs py-1 px-2">Re-match</button>
                          )}
                          {!isLocked && (
                            <button onClick={() => { setMatchModal({ remId: rem.id, providerName: rem.panelProvider.name }); setMatchPaymentId(""); setMatchAmount(""); }}
                              className="btn-outline text-xs py-1 px-2">Manual</button>
                          )}
                          <button onClick={() => setExpandedRemId(expanded ? null : rem.id)}
                            className="btn-outline text-xs py-1 px-2">{expanded ? "▲" : "▼"}</button>
                        </div>
                      </div>
                      {/* Expanded items */}
                      {expanded && (
                        <div className="bg-slate-50 border-t border-slate-100 px-8 py-3">
                          {rem.items.length === 0 ? (
                            <p className="text-xs text-slate-400">No items matched yet.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-slate-500 uppercase tracking-wide border-b border-slate-200">
                                  <th className="py-1.5 text-left pr-4">Invoice</th>
                                  <th className="py-1.5 text-left pr-4">Patient</th>
                                  <th className="py-1.5 text-left pr-4">Invoice Amt</th>
                                  <th className="py-1.5 text-left pr-4">Allocated</th>
                                  <th className="py-1.5 text-left pr-4">Type</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {rem.items.map(item => (
                                  <tr key={item.id}>
                                    <td className="py-1.5 pr-4 font-mono text-blue-600">{item.invoicePayment.invoice.invoiceRef}</td>
                                    <td className="py-1.5 pr-4">{item.invoicePayment.invoice.visit.patient.name}</td>
                                    <td className="py-1.5 pr-4 font-mono">{fmt(Number(item.invoicePayment.amount))}</td>
                                    <td className="py-1.5 pr-4 font-mono text-green-700">{fmt(Number(item.allocatedAmount))}</td>
                                    <td className="py-1.5 pr-4">
                                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${item.matchType === "AUTO" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"}`}>
                                        {item.matchType}
                                      </span>
                                    </td>
                                    <td className="py-1.5">
                                      {!isLocked && (
                                        <button onClick={() => removeItem(rem.id, item.id)}
                                          className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Daily Listing ── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-700">Daily Listing</h2>
            </div>
            {data.dailyRows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">No invoices found for this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    {["Date", "Invoices", "Billed", "Cash / Card", "Panel", "Panel Status", ""].map(h => (
                      <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.dailyRows.map(row => (
                    <>
                      <tr key={row.date} className="table-row cursor-pointer hover:bg-slate-50" onClick={() => toggleDay(row.date)}>
                        <td className="px-5 py-2.5 font-medium text-slate-800">{fmtDate(row.date)}</td>
                        <td className="px-5 py-2.5 text-slate-500">{row.invoiceCount}</td>
                        <td className="px-5 py-2.5 font-mono text-slate-700">{fmt(row.billed)}</td>
                        <td className="px-5 py-2.5 font-mono text-slate-600">{row.cashCard > 0 ? fmt(row.cashCard) : "—"}</td>
                        <td className="px-5 py-2.5 font-mono text-slate-600">{row.panel > 0 ? fmt(row.panel) : "—"}</td>
                        <td className="px-5 py-2.5">
                          {row.panelStatus
                            ? <span className={STATUS_BADGE[row.panelStatus] ?? "badge-slate"}>{row.panelStatus}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-5 py-2.5 text-slate-400 text-xs">{expandedDays.has(row.date) ? "▲" : "▼"}</td>
                      </tr>
                      {expandedDays.has(row.date) && row.invoices.map(inv => (
                        <tr key={inv.id} className="bg-slate-50 border-l-4 border-slate-200">
                          <td className="pl-10 pr-3 py-2 text-xs font-mono text-blue-600">{inv.invoiceRef}</td>
                          <td className="px-3 py-2 text-xs text-slate-600" colSpan={2}>{inv.patientName} <span className="text-slate-400">{inv.patientRef}</span></td>
                          <td className="px-3 py-2 text-xs text-slate-500" colSpan={2}>
                            {inv.payments.filter(p => p.method !== "PANEL").map((p, i) => (
                              <span key={i} className="mr-2">{methodLabel(p.method)}: {fmt(p.amount)}</span>
                            ))}
                          </td>
                          <td className="px-3 py-2 text-xs" colSpan={2}>
                            {inv.payments.filter(p => p.method === "PANEL").map((p, i) => (
                              <span key={i} className="flex items-center gap-1.5">
                                <span className="text-slate-500">{p.provider}: {fmt(p.amount)}</span>
                                {p.panelStatus && <span className={`text-[10px] ${STATUS_BADGE[p.panelStatus] ?? ""}`}>{p.panelStatus}</span>}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                  <tr>
                    <td className="px-5 py-3 text-sm font-semibold text-slate-700">Total</td>
                    <td className="px-5 py-3 text-sm text-slate-500">{data.dailyRows.reduce((s, r) => s + r.invoiceCount, 0)}</td>
                    <td className="px-5 py-3 font-mono font-semibold text-slate-800">{fmt(data.summary.totalBilled)}</td>
                    <td className="px-5 py-3 font-mono font-semibold text-slate-700">{fmt(data.dailyRows.reduce((s, r) => s + r.cashCard, 0))}</td>
                    <td className="px-5 py-3 font-mono font-semibold text-slate-700">{fmt(data.dailyRows.reduce((s, r) => s + r.panel, 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── Manual Match Modal ── */}
      {matchModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-1">Manual Match — {matchModal.providerName}</h2>
            <p className="text-xs text-slate-500 mb-4">Select an unmatched panel invoice payment and enter the allocated amount.</p>
            <form onSubmit={submitManualMatch} className="space-y-3">
              <div>
                <label className="form-label">Invoice Payment</label>
                <select className="form-input" value={matchPaymentId} onChange={e => {
                  setMatchPaymentId(e.target.value);
                  const found = unmatchedPanel.find(p => p.id === e.target.value);
                  if (found) setMatchAmount(String(found.unallocated));
                }} required>
                  <option value="">Select invoice…</option>
                  {unmatchedPanel.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.invoiceRef} — {p.patientName} — {fmt(p.unallocated)} unallocated
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Allocated Amount (MYR)</label>
                <input type="number" step="0.01" min="0.01" className="form-input" value={matchAmount} onChange={e => setMatchAmount(e.target.value)} required />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setMatchModal(null)} className="btn-outline">Cancel</button>
                <button type="submit" disabled={savingMatch} className="btn-primary">{savingMatch ? "Saving…" : "Match"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
