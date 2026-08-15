"use client";

import { useCallback, useEffect, useState } from "react";
import { assessSchedule } from "@/lib/stock-drift-run";

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
  BATCH_OVER_ALLOCATION: "Batches claim more stock than the position holds — a stock-out did not deplete its batch.",
  BATCH_NEGATIVE:        "A batch has been driven below zero.",
  UNBATCHED_STOCK:       "Part of this position has no batch behind it. Expected for stock predating batch tracking.",
  VALUE_MISMATCH:        "Ledger value does not reconcile to stock on hand at the operational average cost.",
};

const fmtDuration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

export function StockDriftClient({ clinics }: { clinics: Clinic[] }) {
  const [clinicId, setClinicId] = useState("");
  const [report, setReport] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [scopedRuns, setScopedRuns] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [reportRes, runsRes] = await Promise.all([
        fetch(`/api/admin/stock-drift${clinicId ? `?clinicId=${clinicId}` : ""}`),
        fetch("/api/admin/stock-drift/runs?limit=14"),
      ]);
      const d = await reportRes.json();
      if (!reportRes.ok) throw new Error(d.error ?? "Failed to run drift detection");
      setReport(d);
      if (runsRes.ok) {
        const r = await runsRes.json();
        setRuns(r.runs ?? []);
        setScopedRuns(!!r.scoped);
      }
    } catch (e: any) {
      setError(e.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => { load(); }, [load]);

  const lastRun = runs[0];
  // Health of the schedule itself — a check that never fires must not read as
  // success just because it has found no problems.
  const schedule = assessSchedule(lastRun?.startedAt ?? null);

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

      {!loading && schedule.state !== "OK" && (
        <div className="p-4 rounded-lg border bg-amber-50 border-amber-200">
          <p className="font-semibold text-amber-900">
            {schedule.state === "NEVER_RUN"
              ? "⚠ The nightly drift check has never run"
              : `⚠ The nightly drift check has not run for ${Math.floor(schedule.hoursSince ?? 0)} hours`}
          </p>
          <p className="text-xs text-amber-800 mt-1">
            Phase 1 is not being monitored. Check that <code>CRON_SECRET</code> is set, that the
            deployment plan allows the scheduled job, and that <code>/api/cron/stock-drift</code>
            is not returning 401 in the deployment logs. The result below is an on-demand check
            only — it does not mean the schedule is working.
          </p>
        </div>
      )}

      {lastRun && (lastRun.status === "FAILED" || lastRun.errorCount > 0) && (
        <div className="p-4 rounded-lg border bg-red-50 border-red-200">
          <p className="font-semibold text-red-800">
            {lastRun.status === "FAILED"
              ? "⚠ The last scheduled drift check did not complete"
              : `⚠ The last scheduled drift check found ${lastRun.errorCount} error${lastRun.errorCount === 1 ? "" : "s"}`}
          </p>
          <p className="text-xs text-red-700 mt-1">
            {new Date(lastRun.startedAt).toLocaleString("en-MY")}
            {lastRun.errorMessage ? ` — ${lastRun.errorMessage}` : ""}
            {lastRun.alertSentAt ? " · administrators notified" : ""}
          </p>
        </div>
      )}

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

          <div className="card overflow-x-auto">
            <div className="px-4 pt-4">
              <p className="text-sm font-semibold">Scheduled run history</p>
              <p className="text-xs text-slate-500 mt-0.5">
                The nightly check records every run. Informational findings — stock predating the
                ledger — are counted but never fail a run.
                {scopedRuns && " Findings are limited to your clinics."}
              </p>
            </div>
            <table className="w-full text-sm mt-3">
              <thead className="table-header">
                <tr>{["Run", "Trigger", "Outcome", "Errors", "Warnings", "Info", "Duration", "Alerted"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {runs.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No scheduled runs recorded yet. The check runs nightly.
                  </td></tr>
                )}
                {runs.map((r) => (
                  <tr key={r.id} className="table-row">
                    <td className="px-4 py-3">{new Date(r.startedAt).toLocaleString("en-MY")}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.trigger}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        r.status === "FAILED" ? "bg-red-100 text-red-700"
                        : r.errorCount > 0 ? "bg-red-100 text-red-700"
                        : "bg-green-100 text-green-700"}`}>
                        {r.status === "FAILED" ? "FAILED" : r.errorCount > 0 ? "DRIFT" : "CLEAN"}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-medium ${r.errorCount ? "text-red-700" : "text-slate-500"}`}>{r.errorCount}</td>
                    <td className="px-4 py-3 text-slate-600">{r.warningCount}</td>
                    <td className="px-4 py-3 text-slate-400">{r.infoCount ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{fmtDuration(r.durationMs)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{r.alertSentAt ? "Yes" : "—"}</td>
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
