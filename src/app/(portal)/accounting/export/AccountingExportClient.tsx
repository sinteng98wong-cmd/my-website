"use client";

import { useState, useEffect, useCallback } from "react";
import type { SalesBookRow, CashReceivedRow, AccountingExportSummary } from "@/lib/accounting-export";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

const CURRENT_YEAR  = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

interface Props {
  clinics: { id: string; name: string }[];
  role: string;
}

interface PreviewData {
  salesBook: SalesBookRow[];
  cashReceived: CashReceivedRow[];
  summary: AccountingExportSummary;
  isLocked: boolean;
  monthLock: { lockedAt: string; lockedByName: string } | null;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type TabKey = "sales" | "cash" | "summary" | "settings";

export function AccountingExportClient({ clinics, role }: Props) {
  const [clinicId, setClinicId]   = useState(clinics[0]?.id ?? "");
  const [year, setYear]           = useState(CURRENT_YEAR);
  const [month, setMonth]         = useState(CURRENT_MONTH);
  const [tab, setTab]             = useState<TabKey>("sales");
  const [data, setData]           = useState<PreviewData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [locking, setLocking]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [toast, setToast]         = useState<string | null>(null);

  // Payment method configs
  const [pmConfigs, setPmConfigs]       = useState<any[]>([]);
  const [panelProviders, setPanelProviders] = useState<any[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  const isFinance      = ["SUPER_ADMIN", "FINANCE"].includes(role);
  const canManage      = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);
  const monthStr       = `${year}-${String(month).padStart(2, "0")}`;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const fetchPreview = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounting/preview?clinicId=${clinicId}&year=${year}&month=${month}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [clinicId, year, month]);

  useEffect(() => { fetchPreview(); }, [fetchPreview]);

