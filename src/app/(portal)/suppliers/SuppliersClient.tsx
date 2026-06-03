"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Supplier = {
  id: string;
  name: string;
  code: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  registrationNo: string | null;
  bankName: string | null;
  accountNo: string | null;
  accountName: string | null;
  active: boolean;
  _count: { pvs: number };
};

const emptyForm = () => ({
  name: "",
  code: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  registrationNo: "",
  bankName: "",
  accountNo: "",
  accountName: "",
});

export function SuppliersClient({ suppliers: initial, role }: { suppliers: Supplier[]; role: string }) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initial);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canEdit  = ["SUPER_ADMIN", "FINANCE"].includes(role);
  const canDelete = role === "SUPER_ADMIN";

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setError("");
    setShowModal(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      code: s.code ?? "",
      contactPerson: s.contactName ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
      registrationNo: s.registrationNo ?? "",
      bankName: s.bankName ?? "",
      accountNo: s.accountNo ?? "",
      accountName: s.accountName ?? "",
    });
    setError("");
    setShowModal(true);
  }

  async function save() {
    setError("");
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    try {
      const url    = editing ? `/api/suppliers/${editing.id}` : "/api/suppliers";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Failed to save");
        return;
      }
      setShowModal(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Deactivate this supplier?")) return;
    const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? "Failed to deactivate");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">Suppliers</h1>
        {canEdit && (
          <button onClick={openCreate} className="btn-primary">+ Add Supplier</button>
        )}
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">Name</th>
              <th className="table-header">Code</th>
              <th className="table-header">Contact</th>
              <th className="table-header">Bank</th>
              <th className="table-header">PVs</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-slate-400">No suppliers found</td></tr>
            )}
            {suppliers.map((s) => (
              <tr key={s.id} className="table-row">
                <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.code ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {s.contactName && <div>{s.contactName}</div>}
                  {s.phone && <div className="text-xs text-slate-400">{s.phone}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {s.bankName && <div className="text-xs">{s.bankName}</div>}
                  {s.accountNo && <div className="text-xs text-slate-400">{s.accountNo}</div>}
                </td>
                <td className="px-4 py-3 text-slate-500">{s._count.pvs}</td>
                <td className="px-4 py-3 flex gap-2">
                  {canEdit && (
                    <button onClick={() => openEdit(s)} className="text-blue-600 hover:underline text-xs">Edit</button>
                  )}
                  {canDelete && (
                    <button onClick={() => deactivate(s.id)} className="text-red-500 hover:underline text-xs">Deactivate</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">{editing ? "Edit Supplier" : "Add Supplier"}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            {error && <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{error}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="form-label">Name *</label>
                <input className="form-input" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Code</label>
                <input className="form-input" value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Registration No</label>
                <input className="form-input" value={form.registrationNo} onChange={(e) => setForm(f => ({ ...f, registrationNo: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Contact Person</label>
                <input className="form-input" value={form.contactPerson} onChange={(e) => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input className="form-input" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input className="form-input" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="form-label">Address</label>
                <textarea className="form-input" rows={2} value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Bank Name</label>
                <input className="form-input" value={form.bankName} onChange={(e) => setForm(f => ({ ...f, bankName: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Account No</label>
                <input className="form-input" value={form.accountNo} onChange={(e) => setForm(f => ({ ...f, accountNo: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Account Name</label>
                <input className="form-input" value={form.accountName} onChange={(e) => setForm(f => ({ ...f, accountName: e.target.value }))} />
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
