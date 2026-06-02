"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Appraisal = { id: string; appraisalRef: string; period: string; status: string; selfRating?: number; managerRating?: number; finalRating?: number; staffProfile: { user: { name: string } }; reviewer: { name: string } };

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SELF_REVIEW: "bg-amber-100 text-amber-700",
  MANAGER_REVIEW: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-purple-100 text-purple-700",
  ACKNOWLEDGED: "bg-green-100 text-green-700",
};

const PERIODS = ["2026-Q1","2026-Q2","2026-H1","2026-H2","2026"];

export function AppraisalsClient({ isManager }: { isManager: boolean }) {
  const router = useRouter();
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [staff, setStaff] = useState<any[]>([]);
  const [reviewers, setReviewers] = useState<any[]>([]);
  const [form, setForm] = useState({ staffProfileId: "", reviewerId: "", period: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (status) params.set("status", status);
    const d = await fetch(`/api/hr/appraisals?${params}`).then((r) => r.json());
    setAppraisals(Array.isArray(d) ? d : []);
  }
  useEffect(() => { load(); }, [period, status]);

  async function openNew() {
    const [s, r] = await Promise.all([
      fetch("/api/hr/staff").then((x) => x.json()).catch(() => []),
      fetch("/api/hr/staff?roles=SUPER_ADMIN,CLINIC_MANAGER").then((x) => x.json()).catch(() => []),
    ]);
    setStaff(Array.isArray(s) ? s : []);
    setReviewers(Array.isArray(r) ? r : s);
    setForm({ staffProfileId: "", reviewerId: "", period: "" });
    setError("");
    setShowNew(true);
  }

  async function create() {
    setBusy(true); setError("");
    const res = await fetch("/api/hr/appraisals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    setShowNew(false);
    router.push(`/hr/appraisals/${d.id}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">Appraisals</h1>
        <div className="flex gap-2 flex-wrap items-center">
          <select className="form-input w-36 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">All periods</option>
            {PERIODS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className="form-input w-40 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.keys(STATUS_BADGE).map((s) => <option key={s}>{s}</option>)}
          </select>
          {isManager && <button onClick={openNew} className="btn-primary text-sm">New Appraisal</button>}
        </div>
      </div>

      {showNew && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-slate-800">New Appraisal</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="form-label">Staff *</label>
              <select className="form-input" value={form.staffProfileId} onChange={(e) => setForm((f) => ({ ...f, staffProfileId: e.target.value }))}>
                <option value="">Select…</option>
                {staff.map((s: any) => <option key={s.id} value={s.id}>{s.user?.name ?? s.id}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Reviewer *</label>
              <select className="form-input" value={form.reviewerId} onChange={(e) => setForm((f) => ({ ...f, reviewerId: e.target.value }))}>
                <option value="">Select…</option>
                {reviewers.map((r: any) => <option key={r.userId ?? r.id} value={r.userId ?? r.id}>{r.user?.name ?? r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Period *</label>
              <select className="form-input" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}>
                <option value="">Select…</option>
                {PERIODS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={create} disabled={busy} className="btn-primary text-sm">{busy ? "Creating…" : "Create"}</button>
            <button onClick={() => setShowNew(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>{["Ref","Staff","Period","Reviewer","Self","Manager","Final","Status",""].map((h) => (
              <th key={h} className="px-3 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {appraisals.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No appraisals found.</td></tr>}
            {appraisals.map((a) => (
              <tr key={a.id} className="table-row cursor-pointer" onClick={() => router.push(`/hr/appraisals/${a.id}`)}>
                <td className="px-3 py-3 text-slate-500 text-xs">{a.appraisalRef}</td>
                <td className="px-3 py-3 font-medium">{a.staffProfile.user.name}</td>
                <td className="px-3 py-3">{a.period}</td>
                <td className="px-3 py-3 text-slate-600">{a.reviewer.name}</td>
                <td className="px-3 py-3 text-center">{a.selfRating ?? "—"}</td>
                <td className="px-3 py-3 text-center">{a.managerRating ?? "—"}</td>
                <td className="px-3 py-3 text-center font-medium">{a.finalRating ?? "—"}</td>
                <td className="px-3 py-3"><span className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGE[a.status]}`}>{a.status.replace("_", " ")}</span></td>
                <td className="px-3 py-3 text-blue-600 text-xs">View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
