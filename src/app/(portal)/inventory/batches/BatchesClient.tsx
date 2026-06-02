"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

type StockItem = { id: string; name: string; sku: string; unit: string };
type Supplier  = { id: string; name: string };

type Batch = {
  id:          string;
  batchNumber: string;
  expiryDate:  string | null;
  quantity:    number;
  remainingQty: number;
  unitCost:    number;
  receivedAt:  string;
  item:        { id: string; name: string; sku: string; unit: string; category: string };
  supplier:    { id: string; name: string } | null;
};

type Summary = { expired: number; expiring30: number; expiring90: number; ok: number; noExpiry: number };

type Filter = "all" | "expired" | "expiring30" | "expiring90" | "ok" | "noExpiry";

function expiryStatus(expiryDate: string | null): "expired" | "expiring30" | "expiring90" | "ok" | "noExpiry" {
  if (!expiryDate) return "noExpiry";
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86_400_000);
  if (days < 0)   return "expired";
  if (days <= 30) return "expiring30";
  if (days <= 90) return "expiring90";
  return "ok";
}

function ExpiryCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-xs text-slate-400">No expiry</span>;
  const days  = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
  const label = format(new Date(date), "d MMM yyyy");
  if (days < 0)    return <div><span className="inline-block text-xs font-semibold text-white bg-red-600 px-2 py-0.5 rounded">EXPIRED</span><div className="text-xs text-red-600 mt-0.5">{label}</div></div>;
  if (days <= 30)  return <div><span className="inline-block text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded">{days} days</span><div className="text-xs text-slate-500 mt-0.5">{label}</div></div>;
  if (days <= 90)  return <div><span className="inline-block text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">{days} days</span><div className="text-xs text-slate-500 mt-0.5">{label}</div></div>;
  return <span className="text-xs text-slate-600">{label}</span>;
}

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

const EMPTY_FORM = { itemId: "", batchNumber: "", expiryDate: "", quantity: "", unitCost: "", supplierId: "", receivedAt: new Date().toISOString().slice(0, 10) };

