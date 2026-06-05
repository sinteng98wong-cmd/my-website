"use client";

import { useState } from "react";

type TreatmentType = { id: string; name: string };
type Template = {
  id: string; name: string; description: string|null; order: number;
  defaultCost: number|null; estimatedDays: number|null; isActive: boolean;
  treatmentTypeId: string; treatmentType: { name: string };
};

function fmt(n: number|null) {
  if (!n) return "—";
  return new Intl.NumberFormat("ms-MY",{ style:"currency", currency:"MYR" }).format(n);
}

export function StageTemplatesClient({ treatmentTypes, initialTemplates }: {
  treatmentTypes: TreatmentType[];
  initialTemplates: Template[];
}) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [showAdd,   setShowAdd]   = useState(false);
  const [typeId,    setTypeId]    = useState("");
  const [name,      setName]      = useState("");
  const [desc,      setDesc]      = useState("");
  const [order,     setOrder]     = useState("1");
  const [cost,      setCost]      = useState("");
  const [days,      setDays]      = useState("");
  const [saving,    setSaving]    = useState(false);

  async function load() {
    const res = await fetch("/api/admin/stage-templates");
    const data: Template[] = res.ok ? await res.json() : [];
    setTemplates(data);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/admin/stage-templates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        treatmentTypeId: typeId,
        name,
        description: desc || undefined,
        order: parseInt(order) || 1,
        defaultCost: cost ? parseFloat(cost) : undefined,
        estimatedDays: days ? parseInt(days) : undefined,
      }),
    });
    setSaving(false); setShowAdd(false);
    setName(""); setDesc(""); setOrder("1"); setCost(""); setDays("");
    await load();
  }

  async function handleDeactivate(id: string) {
    await fetch(`/api/admin/stage-templates/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    await load();
  }

  // Group by treatment type
  const byType = new Map<string, { typeName: string; templates: Template[] }>();
  for (const t of templates) {
    if (!byType.has(t.treatmentTypeId)) byType.set(t.treatmentTypeId, { typeName: t.treatmentType.name, templates: [] });
    byType.get(t.treatmentTypeId)!.templates.push(t);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Stage Templates</h1>
          <p className="text-sm text-slate-500 mt-0.5">Define default stages per treatment type — used when creating treatment plans</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Stage</button>
      </div>

      {templates.length === 0 && (
        <div className="card p-8 text-center text-slate-400">
          No stage templates yet. Add your first stage to get started.
        </div>
      )}

      {[...byType.entries()].map(([tid, group]) => (
        <div key={tid} className="card overflow-hidden mb-5">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">{group.typeName}</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Order","Stage Name","Description","Default Cost","Est. Days",""].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.templates.map(t => (
                <tr key={t.id} className="table-row">
                  <td className="px-5 py-2.5 text-slate-400 font-mono text-xs">{t.order}</td>
                  <td className="px-5 py-2.5 font-medium text-slate-800">{t.name}</td>
                  <td className="px-5 py-2.5 text-slate-500 text-xs">{t.description ?? "—"}</td>
                  <td className="px-5 py-2.5 font-mono text-slate-700">{fmt(t.defaultCost)}</td>
                  <td className="px-5 py-2.5 text-slate-500">{t.estimatedDays ? `${t.estimatedDays}d` : "—"}</td>
                  <td className="px-5 py-2.5">
                    <button onClick={() => handleDeactivate(t.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Add Stage Template</h2>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="form-label">Treatment Type <span className="text-red-500">*</span></label>
                <select className="form-input" value={typeId} onChange={e => setTypeId(e.target.value)} required>
                  <option value="">Select…</option>
                  {treatmentTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Stage Name <span className="text-red-500">*</span></label>
                  <input className="form-input" value={name} onChange={e => setName(e.target.value)} required />
                </div>
                <div>
                  <label className="form-label">Order</label>
                  <input type="number" min="1" className="form-input" value={order} onChange={e => setOrder(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label">Description</label>
                <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Default Cost (MYR)</label>
                  <input type="number" step="0.01" min="0" className="form-input" value={cost} onChange={e => setCost(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Estimated Days to Next</label>
                  <input type="number" min="0" className="form-input" value={days} onChange={e => setDays(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="btn-outline">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Add Stage"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
