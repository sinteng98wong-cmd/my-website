"use client";

import { useEffect, useState } from "react";

type Metric = { id?: string; name: string; description?: string; unit?: string; target?: number; weight: number; order: number };
type Template = { id: string; name: string; role?: string; description?: string; isActive: boolean; metrics: Metric[] };

const ROLES = ["SUPER_ADMIN", "CLINIC_MANAGER", "DOCTOR", "NURSE", "RECEPTIONIST", "STOREKEEPER", "FINANCE"];

function emptyMetric(order: number): Metric {
  return { name: "", unit: "", weight: 0, order };
}

export function KpiTemplatesClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: "", role: "", description: "" });
  const [metrics, setMetrics] = useState<Metric[]>([emptyMetric(0)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const d = await fetch("/api/hr/kpi/templates").then((r) => r.json());
    setTemplates(Array.isArray(d) ? d : []);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ name: "", role: "", description: "" });
    setMetrics([emptyMetric(0)]);
    setError("");
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setForm({ name: t.name, role: t.role ?? "", description: t.description ?? "" });
    setMetrics(t.metrics.map((m) => ({ ...m })));
    setError("");
    setShowForm(true);
  }

  function addMetric() {
    setMetrics((prev) => [...prev, emptyMetric(prev.length)]);
  }

  function removeMetric(i: number) {
    setMetrics((prev) => prev.filter((_, idx) => idx !== i).map((m, idx) => ({ ...m, order: idx })));
  }

  function updateMetric(i: number, field: keyof Metric, value: string | number) {
    setMetrics((prev) => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  }

  const totalWeight = metrics.reduce((s, m) => s + Number(m.weight || 0), 0);

  async function save() {
    setError("");
    if (!form.name) { setError("Template name is required"); return; }
    if (Math.abs(totalWeight - 100) > 0.01) { setError(`Weights must sum to 100 (currently ${totalWeight})`); return; }

    setBusy(true);
    const url = editing ? `/api/hr/kpi/templates/${editing.id}` : "/api/hr/kpi/templates";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, role: form.role || undefined, description: form.description || undefined, metrics }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    await load();
    setShowForm(false);
  }

  if (showForm) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <button onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-700">← Back</button>
          <h1 className="page-title">{editing ? "Edit Template" : "New KPI Template"}</h1>
        </div>

        <div className="card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Template Name *</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">For Role (optional)</label>
              <select className="form-input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="">All roles</option>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Metrics</h2>
            <span className={`text-sm font-medium ${Math.abs(totalWeight - 100) < 0.01 ? "text-green-600" : "text-red-600"}`}>
              Total weight: {totalWeight}%
            </span>
          </div>

          <div className="space-y-3">
            {metrics.map((m, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center border rounded p-3 bg-slate-50">
                <div className="col-span-4">
                  <label className="text-xs text-slate-500">Name *</label>
                  <input className="form-input text-sm" value={m.name} onChange={(e) => updateMetric(i, "name", e.target.value)} placeholder="e.g. Patient Count" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-slate-500">Unit</label>
                  <input className="form-input text-sm" value={m.unit ?? ""} onChange={(e) => updateMetric(i, "unit", e.target.value)} placeholder="count / %" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-slate-500">Target</label>
                  <input type="number" className="form-input text-sm" value={m.target ?? ""} onChange={(e) => updateMetric(i, "target", parseFloat(e.target.value))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-slate-500">Weight %</label>
                  <input type="number" className="form-input text-sm" value={m.weight} onChange={(e) => updateMetric(i, "weight", parseFloat(e.target.value) || 0)} />
                </div>
                <div className="col-span-2 flex justify-end pt-4">
                  <button onClick={() => removeMetric(i)} className="text-red-500 hover:text-red-700 text-sm">Remove</button>
                </div>
              </div>
            ))}
          </div>

          <button onClick={addMetric} className="btn-secondary text-sm">+ Add Metric</button>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save Template"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">KPI Templates</h1>
        <button onClick={openNew} className="btn-primary text-sm">New Template</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>{["Template Name", "For Role", "Metrics", "Active", "Actions"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {templates.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No templates yet.</td></tr>}
            {templates.map((t) => (
              <tr key={t.id} className="table-row">
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3 text-slate-500">{t.role ?? "All"}</td>
                <td className="px-4 py-3 text-center">{t.metrics.length}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${t.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{t.isActive ? "Active" : "Inactive"}</span></td>
                <td className="px-4 py-3"><button onClick={() => openEdit(t)} className="text-blue-600 text-xs hover:underline">Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
