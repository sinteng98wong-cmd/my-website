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
  _count: { pvs: number; purchaseOrders: number; stockInvoices: number };
};

const emptyForm = () => ({
  name: "", code: "", contactName: "", phone: "",
  email: "", address: "", registrationNo: "",
  bankName: "", accountNo: "", accountName: "",
});

export function SuppliersClient({
  suppliers: initial,
  role,
}: {
  suppliers: Supplier[];
  role: string;
}) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initial);
  const [search, setSearch]       = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<Supplier | null>(null);
  const [form, setForm]           = useState(emptyForm());
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  const canEdit   = ["SUPER_ADMIN", "FINANCE"].includes(role);
  const canDelete = role === "SUPER_ADMIN";

  const filtered = suppliers.filter((s) => {
    if (!showInactive && !s.active) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setError("");
    setShowModal(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name, code: s.code ?? "", contactName: s.contactName ?? "",
      phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "",
      registrationNo: s.registrationNo ?? "",
      bankName: s.bankName ?? "", accountNo: s.accountNo ?? "", accountName: s.accountName ?? "",
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
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed"); return; }
      setShowModal(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Supplier) {
    if (s.active && !confirm(`Deactivate "${s.name}"?`)) return;
    const res = await fetch(`/api/suppliers/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    if (res.ok) router.refresh();
    else { const d = await res.json(); alert(d.error ?? "Failed"); }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} supplier{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="btn-primary">+ Add Supplier</button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          className="form-input w-64"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-slate-300"
          />
          Show inactive
        </label>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {["Name", "Code", "Contact", "Bank Account", "Used In", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">No suppliers found</td></tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${!s.active ? "opacity-50" : ""}`}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{s.name}</div>
                  {s.registrationNo && <div className="text-xs text-slate-400">SSM: {s.registrationNo}</div>}
                  {!s.active && <span className="text-xs text-red-500">Inactive</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.code ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {s.contactName && <div>{s.contactName}</div>}
                  {s.phone       && <div className="text-xs text-slate-400">{s.phone}</div>}
                  {s.email       && <div className="text-xs text-slate-400">{s.email}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {s.bankName   && <div className="text-xs font-medium">{s.bankName}</div>}
                  {s.accountNo  && <div className="text-xs text-slate-400">{s.accountNo}</div>}
                  {s.accountName && <div className="text-xs text-slate-400">{s.accountName}</div>}
                  {!s.bankName  && <span className="text-xs text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {s._count.pvs > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700">
                        {s._count.pvs} PV
                      </span>
                    )}
                    {(s._count.purchaseOrders + s._count.stockInvoices) > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700">
                        {s._count.purchaseOrders + s._count.stockInvoices} orders
                      </span>
                    )}
                    {s._count.pvs === 0 && s._count.purchaseOrders === 0 && s._count.stockInvoices === 0 && (
                      <span className="text-xs text-slate-300">unused</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <button onClick={() => openEdit(s)} className="text-xs text-blue-600 hover:underline">Edit</button>
                    )}
                    {canDelete && (
                      <button onClick={() => toggleActive(s)} className={`text-xs hover:underline ${s.active ? "text-slate-400 hover:text-red-500" : "text-green-600"}`}>
                        {s.active ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">{editing ? "Edit Supplier" : "Add Supplier"}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 text-xl">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="form-label">Name *</label>
                  <input className="form-input" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
                </div>
                <div>
                  <label className="form-label">Code</label>
                  <input className="form-input" value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. SUP-001" />
                </div>
                <div>
                  <label className="form-label">SSM Registration No</label>
                  <input className="form-input" value={form.registrationNo} onChange={(e) => setForm(f => ({ ...f, registrationNo: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Contact Person</label>
                  <input className="form-input" value={form.contactName} onChange={(e) => setForm(f => ({ ...f, contactName: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="form-label">Email</label>
                  <input className="form-input" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="form-label">Address</label>
                  <textarea className="form-input" rows={2} value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Bank Account</p>
                <p className="text-xs text-slate-400 mb-3">Used as default bank details when this supplier is selected on a payment voucher.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Bank Name</label>
                    <input className="form-input" value={form.bankName} onChange={(e) => setForm(f => ({ ...f, bankName: e.target.value }))} placeholder="e.g. Maybank" />
                  </div>
                  <div>
                    <label className="form-label">Account No</label>
                    <input className="form-input" value={form.accountNo} onChange={(e) => setForm(f => ({ ...f, accountNo: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="form-label">Account Name</label>
                    <input className="form-input" value={form.accountName} onChange={(e) => setForm(f => ({ ...f, accountName: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Supplier"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
