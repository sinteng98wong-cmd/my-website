"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Clinic = { id: string; name: string };
type KpiRow = { id: string; period: string; status: string; overallScore?: number; template: { name: string }; staffProfile: { user: { name: string } } };

const SCORE_BADGE: (score: number) => string = (s) =>
  s < 50 ? "bg-red-100 text-red-700" : s < 75 ? "bg-amber-100 text-amber-700" : s < 90 ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700";

const STATUS_BADGE: Record<string, string> = { DRAFT: "bg-slate-100 text-slate-600", ACTIVE: "bg-blue-100 text-blue-700", COMPLETED: "bg-purple-100 text-purple-700", ARCHIVED: "bg-slate-200 text-slate-500" };

export function KpiListClient({ clinics, isManager }: { clinics: Clinic[]; isManager: boolean }) {
  const router = useRouter();
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [assign, setAssign] = useState({ staffProfileId: "", templateId: "", period: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (status) params.set("status", status);
    const d = await fetch(`/api/hr/kpi?${params}`).then((r) => r.json());
    setKpis(Array.isArray(d) ? d : []);
  }

  useEffect(() => { load(); }, [period, status]);

  async function openAssign() {
    const [t, s] = await Promise.all([
      fetch("/api/hr/kpi/templates").then((r) => r.json()),
      fetch("/api/hr/staff").then((r) => r.json()).catch(() => []),
    ]);
    setTemplates(Array.isArray(t) ? t : []);
    setStaff(Array.isArray(s) ? s : []);
    setAssign({ staffProfileId: "", templateId: "", period: "" });
    setError("");
    setShowAssign(true);
  }

  async function doAssign() {
    setBusy(true); setError("");
    const res = await fetch("/api/hr/kpi/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(assign) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    setShowAssign(false);
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">KPI Management</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {isManager && <a href="/hr/kpi/templates" className="btn-secondary text-sm">Templates</a>}
          <select className="form-input w-36 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">All periods</option>
            {["2026-Q1","2026-Q2","2026-Q3","2026-Q4","2026-H1","2026-H2","2026"].map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className="form-input w-36 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["DRAFT","ACTIVE","COMPLETED","ARCHIVED"].map((s) => <option key={s}>{s}</option>)}
          </select>
          {isManager && <button onClick={openAssign} className="btn-primary text-sm">Assign KPI</button>}
        </div>
      </div>

      {showAssign && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-slate-800">Assign KPI</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="form-label">Staff</label>
              <select className="form-input" value={assign.staffProfileId} onChange={(e) => setAssign((a) => ({ ...a, staffProfileId: e.target.value }))}>
                <option value="">Select…</option>
                {staff.map((s: any) => <option key={s.id} value={s.id}>{s.user?.name ?? s.id}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Template</label>
              <select className="form-input" value={assign.templateId} onChange={(e) => setAssign((a) => ({ ...a, templateId: e.target.value }))}>
                <option value="">Select…</option>
                {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Period</label>
              <select className="form-input" value={assign.period} onChange={(e) => setAssign((a) => ({ ...a, period: e.target.value }))}>
                <option value="">Select…</option>
                {["2026-Q1","2026-Q2","2026-Q3","2026-Q4","2026-H1","2026-H2","2026"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={doAssign} disabled={busy} className="btn-primary text-sm">{busy ? "Assigning…" : "Assign"}</button>
            <button onClick={() => setShowAssign(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>{["Staff","Period","Template","Score","Status",""].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {kpis.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No KPI records.</td></tr>}
            {kpis.map((k) => (
              <tr key={k.id} className="table-row cursor-pointer" onClick={() => router.push(`/hr/kpi/${k.id}`)}>
                <td className="px-4 py-3 font-medium">{k.staffProfile.user.name}</td>
                <td className="px-4 py-3">{k.period}</td>
                <td className="px-4 py-3 text-slate-600">{k.template.name}</td>
                <td className="px-4 py-3">
                  {k.overallScore != null
                    ? <span className={`text-xs px-2 py-0.5 rounded font-medium ${SCORE_BADGE(Number(k.overallScore))}`}>{Number(k.overallScore).toFixed(1)}%</span>
                    : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGE[k.status]}`}>{k.status}</span></td>
                <td className="px-4 py-3 text-blue-600 text-xs">View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
