"use client";

import { useState } from "react";

type Source = {
  id: string; name: string; description: string | null;
  isActive: boolean; order: number; patientCount: number;
};

export function PatientSourcesClient({ initial }: { initial: Source[] }) {
  const [sources, setSources] = useState<Source[]>(initial);
  const [adding, setAdding]   = useState(false);
  const [form, setForm]       = useState({ name: "", description: "" });
  const [editId, setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [error, setError]     = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/admin/patient-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setSources((p) => [...p, { ...data, patientCount: 0 }].sort((a, b) => a.order - b.order));
      setForm({ name: "", description: "" });
      setAdding(false);
    } else setError(data.error);
    setBusy(false);
  }

  async function patch(id: string, body: any) {
    setError(null);
    const res = await fetch(`/api/admin/patient-sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return false; }
    setSources((p) => p.map((s) => s.id === id ? { ...s, ...data } : s));
    return true;
  }

  async function toggleActive(s: Source) {
    await patch(s.id, { isActive: !s.isActive });
  }

  async function saveEdit(id: string) {
    if (await patch(id, editForm)) setEditId(null);
  }

  async function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= sources.length) return;
    const a = sources[idx], b = sources[target];
    // swap order values
    await patch(a.id, { order: b.order });
    await patch(b.id, { order: a.order });
    setSources((p) => {
      const next = [...p];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
  }

  async function remove(s: Source) {
    if (s.patientCount > 0) {
      setError(`${s.patientCount} patients use "${s.name}". Deactivate instead of deleting.`);
      return;
    }
    if (!confirm(`Delete source "${s.name}"?`)) return;
    const res = await fetch(`/api/admin/patient-sources/${s.id}`, { method: "DELETE" });
    if (res.ok) setSources((p) => p.filter((x) => x.id !== s.id));
    else setError((await res.json()).error);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">Patient Sources</h1>
          <p className="text-sm text-slate-500 mt-0.5">How patients hear about the clinic</p>
        </div>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary">
          {adding ? "Cancel" : "+ Add Source"}
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      {adding && (
        <form onSubmit={addSource} className="card p-5 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Name *</label>
              <input className="form-input" required value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. TikTok" />
            </div>
            <div>
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
            {busy ? "Saving…" : "Add Source"}
          </button>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Order", "Name", "Description", "Patients", "Active", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((s, i) => (
              <tr key={s.id} className={`table-row ${!s.isActive ? "opacity-50" : ""}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 w-5">{i + 1}</span>
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30">▲</button>
                    <button onClick={() => move(i, 1)} disabled={i === sources.length - 1} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30">▼</button>
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {editId === s.id ? (
                    <input className="form-input text-sm py-1" value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                  ) : s.name}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {editId === s.id ? (
                    <input className="form-input text-sm py-1" value={editForm.description}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
                  ) : (s.description ?? "—")}
                </td>
                <td className="px-4 py-3 text-center text-slate-600">{s.patientCount}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(s)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${s.isActive ? "bg-green-500" : "bg-slate-300"}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${s.isActive ? "translate-x-5" : "translate-x-1"}`} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    {editId === s.id ? (
                      <>
                        <button onClick={() => saveEdit(s.id)} className="text-xs text-green-600 hover:underline">Save</button>
                        <button onClick={() => setEditId(null)} className="text-xs text-slate-400 hover:underline">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditId(s.id); setEditForm({ name: s.name, description: s.description ?? "" }); }}
                          className="text-xs text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => remove(s)} className="text-xs text-red-500 hover:underline">Delete</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