export function BatchesClient({
  clinics, selectedClinicId, batches, summary,
}: {
  clinics: { id: string; name: string }[];
  selectedClinicId: string;
  batches: Batch[];
  summary: Summary;
}) {
  const router  = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  // Register batch form
  const [formOpen, setFormOpen]   = useState(false);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [suppliers, setSuppliers]   = useState<Supplier[]>([]);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);
  const [localBatches, setLocalBatches] = useState<Batch[]>(batches);

  useEffect(() => {
    if (!formOpen) return;
    fetch("/api/inventory/items").then((r) => r.json()).then(setStockItems).catch(() => {});
    fetch("/api/inventory/suppliers").then((r) => r.json()).then(setSuppliers).catch(() => {});
  }, [formOpen]);

  async function registerBatch(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/batches", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicId:    selectedClinicId,
          itemId:      form.itemId,
          batchNumber: form.batchNumber,
          expiryDate:  form.expiryDate   || undefined,
          quantity:    Number(form.quantity),
          unitCost:    form.unitCost ? Number(form.unitCost) : undefined,
          supplierId:  form.supplierId   || undefined,
          receivedAt:  form.receivedAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error); return; }
      setLocalBatches((prev) => [data, ...prev]);
      setForm({ ...EMPTY_FORM });
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function switchClinic(id: string) {
    router.push(`/inventory/batches?clinicId=${id}`);
  }

  const filtered = localBatches.filter((b) => {
    const status = expiryStatus(b.expiryDate);
    if (filter !== "all" && status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        b.item.name.toLowerCase().includes(q) ||
        b.item.sku.toLowerCase().includes(q)  ||
        b.batchNumber.toLowerCase().includes(q) ||
        (b.supplier?.name.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const FILTERS: { key: Filter; label: string; count: number; cls: string }[] = [
    { key: "all",       label: "All",             count: localBatches.length,  cls: "bg-slate-100 text-slate-700" },
    { key: "expired",   label: "Expired",         count: summary.expired,      cls: "bg-red-100 text-red-700" },
    { key: "expiring30",label: "Expiring ≤30d",   count: summary.expiring30,   cls: "bg-red-50 text-red-600" },
    { key: "expiring90",label: "Expiring ≤90d",   count: summary.expiring90,   cls: "bg-amber-100 text-amber-700" },
    { key: "ok",        label: "OK (>90d)",       count: summary.ok,           cls: "bg-green-100 text-green-700" },
    { key: "noExpiry",  label: "No expiry",       count: summary.noExpiry,     cls: "bg-slate-100 text-slate-500" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">Stock Batches</h1>
          <p className="text-sm text-slate-500 mt-0.5">Traceability by batch, supplier and expiry date</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="form-input w-52"
            value={selectedClinicId}
            onChange={(e) => switchClinic(e.target.value)}
          >
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button type="button" onClick={() => setFormOpen((v) => !v)} className="btn-primary text-sm">
            {formOpen ? "Cancel" : "+ Register Batch"}
          </button>
        </div>
      </div>

      {/* Manual batch registration form */}
      {formOpen && (
        <form onSubmit={registerBatch} className="card p-5 mb-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Register Batch for Existing Stock</h2>
          <p className="text-xs text-slate-500">Use this to add batch/expiry traceability to stock that was received before batch tracking was enabled. This does not change the stock quantity.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Item *</label>
              <select required className="form-input" value={form.itemId} onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))}>
                <option value="">Select item…</option>
                {stockItems.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Batch Number *</label>
              <input required className="form-input font-mono" value={form.batchNumber} onChange={(e) => setForm((f) => ({ ...f, batchNumber: e.target.value }))} placeholder="e.g. BT-2025-01" />
            </div>
            <div>
              <label className="form-label">Expiry Date</label>
              <input type="date" className="form-input" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Quantity *</label>
              <input required type="number" min="1" className="form-input" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Unit Cost (RM)</label>
              <input type="number" step="0.01" min="0" className="form-input" value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} placeholder="Leave blank to use avg cost" />
            </div>
            <div>
              <label className="form-label">Supplier</label>
              <select className="form-input" value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}>
                <option value="">Unknown / N/A</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Received Date</label>
              <input type="date" className="form-input" value={form.receivedAt} onChange={(e) => setForm((f) => ({ ...f, receivedAt: e.target.value }))} />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "Saving…" : "Register Batch"}</button>
            <button type="button" onClick={() => setFormOpen(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-3 text-left transition-all border-2 ${
              filter === f.key ? "border-blue-500" : "border-transparent"
            } ${f.cls}`}
          >
            <div className="text-2xl font-bold">{f.count}</div>
            <div className="text-xs font-medium mt-0.5">{f.label}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          className="form-input w-full max-w-sm"
          placeholder="Search item, SKU, batch no. or supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Item", "SKU", "Category", "Batch No.", "Supplier", "Received", "Expiry", "Qty", "Remaining", "Unit Cost"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                  No batches match your filter.
                </td>
              </tr>
            )}
            {filtered.map((b) => {
              const status = expiryStatus(b.expiryDate);
              const rowCls = status === "expired"    ? "bg-red-50"
                           : status === "expiring30" ? "bg-red-50/50"
                           : status === "expiring90" ? "bg-amber-50/50"
                           : "";
              return (
                <tr key={b.id} className={`table-row ${rowCls}`}>
                  <td className="px-4 py-3 font-medium text-slate-800">{b.item.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{b.item.sku}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{b.item.category}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{b.batchNumber}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{b.supplier?.name ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {format(new Date(b.receivedAt), "d MMM yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <ExpiryCell date={b.expiryDate} />
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{b.quantity} {b.item.unit}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{b.remainingQty} {b.item.unit}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmt(b.unitCost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
