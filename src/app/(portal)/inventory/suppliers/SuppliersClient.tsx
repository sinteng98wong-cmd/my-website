"use client";

import { useState } from "react";

type Supplier = {
  id: string; name: string; code: string | null;
  contactName: string | null; email: string | null;
  phone: string | null; address: string | null; active: boolean;
};

const EMPTY: Omit<Supplier, "id" | "active"> = {
  name: "", code: "", contactName: "", email: "", phone: "", address: "",
};

export function SuppliersClient({ initialSuppliers }: { initialSuppliers: Supplier[] }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [formOpen, setFormOpen]   = useState(false);
  const [editing, setEditing]     = useState<Supplier | null>(null);
  const [form, setForm]           = useState({ ...EMPTY });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY });
    setError(null);
    setFormOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, code: s.code ?? "", contactName: s.contactName ?? "", email: s.email ?? "", phone: s.phone ?? "", address: s.address ?? "" });
    setError(null);
    setFormOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/inventory/suppliers/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); return; }
        setSuppliers((prev) => prev.map((s) => s.id === editing.id ? { ...s, ...data } : s));
      } else {
        const res = await fetch("/api/inventory/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); return; }
        setSuppliers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Supplier) {
    const res = await fetch(`/api/inventory/suppliers/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    if (res.ok) {
      setSuppliers((prev) => prev.map((x) => x.id === s.id ? { ...x, active: !s.active } : x));
    }
  }

  const f = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="text-sm text-slate-500 mt-0.5">{suppliers.filter(s => s.active).length} active</p>
        </div>
        <button type="button" onClick={openNew} className="btn-primary">+ Add Supplier</button>
      </div>

      {formOpen && (
        <form onSubmit={save} className="card p-6 mb-6 space-y-4">
          <h2 className="font-semibold text-slate-800">{editing ? "Edit Supplier" : "New Supplier"}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Supplier Name *</label>
              <input className="form-input" required value={form.name} onChange={f("name")} />
            </div>
            <div>
              <label className="form-label">Code / Short ID</label>
              <input className="form-input font-mono" value={form.code ?? ""} onChange={f("code")} placeholder="e.g. 3M-MY" />
            </div>
            <div>
              <label className="form-label">Contact Person</label>
              <input className="form-input" value={form.contactName ?? ""} onChange={f("contactName")} />
            </div>
            <div>
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email ?? ""} onChange={f("email")} />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input className="form-input" value={form.phone ?? ""} onChange={f("phone")} />
            </div>
            <div>
              <label className="form-label">Address</label>
              <input className="form-input" value={form.address ?? ""} onChange={f("address")} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Supplier", "Code", "Contact", "Email", "Phone", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No suppliers yet.</td></tr>
            )}
            {suppliers.map((s) => (
              <tr key={s.id} className={`table-row ${!s.active ? "opacity-50" : ""}`}>
                <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                <td className="px-4 py-3 font-mono text-slate-500 text-xs">{s.code ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{s.contactName ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{s.email ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{s.phone ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={s.active ? "badge-green" : "badge-red"}>{s.active ? "Active" : "Inactive"}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <a href={`/inventory/suppliers/${s.id}/ledger`} className="text-xs text-indigo-600 hover:underline font-medium">Ledger</a>
                    <button type="button" onClick={() => openEdit(s)} className="text-xs text-blue-600 hover:underline">Edit</button>
                    <button type="button" onClick={() => toggleActive(s)} className="text-xs text-slate-500 hover:underline">
                      {s.active ? "Deactivate" : "Activate"}
                    </button>
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
