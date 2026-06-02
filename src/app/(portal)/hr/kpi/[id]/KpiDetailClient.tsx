"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SCORE_COLOR = (s: number) => s < 50 ? "bg-red-500" : s < 75 ? "bg-amber-500" : s < 90 ? "bg-blue-500" : "bg-green-500";

export function KpiDetailClient({ id, isManager }: { id: string; isManager: boolean }) {
  const router = useRouter();
  const [kpi, setKpi] = useState<any>(null);
  const [editActuals, setEditActuals] = useState<Record<string, string>>({});
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [autoMsg, setAutoMsg] = useState("");

  async function load() {
    const d = await fetch(`/api/hr/kpi/${id}`).then((r) => r.json());
    setKpi(d);
    const actuals: Record<string, string> = {};
    const notes: Record<string, string> = {};
    for (const r of d.results ?? []) {
      actuals[r.metricId] = r.actual != null ? String(r.actual) : "";
      notes[r.metricId] = r.notes ?? "";
    }
    setEditActuals(actuals);
    setEditNotes(notes);
  }
  useEffect(() => { load(); }, [id]);

  async function saveResults() {
    setBusy(true); setError("");
    const updates = Object.entries(editActuals)
      .filter(([, v]) => v !== "")
      .map(([metricId, actual]) => ({ metricId, actual: parseFloat(actual), notes: editNotes[metricId] }));
    const res = await fetch(`/api/hr/kpi/${id}/results`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    load();
  }

  async function transition(newStatus: string) {
    setBusy(true); setError("");
    const res = await fetch(`/api/hr/kpi/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    load();
  }

  async function autoPopulate() {
    setBusy(true); setAutoMsg("");
    const res = await fetch(`/api/hr/kpi/${id}/auto-populate`, { method: "POST" });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    setAutoMsg(`Updated: ${d.updatedMetrics.join(", ") || "none"}`);
    load();
  }

  if (!kpi) return <div className="p-8 text-slate-400">Loading…</div>;

  const metrics: any[] = kpi.template?.metrics ?? [];
  const results: any[] = kpi.results ?? [];
  const resultMap = new Map(results.map((r: any) => [r.metricId, r]));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <button onClick={() => router.push("/hr/kpi")} className="text-sm text-slate-500 hover:text-slate-700">← KPIs</button>
      </div>

      <div className="card p-5 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{kpi.staffProfile?.user?.name}</h1>
          <p className="text-slate-500 text-sm">{kpi.template?.name} · {kpi.period}</p>
        </div>
        <div className="flex items-center gap-3">
          {kpi.overallScore != null && (
            <div className="text-center">
              <p className="text-3xl font-bold text-slate-800">{Number(kpi.overallScore).toFixed(1)}%</p>
              <p className="text-xs text-slate-500">Overall Score</p>
            </div>
          )}
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${{DRAFT:"bg-slate-100 text-slate-600",ACTIVE:"bg-blue-100 text-blue-700",COMPLETED:"bg-purple-100 text-purple-700",ARCHIVED:"bg-slate-200 text-slate-500"}[kpi.status as string]}`}>{kpi.status}</span>
        </div>
      </div>

      {isManager && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={autoPopulate} disabled={busy} className="btn-secondary text-sm">Auto-populate from system</button>
          {autoMsg && <span className="text-sm text-green-600">{autoMsg}</span>}
          {kpi.status === "DRAFT" && <button onClick={() => transition("ACTIVE")} disabled={busy} className="btn-primary text-sm">Activate</button>}
          {kpi.status === "ACTIVE" && <button onClick={() => transition("COMPLETED")} disabled={busy} className="btn-primary text-sm">Mark Completed</button>}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>{["Metric","Target","Actual","Score","Weight","Weighted"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {metrics.map((m: any) => {
              const r = resultMap.get(m.id);
              const actual = Number(r?.actual ?? 0);
              const target = Number(m.target ?? 0);
              const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
              const weighted = pct * (Number(m.weight) / 100);
              return (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-medium">{m.name}</p>
                    {m.unit && <p className="text-xs text-slate-400">{m.unit}</p>}
                  </td>
                  <td className="px-4 py-3">{m.target ?? "—"}</td>
                  <td className="px-4 py-3">
                    {isManager
                      ? <input type="number" className="form-input text-sm w-24" value={editActuals[m.id] ?? ""} onChange={(e) => setEditActuals((p) => ({ ...p, [m.id]: e.target.value }))} />
                      : (r?.actual ?? "—")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${SCORE_COLOR(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs">{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{Number(m.weight)}%</td>
                  <td className="px-4 py-3 font-medium">{weighted.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isManager && (
        <div className="flex gap-2">
          <button onClick={saveResults} disabled={busy} className="btn-primary text-sm">{busy ? "Saving…" : "Save Actuals"}</button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}