  useEffect(() => {
    if (!clinicId || tab !== "settings" || !isFinance) return;
    fetch(`/api/admin/payment-method-config?clinicId=${clinicId}`)
      .then((r) => r.json())
      .then(setPmConfigs)
      .catch(() => {});
    fetch(`/api/panel-providers?clinicId=${clinicId}`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d) ? setPanelProviders(d) : setPanelProviders([]))
      .catch(() => setPanelProviders([]));
  }, [clinicId, tab, isFinance]);

  async function handleGenerate() {
    if (!clinicId) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/accounting/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId, year, month }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generate failed");
      showToast(`Generated ${json.generated} ledger entries`);
      await fetchPreview();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload() {
    const url = `/api/accounting/export?clinicId=${clinicId}&year=${year}&month=${month}`;
    window.open(url, "_blank");
  }

  async function handleLockMonth() {
    if (!confirm(`Lock month ${monthStr} for this clinic? This will prevent further edits.`)) return;
    setLocking(true);
    try {
      const res = await fetch("/api/accounting/month/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId, month: monthStr }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Lock failed");
      showToast(`Month locked. ${json.entryCount} entries locked.`);
      await fetchPreview();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLocking(false);
    }
  }

  async function handleUnlockMonth() {
    if (!data?.monthLock) return;
    if (!confirm("Unlock this month? (Super Admin only)")) return;
    // find the lock id — we need to fetch ledger for it
    const res2 = await fetch(`/api/accounting/ledger?clinicId=${clinicId}&month=${monthStr}`);
    // We don't store lock id in preview; unlock via separate approach
    // Just show message for now — full unlock requires the lock id
    setError("To unlock, delete the month lock record from the Accounting Month Lock table (Super Admin only).");
  }

  async function handleShiftEntry(id: string, newTag: "CURRENT" | "DEFERRED") {
    try {
      const res = await fetch(`/api/accounting/ledger/${id}/shift`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: newTag }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Shift failed");
      showToast(`Entry moved to ${newTag}`);
      await fetchPreview();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleLockEntry(id: string) {
    try {
      const res = await fetch(`/api/accounting/ledger/${id}/lock`, {
        method: "PATCH",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Lock failed");
      showToast("Entry locked");
      await fetchPreview();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleSaveConfig(method: string, subType: string | null, chargeRate: string, settlementDays: string) {
    setSavingConfig(true);
    try {
      const res = await fetch("/api/admin/payment-method-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId, method, subType, chargeRate: parseFloat(chargeRate), settlementDays: parseInt(settlementDays) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      showToast("Config saved");
      const updated = await fetch(`/api/admin/payment-method-config?clinicId=${clinicId}`).then((r) => r.json());
      setPmConfigs(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingConfig(false);
    }
  }

  const clinicName = clinics.find((c) => c.id === clinicId)?.name ?? "";
  const monthLabel = `${MONTHS[month - 1]} ${year}`;
  const s         = data?.summary;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Monthly Accounting Export</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Clinic selector */}
          <select
            value={clinicId}
            onChange={(e) => setClinicId(e.target.value)}
            className="form-input text-sm py-1.5"
          >
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Month picker */}
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="form-input text-sm py-1.5"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="form-input text-sm py-1.5"
          >
            {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Actions */}
          <button
            onClick={handleGenerate}
            disabled={generating || data?.isLocked}
            className="btn-outline text-sm py-1.5 disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate Entries"}
          </button>
          <button onClick={handleDownload} className="btn-primary text-sm py-1.5">
            Download Excel
          </button>

          {/* Lock status + button */}
          {data?.isLocked ? (
            <span className="badge-slate text-xs px-2 py-1">
              Locked {data.monthLock?.lockedByName ? `by ${data.monthLock.lockedByName}` : ""}
            </span>
          ) : (
            isFinance && (
              <button
                onClick={handleLockMonth}
                disabled={locking}
                className="text-sm px-3 py-1.5 rounded-md border border-amber-400 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {locking ? "Locking..." : "Lock Month"}
              </button>
            )
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-md flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* Summary cards */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="stat-card">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Sales</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{RM(s.totalSales)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.invoiceCount} invoices</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total SST</p>
            <p className="text-xl font-bold text-blue-700 mt-1">{RM(s.totalSST)}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Cash Current</p>
            <p className="text-xl font-bold text-green-700 mt-1">{RM(s.totalCashCurrent)}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Cash Deferred</p>
            <p className="text-xl font-bold text-amber-700 mt-1">{RM(s.totalCashDeferred)}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Outstanding</p>
            <p className={`text-xl font-bold mt-1 ${s.outstandingBalance > 0 ? "text-red-600" : "text-green-700"}`}>
              {RM(s.outstandingBalance)}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1">
          {(["sales", "cash", "summary", ...(isFinance ? ["settings"] : [])] as TabKey[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "sales" ? "Sales Book" : t === "cash" ? "Cash Received" : t === "summary" ? "Summary" : "Settings"}
            </button>
          ))}
        </nav>
      </div>

      {loading && (
        <div className="py-12 text-center text-slate-400 text-sm">Loading...</div>
      )}

      {!loading && data && (
        <>
          {/* ── Sales Book Tab ── */}
          {tab === "sales" && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-blue-50">
                <h3 className="text-sm font-semibold text-blue-800">Sales Book — {clinicName} — {monthLabel}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="text-left px-4 py-2">Date</th>
                      <th className="text-left px-4 py-2">Invoice No</th>
                      <th className="text-left px-4 py-2">Debtor</th>
                      <th className="text-right px-4 py-2">Prof Fees (RM)</th>
                      <th className="text-right px-4 py-2">SST (RM)</th>
                      <th className="text-right px-4 py-2">Products (RM)</th>
                      <th className="text-right px-4 py-2">Total (RM)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.salesBook.map((r, i) => (
                      <tr key={i} className="table-row">
                        <td className="px-4 py-2 text-slate-600">{r.date}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.invoiceNo}</td>
                        <td className="px-4 py-2">{r.debtor}</td>
                        <td className="px-4 py-2 text-right">{r.profFees.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">{r.sst.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">{r.products.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-medium">{r.total.toFixed(2)}</td>
                      </tr>
                    ))}
                    {data.salesBook.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No invoices for this period</td></tr>
                    )}
                  </tbody>
                  {data.salesBook.length > 0 && s && (
                    <tfoot>
                      <tr className="bg-slate-100 font-semibold text-slate-800">
                        <td colSpan={3} className="px-4 py-2">TOTAL</td>
                        <td className="px-4 py-2 text-right">{s.totalProfFees.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">{s.totalSST.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">{s.totalProducts.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">{s.totalSales.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* ── Cash Received Tab ── */}
          {tab === "cash" && (
            <div className="space-y-4">
              {/* CURRENT */}
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-green-50">
                  <h3 className="text-sm font-semibold text-green-800">Cash Current — Same Month</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="table-header">
                        <th className="text-left px-4 py-2">Ref</th>
                        <th className="text-left px-4 py-2">Debtor</th>
                        <th className="text-left px-4 py-2">Method</th>
                        <th className="text-right px-4 py-2">Gross (RM)</th>
                        <th className="text-right px-4 py-2">SST (RM)</th>
                        <th className="text-right px-4 py-2">Svc Chg (RM)</th>
                        <th className="text-right px-4 py-2">Net (RM)</th>
                        {canManage && <th className="px-4 py-2">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {data.cashReceived.filter((r) => r.tag === "CURRENT").map((r) => (
                        <tr key={r.id} className="table-row">
                          <td className="px-4 py-2 font-mono text-xs">
                            {r.ref}
                            {r.isLocked && <span className="ml-1 text-slate-400">🔒</span>}
                          </td>
                          <td className="px-4 py-2">{r.debtor}</td>
                          <td className="px-4 py-2 text-slate-500">{r.method}</td>
                          <td className="px-4 py-2 text-right">{r.grossAmount.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right">{r.sstAmount.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right text-red-600">{r.serviceCharge.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right font-medium">{r.netReceived.toFixed(2)}</td>
                          {canManage && (
                            <td className="px-4 py-2">
                              <div className="flex gap-1">
                                {!data.isLocked && !r.isLocked && (
                                  <button
                                    onClick={() => handleShiftEntry(r.id, "DEFERRED")}
                                    className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-50"
                                  >
                                    Move to Deferred
                                  </button>
                                )}
                                {isFinance && !r.isLocked && (
                                  <button
                                    onClick={() => handleLockEntry(r.id)}
                                    className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
                                  >
                                    Lock
                                  </button>
                                )}
                                {r.isLocked && r.lockedByName && (
                                  <span className="text-xs text-slate-400">by {r.lockedByName}</span>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {data.cashReceived.filter((r) => r.tag === "CURRENT").length === 0 && (
                        <tr><td colSpan={canManage ? 8 : 7} className="px-4 py-6 text-center text-slate-400">No current entries</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-green-50 font-semibold text-green-900">
                        <td colSpan={6} className="px-4 py-2">SUBTOTAL — CASH CURRENT</td>
                        <td className="px-4 py-2 text-right">{s?.totalCashCurrent.toFixed(2)}</td>
                        {canManage && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* DEFERRED */}
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-amber-50">
                  <h3 className="text-sm font-semibold text-amber-800">Cash Deferred — Prior Month Invoices</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="table-header">
                        <th className="text-left px-4 py-2">Ref</th>
                        <th className="text-left px-4 py-2">Debtor</th>
                        <th className="text-left px-4 py-2">Method</th>
                        <th className="text-left px-4 py-2">Invoice Month</th>
                        <th className="text-right px-4 py-2">Gross (RM)</th>
                        <th className="text-right px-4 py-2">SST (RM)</th>
                        <th className="text-right px-4 py-2">Svc Chg (RM)</th>
                        <th className="text-right px-4 py-2">Net (RM)</th>
                        {canManage && <th className="px-4 py-2">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {data.cashReceived.filter((r) => r.tag === "DEFERRED").map((r) => (
                        <tr key={r.id} className="table-row">
                          <td className="px-4 py-2 font-mono text-xs">
                            {r.ref}
                            {r.isLocked && <span className="ml-1 text-slate-400">🔒</span>}
                          </td>
                          <td className="px-4 py-2">{r.debtor}</td>
                          <td className="px-4 py-2 text-slate-500">{r.method}</td>
                          <td className="px-4 py-2 text-xs text-amber-700">{r.invoiceMonth}</td>
                          <td className="px-4 py-2 text-right">{r.grossAmount.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right">{r.sstAmount.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right text-red-600">{r.serviceCharge.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right font-medium">{r.netReceived.toFixed(2)}</td>
                          {canManage && (
                            <td className="px-4 py-2">
                              <div className="flex gap-1">
                                {!data.isLocked && !r.isLocked && (
                                  <button
                                    onClick={() => handleShiftEntry(r.id, "CURRENT")}
                                    className="text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50"
                                  >
                                    Move to Current
                                  </button>
                                )}
                                {isFinance && !r.isLocked && (
                                  <button
                                    onClick={() => handleLockEntry(r.id)}
                                    className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
                                  >
                                    Lock
                                  </button>
                                )}
                                {r.isLocked && r.lockedByName && (
                                  <span className="text-xs text-slate-400">by {r.lockedByName}</span>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {data.cashReceived.filter((r) => r.tag === "DEFERRED").length === 0 && (
                        <tr><td colSpan={canManage ? 9 : 8} className="px-4 py-6 text-center text-slate-400">No deferred entries</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-amber-50 font-semibold text-amber-900">
                        <td colSpan={7} className="px-4 py-2">SUBTOTAL — CASH DEFERRED</td>
                        <td className="px-4 py-2 text-right">{s?.totalCashDeferred.toFixed(2)}</td>
                        {canManage && <td />}
                      </tr>
                      <tr className="bg-slate-100 font-bold text-slate-900">
                        <td colSpan={7} className="px-4 py-2">TOTAL CASH RECEIVED</td>
                        <td className="px-4 py-2 text-right">{s?.totalCashReceived.toFixed(2)}</td>
                        {canManage && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Service charges summary */}
              {s && s.totalServiceCharges > 0 && (
                <div className="card p-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Service Charges Summary</h4>
                  <div className="space-y-1 text-sm">
                    {s.byMethod.filter((m) => m.serviceCharge > 0).map((m) => (
                      <div key={m.method} className="flex justify-between">
                        <span className="text-slate-600">{m.method}</span>
                        <span className="text-red-600">- {RM(m.serviceCharge)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-semibold border-t border-slate-200 pt-1 mt-1">
                      <span>Total Service Charges</span>
                      <span className="text-red-600">- {RM(s.totalServiceCharges)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Summary Tab ── */}
          {tab === "summary" && s && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sales */}
              <div className="card p-4 space-y-2">
                <h3 className="font-semibold text-slate-800 text-sm border-b pb-2">Sales</h3>
                <Row label="Professional Fees" value={RM(s.totalProfFees)} />
                <Row label="SST" value={RM(s.totalSST)} />
                <Row label="Products" value={RM(s.totalProducts)} />
                <div className="border-t pt-2">
                  <Row label="Total Sales" value={RM(s.totalSales)} bold />
                  <Row label="Total Invoices" value={s.invoiceCount.toString()} />
                </div>
              </div>

              {/* Cash Received */}
              <div className="card p-4 space-y-2">
                <h3 className="font-semibold text-slate-800 text-sm border-b pb-2">Cash Received</h3>
                <Row label="Cash Current" value={RM(s.totalCashCurrent)} />
                <Row label="Cash Deferred" value={RM(s.totalCashDeferred)} />
                <Row label="Service Charges Deducted" value={`- ${RM(s.totalServiceCharges)}`} red />
                <div className="border-t pt-2">
                  <Row label="Total Cash Received" value={RM(s.totalCashReceived)} bold />
                </div>
              </div>

              {/* Reconciliation */}
              <div className="card p-4 space-y-2">
                <h3 className="font-semibold text-slate-800 text-sm border-b pb-2">Reconciliation</h3>
                <Row label="Total Sales" value={RM(s.totalSales)} />
                <Row label="Less: Total Cash Received" value={`- ${RM(s.totalCashReceived)}`} red />
                <div className="border-t pt-2">
                  <Row
                    label="Outstanding Balance"
                    value={RM(s.outstandingBalance)}
                    bold
                    red={s.outstandingBalance > 0}
                  />
                </div>
              </div>

              {/* By Method */}
              <div className="card p-4">
                <h3 className="font-semibold text-slate-800 text-sm border-b pb-2 mb-2">By Payment Method</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 uppercase">
                      <th className="text-left pb-1">Method</th>
                      <th className="text-right pb-1">Gross</th>
                      <th className="text-right pb-1">Svc Chg</th>
                      <th className="text-right pb-1">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.byMethod.map((m) => (
                      <tr key={m.method} className="border-t border-slate-100">
                        <td className="py-1 text-slate-700">{m.method}</td>
                        <td className="py-1 text-right">{RM(m.grossAmount)}</td>
                        <td className="py-1 text-right text-red-500">- {RM(m.serviceCharge)}</td>
                        <td className="py-1 text-right font-medium">{RM(m.netReceived)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Settings Tab ── */}
          {tab === "settings" && isFinance && (
            <div className="space-y-4">
              <div className="card p-4">
                <h3 className="font-semibold text-slate-800 mb-3">Payment Method Charge Rates</h3>
                <p className="text-xs text-slate-500 mb-4">Configure the service charge rate (%) and settlement days for each payment method. These rates are used when generating ledger entries.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="table-header">
                        <th className="text-left px-3 py-2">Method</th>
                        <th className="text-left px-3 py-2">Sub-Type</th>
                        <th className="text-right px-3 py-2">Charge Rate (%)</th>
                        <th className="text-right px-3 py-2">Settlement Days</th>
                        <th className="px-3 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { method: "CREDIT_CARD", subType: "VISA_MC", label: "Credit Card (Visa/MC)" },
                        { method: "CREDIT_CARD", subType: "AMEX",    label: "Credit Card (Amex)" },
                        { method: "FPX",         subType: null,       label: "FPX" },
                        { method: "EWALLET",     subType: null,       label: "eWallet" },
                        { method: "ATOME",       subType: null,       label: "Atome" },
                        { method: "CASH_CURRENT",subType: null,       label: "Cash" },
                        { method: "DEPOSIT",     subType: null,       label: "Deposit" },
                      ].map(({ method, subType, label }) => {
                        const cfg = pmConfigs.find(
                          (c: any) => c.method === method && (subType ? c.subType === subType : !c.subType)
                        );
                        return (
                          <ConfigRow
                            key={`${method}-${subType}`}
                            label={label}
                            method={method}
                            subType={subType}
                            existingRate={cfg ? Number(cfg.chargeRate) : 0}
                            existingDays={cfg ? Number(cfg.settlementDays) : 0}
                            onSave={handleSaveConfig}
                            saving={savingConfig}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {panelProviders.length > 0 && (
                <div className="card p-4">
                  <h3 className="font-semibold text-slate-800 mb-2">Panel Provider Rates</h3>
                  <p className="text-xs text-slate-500 mb-3">Panel provider service charge rates are configured on each panel provider record.</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="table-header">
                        <th className="text-left px-3 py-2">Panel Provider</th>
                        <th className="text-left px-3 py-2">Code</th>
                        <th className="text-right px-3 py-2">Svc Charge Rate (%)</th>
                        <th className="text-left px-3 py-2">SST Applicable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {panelProviders.map((p: any) => (
                        <tr key={p.id} className="table-row">
                          <td className="px-3 py-2">{p.name}</td>
                          <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                          <td className="px-3 py-2 text-right">{Number(p.serviceChargeRate).toFixed(2)}</td>
                          <td className="px-3 py-2">{p.isSstApplicable ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!loading && !data && !error && (
        <div className="py-16 text-center text-slate-400 text-sm">
          Select a clinic and period to preview the accounting export.
        </div>
      )}
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function Row({ label, value, bold, red }: { label: string; value: string; bold?: boolean; red?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={`text-slate-600 ${bold ? "font-semibold text-slate-800" : ""}`}>{label}</span>
      <span className={`${bold ? "font-bold text-slate-900" : ""} ${red ? "text-red-600" : ""}`}>{value}</span>
    </div>
  );
}

function ConfigRow({
  label, method, subType, existingRate, existingDays, onSave, saving,
}: {
  label: string;
  method: string;
  subType: string | null;
  existingRate: number;
  existingDays: number;
  onSave: (method: string, subType: string | null, rate: string, days: string) => void;
  saving: boolean;
}) {
  const [rate, setRate] = useState(existingRate.toFixed(2));
  const [days, setDays] = useState(existingDays.toString());

  return (
    <tr className="table-row">
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 text-slate-400 text-xs">{subType ?? "—"}</td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          step="0.01"
          min="0"
          max="100"
          className="form-input text-sm py-1 text-right w-24 ml-auto block"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          step="1"
          min="0"
          className="form-input text-sm py-1 text-right w-20 ml-auto block"
        />
      </td>
      <td className="px-3 py-2">
        <button
          onClick={() => onSave(method, subType, rate, days)}
          disabled={saving}
          className="btn-outline text-xs py-1 px-2 disabled:opacity-50"
        >
          Save
        </button>
      </td>
    </tr>
  );
}
