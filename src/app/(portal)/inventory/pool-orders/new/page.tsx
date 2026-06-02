"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Clinic = { id: string; name: string };
type StockItem = { id: string; name: string; sku: string; unit: string; category: string };

type LineItem = {
  itemId: string;
  itemName: string;
  totalQty: number;
  unitCost: number;
};

type InitiatorItem = {
  itemId: string;
  itemName: string;
  requestedQty: number;
  unitCost: number;
};

export default function NewPoolOrderPage() {
  const router = useRouter();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [supplierName, setSupplierName] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"CENTRALISED" | "DIRECT">("CENTRALISED");
  const [moqTarget, setMoqTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [initiatingClinicId, setInitiatingClinicId] = useState("");
  const [lines, setLines] = useState<LineItem[]>([]);
  const [initiatorItems, setInitiatorItems] = useState<InitiatorItem[]>([]);
  const [itemSearch, setItemSearch] = useState("");

  useEffect(() => {
    fetch("/api/clinics").then((r) => r.json()).then(setClinics).catch(() => {});
    fetch("/api/inventory/items").then((r) => r.json()).then(setStockItems).catch(() => {});
  }, []);

  const filteredItems = stockItems.filter(
    (i) =>
      !lines.some((l) => l.itemId === i.id) &&
      (i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
        i.sku.toLowerCase().includes(itemSearch.toLowerCase()))
  );

  function addPoolLine(item: StockItem) {
    setLines((prev) => [...prev, { itemId: item.id, itemName: item.name, totalQty: 1, unitCost: 0 }]);
    setInitiatorItems((prev) => [...prev, { itemId: item.id, itemName: item.name, requestedQty: 0, unitCost: 0 }]);
    setItemSearch("");
  }

  function removePoolLine(itemId: string) {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));
    setInitiatorItems((prev) => prev.filter((l) => l.itemId !== itemId));
  }

  const poolTotal = lines.reduce((s, l) => s + l.totalQty * l.unitCost, 0);
  const initiatorTotal = initiatorItems.reduce((s, i) => s + i.requestedQty * i.unitCost, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/pool-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName,
          deliveryMode,
          moqTarget: parseFloat(moqTarget),
          deadline: deadline ? new Date(deadline).toISOString() : undefined,
          notes: notes || undefined,
          initiatingClinicId,
          lines: lines.map((l) => ({ itemId: l.itemId, totalQty: l.totalQty, unitCost: l.unitCost })),
          initiatorItems: initiatorItems
            .filter((i) => i.requestedQty > 0)
            .map((i) => ({ itemId: i.itemId, requestedQty: i.requestedQty, unitCost: i.unitCost })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create pool order");
      }
      const data = await res.json();
      router.push(`/inventory/pool-orders/${data.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/inventory/pool-orders" className="text-slate-500 hover:text-slate-700 text-sm">
          ← Pool Orders
        </Link>
        <h1 className="page-title">New Pool Order</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Order Details</h2>

          <div>
            <label className="label">Initiating Clinic</label>
            <select
              className="input"
              value={initiatingClinicId}
              onChange={(e) => setInitiatingClinicId(e.target.value)}
              required
            >
              <option value="">Select clinic…</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Supplier Name</label>
            <input
              className="input"
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="e.g. DentSupply Sdn Bhd"
              required
            />
          </div>

          <div>
            <label className="label">Delivery Mode</label>
            <div className="space-y-2 mt-1">
              {(["CENTRALISED", "DIRECT"] as const).map((mode) => (
                <label key={mode} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="deliveryMode"
                    value={mode}
                    checked={deliveryMode === mode}
                    onChange={() => setDeliveryMode(mode)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    <span className="font-medium">
                      {mode === "CENTRALISED" ? "Centralised" : "Direct"}
                    </span>
                    <span className="text-slate-500 ml-2">
                      {mode === "CENTRALISED"
                        ? "— we receive stock and distribute to branches"
                        : "— supplier delivers to each clinic separately"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">MOQ Target (RM)</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={moqTarget}
                onChange={(e) => setMoqTarget(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Deadline (optional)</label>
              <input
                className="input"
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">
                Leave blank for open-ended pool. Clinics will be reminded 48 hours before deadline.
              </p>
            </div>
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <textarea
              className="input min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes for participants…"
            />
          </div>
        </div>

        {/* Pool Items */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Pool Items</h2>

          <div className="flex gap-2">
            <input
              className="input flex-1"
              type="text"
              placeholder="Search item by name or SKU…"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
            />
          </div>

          {itemSearch && filteredItems.length > 0 && (
            <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
              {filteredItems.slice(0, 20).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addPoolLine(item)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 border-b last:border-0"
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-slate-400 ml-2 text-xs">{item.sku}</span>
                </button>
              ))}
            </div>
          )}

          {lines.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase border-b">
                  <th className="text-left py-2">Item</th>
                  <th className="text-right py-2 w-28">Total Qty</th>
                  <th className="text-right py-2 w-32">Unit Cost (RM)</th>
                  <th className="text-right py-2 w-32">Line Total</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.itemId} className="border-b last:border-0">
                    <td className="py-2">{l.itemName}</td>
                    <td className="py-2">
                      <input
                        type="number"
                        min="1"
                        className="input text-right w-full"
                        value={l.totalQty}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 1;
                          setLines((prev) => prev.map((x, j) => j === i ? { ...x, totalQty: v } : x));
                          setInitiatorItems((prev) => prev.map((x) => x.itemId === l.itemId ? { ...x, unitCost: l.unitCost } : x));
                        }}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input text-right w-full"
                        value={l.unitCost}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          setLines((prev) => prev.map((x, j) => j === i ? { ...x, unitCost: v } : x));
                          setInitiatorItems((prev) => prev.map((x) => x.itemId === l.itemId ? { ...x, unitCost: v } : x));
                        }}
                      />
                    </td>
                    <td className="py-2 text-right text-slate-700">
                      RM {(l.totalQty * l.unitCost).toFixed(2)}
                    </td>
                    <td className="py-2 text-center">
                      <button type="button" onClick={() => removePoolLine(l.itemId)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-2 text-right font-medium text-slate-600">Pool Total:</td>
                  <td className="py-2 text-right font-bold text-slate-900">RM {poolTotal.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}

          {lines.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">Search and add items above</p>
          )}
        </div>

        {/* Initiator's own order */}
        {lines.length > 0 && initiatingClinicId && (
          <div className="card p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-slate-800">Your Clinic's Order</h2>
              <p className="text-sm text-slate-500 mt-1">
                Your clinic is automatically joined as a participant. Enter your requested quantities below.
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase border-b">
                  <th className="text-left py-2">Item</th>
                  <th className="text-right py-2 w-32">Your Qty</th>
                  <th className="text-right py-2 w-32">Unit Cost</th>
                  <th className="text-right py-2 w-32">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {initiatorItems.map((item, i) => (
                  <tr key={item.itemId} className="border-b last:border-0">
                    <td className="py-2">{item.itemName}</td>
                    <td className="py-2">
                      <input
                        type="number"
                        min="0"
                        className="input text-right w-full"
                        value={item.requestedQty}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 0;
                          setInitiatorItems((prev) => prev.map((x, j) => j === i ? { ...x, requestedQty: v } : x));
                        }}
                      />
                    </td>
                    <td className="py-2 text-right text-slate-500 text-xs">
                      RM {item.unitCost.toFixed(2)}
                    </td>
                    <td className="py-2 text-right text-slate-700">
                      RM {(item.requestedQty * item.unitCost).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-2 text-right font-medium text-slate-600">Your Subtotal:</td>
                  <td className="py-2 text-right font-bold text-slate-900">RM {initiatorTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={loading || lines.length === 0} className="btn-primary disabled:opacity-50">
            {loading ? "Creating…" : "Create Pool Order"}
          </button>
          <Link href="/inventory/pool-orders" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
