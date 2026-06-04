"use client";

import { useState } from "react";

type LicenseType = {
  id: string; name: string; code: string | null; scope: string; issuingBody: string | null;
  description: string | null; isActive: boolean; order: number;
};

export function LicenseTypesClient({ initialTypes }: { initialTypes: LicenseType[] }) {
  const [types,   setTypes]   = useState(initialTypes);
  const [showAdd, setShowAdd] = useState(false);
  const [editId,  setEditId]  = useState<string | null>(null);
  const [scope,   setScope]   = useState<"CLINIC" | "DOCTOR">("CLINIC");
  const [name,    setName]    = useState("");
  const [code,    setCode]    = useState("");
  const [body,    setBody]    = useState("");
  const [saving,  setSaving]  = useState(false);

  async function load() {
    const data = await fetch("/api/admin/license-types").then(r => r.json());
    setTypes(data);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/admin/license-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code: code || null, scope, issuingBody: body || null }),
    });
    setSaving(false);
    setShowAdd(false);
    setName(""); setCode(""); setBody("");
    await load();
  }

  async function toggleActive(t: LicenseType) {
    await fetch(`/api/admin/license-types/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    await load();
  }

  const clinicTypes = types.filter(t => t.scope === "CLINIC");
  const doctorTypes = types.filter(t => t.scope === "DOCTOR");

  function TypeTable({ items, title }: { items: LicenseType[]; title: string }) {
    return (
      <div className="card mb-6">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">{title}</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Code</th>
              <th className="px-4 py-3 text-left">Issuing Body</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map(t => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3 text-slate-500">{t.code ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{t.issuingBody ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {t.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(t)} className="text-xs text-blue-600 hover:underline">
                    {t.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">License Types</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage preset and custom license types</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Type</button>
      </div>

      <TypeTable items={clinicTypes} title="Clinic License Types" />
      <TypeTable items={doctorTypes} title="Doctor License Types" />

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Add License Type</h2>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="label">Scope</label>
                <div className="flex gap-4 mt-1">
                  {(["CLINIC","DOCTOR"] as const).map(s => (
                    <label key={s} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={scope === s} onChange={() => setScope(s)} />
                      <span className="text-sm">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Name <span className="text-red-500">*</span></label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <label className="label">Code</label>
                <input className="input" value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. APC" />
              </div>
              <div>
                <label className="label">Issuing Body</label>
                <input className="input" value={body} onChange={e => setBody(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : "Add"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
