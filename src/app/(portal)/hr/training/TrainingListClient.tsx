"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Clinic = { id: string; name: string };

const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-MY", { dateStyle: "medium" });

export function TrainingListClient({ isManager, clinics }: { isManager: boolean; clinics: Clinic[] }) {
  const router = useRouter();
  const [trainings, setTrainings] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: "", provider: "", type: "External", startDate: "", endDate: "", venue: "", cost: "", maxSlots: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const d = await fetch("/api/hr/training").then((r) => r.json());
    setTrainings(Array.isArray(d) ? d : []);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setBusy(true); setError("");
    const res = await fetch("/api/hr/training", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, cost: form.cost ? parseFloat(form.cost) : undefined, maxSlots: form.maxSlots ? parseInt(form.maxSlots) : undefined }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    setShowNew(false);
    router.push(`/hr/training/${d.id}`);
  }

  if (!isManager) {
    // Staff view: My Training
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="page-title">My Training</h1>
          <a href="/hr/training/my-training" className="btn-secondary text-sm">Full History</a>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {["COMPLETED","ONGOING","PLANNED"].map((status) => (
            <div key={status} className="card p-4">
              <h2 className="text-sm font-semibold text-slate-600 mb-3">{status}</h2>
              <div className="space-y-2">
                {trainings.filter((t: any) => t.status === status).map((t: any) => (
                  <div key={t.id} className="text-sm text-slate-700 border-l-2 border-blue-400 pl-2">
                    <p className="font-medium">{t.training?.title}</p>
                    <p className="text-xs text-slate-400">{fmtDate(t.training?.startDate)}</p>
                    {t.certificateUrl && <a href={t.certificateUrl} target="_blank" className="text-xs text-blue-600">Download certificate</a>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">Training Management</h1>
        <div className="flex gap-2">
          <a href="/hr/training/my-training" className="btn-secondary text-sm">My Training</a>
          <button onClick={() => setShowNew(true)} className="btn-primary text-sm">New Training</button>
        </div>
      </div>

      {showNew && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-slate-800">New Training</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Title *</label>
              <input className="form-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Provider</label>
              <input className="form-input" value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Type</label>
              <select className="form-input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {["Internal","External","Online"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Venue</label>
              <input className="form-input" value={form.venue} onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Start Date *</label>
              <input type="date" className="form-input" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">End Date *</label>
              <input type="date" className="form-input" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Cost (RM)</label>
              <input type="number" className="form-input" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Max Slots</label>
              <input type="number" className="form-input" value={form.maxSlots} onChange={(e) => setForm((f) => ({ ...f, maxSlots: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea rows={3} className="form-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
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
            <tr>{["Title","Provider","Type","Dates","Enrolled","Completed","Cost",""].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {trainings.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No training records.</td></tr>}
            {trainings.map((t: any) => (
              <tr key={t.id} className="table-row cursor-pointer" onClick={() => router.push(`/hr/training/${t.id}`)}>
                <td className="px-4 py-3 font-medium">{t.title}</td>
                <td className="px-4 py-3 text-slate-600">{t.provider ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{t.type ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{fmtDate(t.startDate)} – {fmtDate(t.endDate)}</td>
                <td className="px-4 py-3 text-center">{t._count?.participants ?? 0}</td>
                <td className="px-4 py-3 text-center text-green-700">{t.completedCount ?? 0}</td>
                <td className="px-4 py-3">{t.cost ? RM(Number(t.cost)) : "—"}</td>
                <td className="px-4 py-3 text-blue-600 text-xs">View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
