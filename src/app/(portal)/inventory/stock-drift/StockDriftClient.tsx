"use client";

import { useCallback, useEffect, useState } from "react";

type Clinic = { id: string; name: string };

const SEVERITY: Record<string, string> = {
  ERROR:   "bg-red-100 text-red-700",
  WARNING: "bg-amber-100 text-amber-700",
  INFO:    "bg-slate-100 text-slate-600",
};

const CODE_HELP: Record<string, string> = {
  BALANCE_MISMATCH:      "Stock on hand disagrees with the ledger balance.",
  SUM_MISMATCH:          "Opening + in − out does not reconcile to the closing balance.",
  RUNNING_BALANCE_BREAK: "A movement does not continue from its predecessor's balance.",
  MISSING_MOVEMENTS:     "Stock predating the ledger. Expected in Phase 1 until opening balances are posted.",
  DUPLICATE_POSTING_KEY: "The same movement was posted more than once.",
  NEGATIVE_BALANCE:      "A balance went below zero.",
  UNEXPLAINED_CHANGE:    "Stock changed after the last ledger write — a mutation may have bypassed the ledger.",
  AVG_COST_MISMATCH:     "Costing drifted from the ledger.",
  INVALID_DIRECTION:     "Quantities disagree with the movement's direction.",
  DOUBLE_REVERSAL:       "A movement has been reversed more than once.",
};

export function StockDriftClient({ clinics }: { clinics: Clinic[] }) {
  const [clinicId, setClinicId] = useState("");
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/stock-drift${clinicId ? `?clinicId=${clinicId}` : ""}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to run drift detection");
      setReport(d);
    } catch (e: any) {
      setError(e.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => { load(); }, [load]);

  const t = report?.totals;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Stock Ledger — Drift Detection</h1>
          <p className="text-sm text-slate-500 mt-0.5 max-w-2xl">
            Phase 1 acceptance gate. Stock levels are still operated from ClinicStock; the ledger is
            written alongside it. This page reports every way the two can disagree. The ledger becomes
            the reporting source of truth only once this runs clean.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="form-input w-48 text-sm" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            <option value="">All my clinics</option>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={load} disabled={loading} className="btn-primary text-sm">
            {loading ? "Checking…" : "Re-run"}
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

      {report && (
        <>
          <div className={`p-4 rounded-lg border ${report.clean ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            <p className={`font-semibold ${report.clean ? "text-green-800" : "text-red-800"}`}>
              {report.clean
                ? "✓ Ledger reconciles — no errors detected"
                : `✗ ${t.errors} error${t.errors === 1 ? "" : "s"} — the ledger does not reconcile`}
            </p>
            <p className="text-xs text-slate-600 mt-1">
              Checked {t.positions} stock position{t.positions === 1 ? "" : "s"} against {t.movements} ledger
              movement{t.movements === 1 ? "" : "s"} · {t.warnings} warning{t.warnings === 1 ? "" : "s"} · {t.infos} informational
              · generated {new Date(report.generatedAt).toLocaleString("en-MY")}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["Positions", t.positions, "text-slate-800"],
              ["Movements", t.movements, "text-slate-800"],
              ["Errors", t.errors, t.errors ? "text-red-700" : "text-green-700"],
              ["Warnings", t.warnings, t.warnings ? "text-amber-700" : "text-slate-800"],
            ].map(([label, value, cls]) => (
              <div key={label as string} className="card p-4">
                <p className="text-xs uppercase text-slate-500">{label as string}</p>
                <p className={`text-xl font-bold ${cls as string}`}>{value as number}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>{["Severity", "Check", "Clinic", "Item", "Detail", "Expected", "Actual"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {report.findings.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Nothing to report — ClinicStock and the ledger agree.
                  </td></tr>
                )}
                {report.findings.map((f: any, i: number) => (
                  <tr key={i} className="table-row align-top">
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${SEVERITY[f.severity]}`}>{f.severity}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" title={CODE_HELP[f.code]}>{f.code}</td>
                    <td className="px-4 py-3 text-slate-600">{f.clinicName ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{f.itemName ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{f.detail}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{f.expected ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-800">{f.actual ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
