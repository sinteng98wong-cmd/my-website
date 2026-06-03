"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Category = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  order: number;
};

export function ExpenseCategoriesClient({ categories: initial }: { categories: Category[] }) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", description: "", order: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openCreate() {
    setEditing(null);
    setForm({ name: "", description: "", order: initial.length + 1 });
    setError("");
    setShowModal(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setForm({ name: c.name, description: c.description ?? "", order: c.order });
    setError("");
    setShowModal(true);
  }

  async function save() {
    setError("");
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    try {
      const url    = editing ? `/api/admin/expense-categories/${editing.id}` : "/api/admin/expense-categories";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Failed");
        return;
      }
      setShowModal(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: Category) {
    await fetch(`/api/admin/expense-categories/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">Expense Categories</h1>
        <button onClick={openCreate} className="btn-primary">+ Add Category</button>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">Order</th>
              <th className="table-header">Name</th>
              <th className="table-header">Description</th>
              <th className="table-header">Status</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initial.map((c) => (
              <tr key={c.id} className="table-row">
                <td className="px-4 py-3 text-slate-500">{c.order}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                <td className="px-4 py-3 text-slate-500">{c.description ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={c.isActive ? "badge-green" : "badge-slate"}>
                    {c.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => openEdit(c)} className="text-blue-600 hover:underline text-xs">Edit</button>
                  <button onClick={() => toggle(c)} className="text-slate-400 hover:text-slate-600 text-xs">
                    {c.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">{editing ? "Edit Category" : "Add Category"}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            {error && <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{error}</div>}
            <div className="space-y-3">
              <div>
                <label className="form-label">Name *</label>
                <input className="form-input" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Description</label>
                <input className="form-input" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Sort Order</label>
                <input type="number" className="form-input" value={form.order} onChange={(e) => setForm(f => ({ ...f, order: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShowModal(false)} className="btn-outline text-sm">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary text-sm">
                {saving ? "Saving..." : (editing ? "Update" : "Create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
