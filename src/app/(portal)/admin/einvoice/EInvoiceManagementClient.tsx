"use client";

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BatchRow {
  id: string;
  batchRef: string;
  clinicName: string;
  panelProviderName: string | null;
  submittedByName: string | null;
  batchType: string;
  month: string;
  totalAmount: number;
  totalSst: number;
  invoiceCount: number;
  status: string;
  myInvoisUUID: string | null;
  submittedAt: string | null;
  createdAt: string;
}

interface ClinicOption {
  id: string;
  name: string;
  entityId: string;
}

interface EntityConfig {
  id: string;
  legalName: string;
  eInvoiceEnabled: boolean;
  hasTin: boolean;
  hasCredentials: boolean;
  environment: string;
  hasSst: boolean;
  effectiveDate: string | null;
}

interface PanelOption {
  id: string;
  name: string;
  clinicId: string;
  code: string;
}

interface InvoiceRow {
  id: string;
  invoiceRef: string;
  clinicName: string;
  eInvoiceStatus: string | null;
  eInvoiceUUID: string | null;
  eInvoiceQrUrl: string | null;
  eInvoiceSubmittedAt: string | null;
  eInvoiceType: string | null;
  total: number;
  createdAt: string;
}

interface Props {
  batches: BatchRow[];
  clinics: ClinicOption[];
  entities: EntityConfig[];
  panelProviders: PanelOption[];
  recentInvoices: InvoiceRow[];
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  NOT_SUBMITTED: "bg-slate-100 text-slate-600",
  PENDING:       "bg-amber-100 text-amber-700",
  SUBMITTED:     "bg-amber-100 text-amber-700",
  VALID:         "bg-green-100 text-green-700",
  INVALID:       "bg-red-100 text-red-700",
  CANCELLED:     "bg-red-100 text-red-600 line-through",
  CONSOLIDATED:  "bg-blue-100 text-blue-700",
  PARTIAL:       "bg-yellow-100 text-yellow-700",
};

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "NOT_SUBMITTED";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s] ?? "bg-slate-100 text-slate-600"}`}>
      {s}
    </span>
  );
}

// ── Consolidated submit modal ─────────────────────────────────────────────────

function SubmitConsolidatedModal({
  clinics,
  panelProviders,
  onClose,
  onSuccess,
}: {
  clinics: ClinicOption[];
  panelProviders: PanelOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [clinicId, setClinicId] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [panelProviderId, setPanelProviderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredPanels = panelProviders.filter(p => !clinicId || p.clinicId === clinicId);

  async function handleSubmit() {
    if (!clinicId || !month) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/einvoice/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId, month, panelProviderId: panelProviderId || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        setError(data.error ?? "Submission failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-slate-900 mb-4">
          Submit Consolidated e-Invoice
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Clinic</label>
            <select
              value={clinicId}
              onChange={e => { setClinicId(e.target.value); setPanelProviderId(""); }}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select clinic...</option>
              {clinics.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Month</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {filteredPanels.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Panel Provider (optional — leave blank for general consolidated)
              </label>
              <select
                value={panelProviderId}
                onChange={e => setPanelProviderId(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None (general public consolidated)</option>
                {filteredPanels.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !clinicId || !month}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main client component ────────────────────────────────────────────────────

export function EInvoiceManagementClient({
  batches: initialBatches,
  clinics,
  entities,
  panelProviders,
  recentInvoices,
}: Props) {
  const [activeTab, setActiveTab] = useState<"individual" | "batches" | "panel" | "settings">(
    "individual"
  );
  const [batches, setBatches] = useState(initialBatches);
  const [showConsolidateModal, setShowConsolidateModal] = useState(false);

  const tabs = [
    { key: "individual" as const, label: "Individual" },
    { key: "batches"    as const, label: "Consolidated Batches" },
    { key: "panel"      as const, label: "Panel Batches" },
    { key: "settings"   as const, label: "Settings Check" },
  ];

  function fmtAmount(n: number) {
    return `RM ${n.toFixed(2)}`;
  }

  function fmtDate(s: string | null) {
    if (!s) return "—";
    return new Date(s).toLocaleDateString("en-MY", {
      day: "2-digit", month: "short", year: "numeric",
    });
  }

  async function refreshBatches() {
    try {
      const res = await fetch("/api/einvoice/batches");
      const data = await res.json();
      setBatches(data);
    } catch {
      // ignore
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">e-Invoice Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">MyInvois (LHDN Malaysia) integration</p>
        </div>
        <button
          onClick={() => setShowConsolidateModal(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Submit Consolidated
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Individual Tab */}
      {activeTab === "individual" && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Invoice Ref</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Clinic</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Type</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Status</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Total</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Submitted</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">UUID</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">QR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No e-invoices submitted yet
                  </td>
                </tr>
              ) : (
                recentInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{inv.invoiceRef}</td>
                    <td className="px-4 py-3 text-slate-600">{inv.clinicName}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{inv.eInvoiceType ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.eInvoiceStatus} /></td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{fmtAmount(inv.total)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(inv.eInvoiceSubmittedAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {inv.eInvoiceUUID
                        ? `${inv.eInvoiceUUID.slice(0, 8)}...`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {inv.eInvoiceQrUrl && (
                        <a
                          href={inv.eInvoiceQrUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Consolidated Batches Tab */}
      {activeTab === "batches" && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Batch Ref</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Clinic</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Month</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Type</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Invoices</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Total</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Submitted</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">UUID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.filter(b => b.batchType !== "PANEL_CONSOLIDATED").length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No consolidated batches yet
                  </td>
                </tr>
              ) : (
                batches
                  .filter(b => b.batchType !== "PANEL_CONSOLIDATED")
                  .map(b => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs">{b.batchRef}</td>
                      <td className="px-4 py-3 text-slate-600">{b.clinicName}</td>
                      <td className="px-4 py-3 text-slate-500">{b.month}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{b.batchType}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{b.invoiceCount}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{fmtAmount(b.totalAmount)}</td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(b.submittedAt)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {b.myInvoisUUID ? `${b.myInvoisUUID.slice(0, 8)}...` : "—"}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Panel Batches Tab */}
      {activeTab === "panel" && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Batch Ref</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Clinic</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Panel Provider</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Month</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Invoices</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Total</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.filter(b => b.batchType === "PANEL_CONSOLIDATED").length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No panel batches yet
                  </td>
                </tr>
              ) : (
                batches
                  .filter(b => b.batchType === "PANEL_CONSOLIDATED")
                  .map(b => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs">{b.batchRef}</td>
                      <td className="px-4 py-3 text-slate-600">{b.clinicName}</td>
                      <td className="px-4 py-3 text-slate-600">{b.panelProviderName ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{b.month}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{b.invoiceCount}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{fmtAmount(b.totalAmount)}</td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(b.submittedAt)}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Settings Check Tab */}
      {activeTab === "settings" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Configuration status per legal entity. Edit via Admin &gt; Companies.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {entities.map(entity => (
              <div
                key={entity.id}
                className="rounded-lg border border-slate-200 bg-white p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-slate-900 text-sm">{entity.legalName}</h3>
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                      entity.environment === "PRODUCTION"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {entity.environment}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <CheckRow ok={entity.eInvoiceEnabled} label="e-Invoice enabled" />
                  <CheckRow ok={entity.hasTin} label="TIN configured" />
                  <CheckRow ok={entity.hasCredentials} label="MyInvois credentials set" />
                  <CheckRow ok={entity.hasSst} label="SST registration number" />
                  <CheckRow
                    ok={!!entity.effectiveDate}
                    label={
                      entity.effectiveDate
                        ? `Effective from ${fmtDate(entity.effectiveDate)}`
                        : "Effective date not set"
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Consolidate Modal */}
      {showConsolidateModal && (
        <SubmitConsolidatedModal
          clinics={clinics}
          panelProviders={panelProviders}
          onClose={() => setShowConsolidateModal(false)}
          onSuccess={() => refreshBatches()}
        />
      )}
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-xs ${ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
        {ok ? "✓" : "✗"}
      </span>
      <span className="text-xs text-slate-600">{label}</span>
    </div>
  );
}
