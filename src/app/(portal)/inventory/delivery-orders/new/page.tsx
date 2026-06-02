"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Clinic = { id: string; name: string };
type StockItem = { id: string; name: string; sku: string; unit: string; category: string };
type ClinicStock = { itemId: string; quantity: number; avgUnitCost?: number | null };

type LineItem = {
  itemId: string;
  itemName: string;
  itemUnit: string;
  quantity: number;
  unitCost: number;
  availableStock: number | null;
};

// direction: "outbound" = I am sending stock to another clinic
//            "inbound"  = I am requesting stock from another clinic
type Direction = "outbound" | "inbound";

export default function NewDeliveryOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillItemId = searchParams.get("itemId");

  const [allClinics, setAllClinics] = useState<Clinic[]>([]);
  const [myClinics, setMyClinics] = useState<Clinic[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);

  // direction controls which clinic is "from" vs "to"
  const [direction, setDirection] = useState<Direction>("inbound"); // default: request from another branch
  const [myClinicId, setMyClinicId] = useState("");        // the user's own clinic
  const [otherClinicId, setOtherClinicId] = useState(""); // the other clinic

  const fromClinicId = direction === "outbound" ? myClinicId : otherClinicId;
  const toClinicId   = direction === "outbound" ? otherClinicId : myClinicId;

  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [clinicStock, setClinicStock] = useState<ClinicStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clinics").then((r) => r.json()).then((clinics: Clinic[]) => {
      setAllClinics(clinics);
    }).catch(() => {});

    fetch("/api/me/clinics").then((r) => r.json()).then((clinics: Clinic[]) => {
      setMyClinics(clinics);
      if (clinics.length === 1) setMyClinicId(clinics[0].id);
    }).catch(() => {
      // fallback: use all clinics list if /api/me/clinics doesn't exist
      fetch("/api/clinics").then((r) => r.json()).then((clinics: Clinic[]) => {
        setMyClinics(clinics);
      }).catch(() => {});
    });

    fetch("/api/inventory/items").then((r) => r.json()).then((items: StockItem[]) => {
      setStockItems(items);
      if (prefillItemId) {
        const item = items.find((i) => i.id === prefillItemId);
        if (item) addLine(item, null);
      }
    }).catch(() => {});
  }, [prefillItemId]);

  // Load stock levels for the FROM clinic (so we can show availability)
  useEffect(() => {
    if (!fromClinicId) { setClinicStock([]); return; }
    fetch(`/api/inventory/stock?clinicId=${fromClinicId}`)
      .then((r) => r.json())
      .then((data: any[]) => setClinicStock(data.map((cs) => ({ itemId: cs.itemId, quantity: cs.quantity, avgUnitCost: cs.avgUnitCost ?? null }))))
      .catch(() => {});
  }, [fromClinicId]);

  function getStock(itemId: string) {
    return clinicStock.find((cs) => cs.itemId === itemId)?.quantity ?? null;
  }

  function getAvgCost(itemId: string) {
    return clinicStock.find((cs) => cs.itemId === itemId)?.avgUnitCost ?? 0;
  }

  function addLine(item: StockItem, stock: number | null) {
    setLines((prev) => {
      if (prev.some((l) => l.itemId === item.id)) return prev;
      // Default unit cost to from-branch average cost (no inter-branch profit)
      const defaultCost = getAvgCost(item.id);
      return [...prev, { itemId: item.id, itemName: item.name, itemUnit: item.unit, quantity: 1, unitCost: defaultCost, availableStock: stock }];
    });
    setItemSearch("");
  }

  const filteredItems = stockItems.filter(
    (i) =>
      !lines.some((l) => l.itemId === i.id) &&
      (i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
        i.sku.toLowerCase().includes(itemSearch.toLowerCase()))
  );

  const total = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

  const otherClinics = allClinics.filter((c) => c.id !== myClinicId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromClinicId || !toClinicId) { setError("Please select both clinics."); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/delivery-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromClinicId,
          toClinicId,
          notes: notes || undefined,
          lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitCost: l.unitCost })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create delivery order");
      }
      const data = await res.json();
      router.push(`/inventory/delivery-orders/${data.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/inventory/delivery-orders" className="text-slate-500 hover:text-slate-700 text-sm">
          ← Delivery Orders
        </Link>
        <h1 className="page-title">New Delivery Order</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-6 space-y-5">
          <h2 className="font-semibold text-slate-800">Direction</h2>

          {/* Direction toggle */}
          <div className="grid grid-cols-2 gap-3">
            {(["inbound", "outbound"] as Direction[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  direction === d
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className="font-semibold text-sm text-slate-800">
                  {d === "inbound" ? "📥 Request stock" : "📤 Send stock"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {d === "inbound"
                    ? "I need stock from another branch"
                    : "I am sending stock to another branch"}
                </p>
              </button>
            ))}
          </div>

          {/* Clinic selectors */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">My Clinic</label>
              <select
                className="input"
                value={myClinicId}
                onChange={(e) => setMyClinicId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {myClinics.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                {direction === "inbound" ? "Receiving clinic (you)" : "Sending clinic (you)"}
              </p>
            </div>

            <div>
              <label className="label">
                {direction === "inbound" ? "Request from" : "Send to"}
              </label>
              <select
                className="input"
                value={otherClinicId}
                onChange={(e) => setOtherClinicId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {otherClinics.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                {direction === "inbound"
                  ? "Their manager will approve & dispatch"
                  : "They will confirm receipt"}
              </p>
            </div>
          </div>

          {/* Summary arrow */}
          {fromClinicId && toClinicId && (
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg text-sm">
              <span className="font-medium text-slate-700">
                {allClinics.find((c) => c.id === fromClinicId)?.name ?? "—"}
              </span>
              <span className="text-slate-400 text-lg">→</span>
              <span className="font-medium text-slate-700">
                {allClinics.find((c) => c.id === toClinicId)?.name ?? "—"}
              </span>
              {direction === "inbound" && (
                <span className="ml-auto text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                  Awaits approval from {allClinics.find((c) => c.id === fromClinicId)?.name}
                </span>
              )}
            </div>
          )}

          <div>
            <label className="label">Notes (optional)</label>
            <textarea
              className="input min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for request, urgency, etc."
            />
          </div>
        </div>

        {/* Items */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Items</h2>

          <div>
            <input
              className="input"
              type="text"
              placeholder="Search item by name or SKU…"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
            />
            {itemSearch && filteredItems.length > 0 && (
              <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto mt-1">
                {filteredItems.slice(0, 20).map((item) => {
                  const stock = getStock(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addLine(item, stock)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 border-b last:border-0 flex justify-between items-center"
                    >
                      <span>
                        <span className="font-medium">{item.name}</span>
                        <span className="text-slate-400 ml-2 text-xs">{item.sku}</span>
                      </span>
                      {fromClinicId && (
                        <span className={`text-xs ml-4 shrink-0 ${
                          stock === null ? "text-slate-300"
                          : stock === 0 ? "text-red-500 font-medium"
                          : stock < 5 ? "text-amber-500"
                          : "text-slate-400"
                        }`}>
                          {stock === null ? "—" : `Stock: ${stock}`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase border-b">
                  <th className="text-left py-2">Item</th>
                  <th className="text-right py-2 w-28">Qty</th>
                  <th className="text-right py-2 w-32">Unit Cost (RM)</th>
                  <th className="text-right py-2 w-32">Line Total</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const overStock = l.availableStock !== null && l.quantity > l.availableStock;
                  return (
                    <tr key={l.itemId} className={`border-b last:border-0 ${overStock ? "bg-amber-50" : ""}`}>
                      <td className="py-2">
                        <span>{l.itemName}</span>
                        {fromClinicId && l.availableStock !== null && (
                          <span className={`ml-2 text-xs ${overStock ? "text-amber-600 font-medium" : "text-slate-400"}`}>
                            (Available: {l.availableStock}{overStock ? " ⚠ over stock" : ""})
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        <input
                          type="number" min="1" className="input text-right w-full"
                          value={l.quantity}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 1;
                            setLines((prev) => prev.map((x, j) => j === i ? { ...x, quantity: v } : x));
                          }}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number" min="0" step="0.01" className="input text-right w-full"
                          value={l.unitCost}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            setLines((prev) => prev.map((x, j) => j === i ? { ...x, unitCost: v } : x));
                          }}
                        />
                      </td>
                      <td className="py-2 text-right text-slate-700">
                        RM {(l.quantity * l.unitCost).toFixed(2)}
                      </td>
                      <td className="py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                          className="text-red-400 hover:text-red-600 text-xs"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-2 text-right font-medium text-slate-600">Total:</td>
                  <td className="py-2 text-right font-bold text-slate-900">RM {total.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}

          {lines.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">Search and add items above</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || lines.length === 0 || !myClinicId || !otherClinicId}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create Delivery Order"}
          </button>
          <Link href="/inventory/delivery-orders" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
