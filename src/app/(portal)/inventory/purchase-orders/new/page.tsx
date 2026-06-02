"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Clinic    = { id: string; name: string };
type Supplier  = { id: string; name: string; code: string | null };
type StockItem = { id: string; name: string; sku: string; unit: string; category: string };
type Line      = { itemId: string; name: string; unit: string; quantity: number; unitCost: number };

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();

  const [clinics,    setClinics]    = useState<Clinic[]>([]);
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);

  const [clinicId,     setClinicId]     = useState("");
  const [supplierId,   setSupplierId]   = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes,        setNotes]        = useState("");
  const [lines,        setLines]        = useState<Line[]>([]);
  const [itemSearch,   setItemSearch]   = useState("");
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clinics").then((r) => r.json()).then(setClinics).catch(() => {});
    fetch("/api/inventory/suppliers").then((r) => r.json()).then(setSuppliers).catch(() => {});
    fetch("/api/inventory/items").then((r) => r.json()).then(setStockItems).catch(() => {});
    // Auto-detect clinic from cookie
    const match = document.cookie.match(/(?:^|;\s*)selected_clinic=([^;]+)/);
    const cookieId = match?.[1];
    if (cookieId && cookieId !== "all") setClinicId(cookieId);
  }, []);

  const filteredItems = stockItems.filter(
    (i) =>
      !lines.some((l) => l.itemId === i.id) &&
      (i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
       i.sku.toLowerCase().includes(itemSearch.toLowerCase()))
  );

  function addLine(item: StockItem) {
    setLines((prev) => [...prev, { itemId: item.id, name: item.name, unit: item.unit, quantity: 1, unitCost: 0 }]);
    setItemSearch("");
  }

  const total = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicId || !supplierId || lines.length === 0) {
      setError("Branch, supplier and at least one item are required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/purchase-orders", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId, supplierId, expectedDate: expectedDate || undefined, notes, lines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push(`/inventory/purchase-orders/${data.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/inventory/purchase-orders" className="text-slate-500 hover:text-slate-700 text-sm">
          ← Purchase Orders
        </Link>
        <h1 className="page-title">New Purchase Order</h1>
      </div>

      <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg text-xs text-violet-700">
        <span className="w-2 h-2 rounded-full bg-violet-400" />
        External supplier order — stock received directly from supplier
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Order Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Receiving Branch *</label>
              <select className="input" required value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
                <option value="">Select branch…</option>
                {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Supplier *</label>
              <select className="input" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier…</option>
                {suppliers.filter((s: any) => s.active !== false).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                Not listed?{" "}
                <Link href="/inventory/suppliers" className="underline text-blue-600">Add supplier</Link>
              </p>
            </div>
            <div>
              <label className="label">Expected Delivery Date</label>
              <input type="date" className="input" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Notes</label>
              <input type="text" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special instructions…" />
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Items</h2>
          <div>
            <input
              className="input"
              placeholder="Search item by name or SKU…"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
            />
            {itemSearch && filteredItems.length > 0 && (
              <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto mt-1">
                {filteredItems.slice(0, 20).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addLine(item)}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 border-b last:border-0 flex justify-between"
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="text-slate-400 text-xs">{item.sku} · {item.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase border-b">
                  <th className="text-left py-2">Item</th>
                  <th className="text-right py-2 w-24">Qty</th>
                  <th className="text-right py-2 w-32">Unit Cost (RM)</th>
                  <th className="text-right py-2 w-28">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.itemId} className="border-b last:border-0">
                    <td className="py-2 font-medium">{l.name}
                      <span className="ml-1 text-xs text-slate-400">{l.unit}</span>
                    </td>
                    <td className="py-2">
                      <input type="number" min="1" className="input text-right w-full"
                        value={l.quantity}
                        onChange={(e) => setLines((p) => p.map((x, j) => j === i ? { ...x, quantity: parseInt(e.target.value) || 1 } : x))} />
                    </td>
                    <td className="py-2">
                      <input type="number" min="0" step="0.01" className="input text-right w-full"
                        value={l.unitCost}
                        onChange={(e) => setLines((p) => p.map((x, j) => j === i ? { ...x, unitCost: parseFloat(e.target.value) || 0 } : x))} />
                    </td>
                    <td className="py-2 text-right">{fmt(l.quantity * l.unitCost)}</td>
                    <td className="py-2 text-center">
                      <button type="button" onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-2 text-right font-medium text-slate-600">Total:</td>
                  <td className="py-2 text-right font-bold text-slate-900">{fmt(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}

          {lines.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">Search and add items above</p>
          )}
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving || lines.length === 0} className="btn-primary disabled:opacity-50">
            {saving ? "Creating…" : "Create Purchase Order"}
          </button>
          <Link href="/inventory/purchase-orders" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
