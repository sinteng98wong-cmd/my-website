"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────

type Clinic   = { id: string; name: string };
type DOLine   = {
  id: string; quantity: number; receivedQty: number | null; unitCost: string;
  item: { name: string; sku: string; unit: string; category: string };
};
type DORecord = {
  id: string; doRef: string; receivedAt: string | null;
  toClinicId: string;
  fromClinic: { name: string }; toClinic: { name: string };
  lines: DOLine[];
};
type POLine = {
  id: string; quantity: number; receivedQty: number | null; unitCost: string;
  item: { id: string; name: string; sku: string; unit: string; category: string };
};
type PORecord = {
  id: string; poRef: string; receivedAt: string | null;
  clinic: { id: string; name: string };
  supplier: { id: string; name: string };
  lines: POLine[];
};

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

// ── Mode selector ──────────────────────────────────────────────────────────

type Mode = "INTERNAL" | "SUPPLIER";

export default function RecordStockInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // If arriving from PO detail page, pre-select supplier mode + poId
  const prefillPoId = searchParams.get("poId");
  const [mode, setMode] = useState<Mode>(prefillPoId ? "SUPPLIER" : "INTERNAL");

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/inventory/stock-invoices" className="text-slate-500 hover:text-slate-700 text-sm">
          ← Stock Invoices
        </Link>
        <h1 className="page-title">Record Stock Invoice</h1>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          type="button"
          onClick={() => setMode("INTERNAL")}
          className={`p-4 rounded-lg border-2 text-left transition-colors ${
            mode === "INTERNAL" ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <p className="font-semibold text-sm text-slate-800">Internal Transfer</p>
          <p className="text-xs text-slate-500 mt-1">
            Invoice for stock received from another branch (Delivery Orders)
          </p>
        </button>
        <button
          type="button"
          onClick={() => setMode("SUPPLIER")}
          className={`p-4 rounded-lg border-2 text-left transition-colors ${
            mode === "SUPPLIER" ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <p className="font-semibold text-sm text-slate-800 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-400" />
            Supplier Invoice
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Invoice from an external supplier against a Purchase Order
          </p>
        </button>
      </div>

      {mode === "INTERNAL" && <InternalInvoiceForm />}
      {mode === "SUPPLIER" && <SupplierInvoiceForm prefillPoId={prefillPoId} />}
    </div>
  );
}

// ── INTERNAL: DO-based invoice ─────────────────────────────────────────────

function InternalInvoiceForm() {
  const router = useRouter();
  const [clinics, setClinics]     = useState<Clinic[]>([]);
  const [branchId, setBranchId]   = useState("");
  const [month, setMonth]         = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [dos, setDos]             = useState<DORecord[]>([]);
  const [loadingDOs, setLoadingDOs] = useState(false);
  const [invoiceRef, setInvoiceRef] = useState("");
  // editable prices: lineId → overridden unit cost
  const [pricEdits, setPriceEdits] = useState<Record<string, number>>({});
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clinics").then((r) => r.json()).then((clinics: Clinic[]) => {
      setClinics(clinics);
      const match = document.cookie.match(/(?:^|;\s*)selected_clinic=([^;]+)/);
      const id = match?.[1];
      if (id && id !== "all") { const c = clinics.find((x) => x.id === id); if (c) setBranchId(c.id); }
      else if (clinics.length === 1) setBranchId(clinics[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!branchId) { setDos([]); return; }
    setLoadingDOs(true);
    fetch(`/api/delivery-orders?status=RECEIVED&clinicId=${branchId}&uninvoiced=1`)
      .then((r) => r.json())
      .then((all: any[]) => {
        const filtered = all.filter((d) => d.toClinicId === branchId);
        setDos(filtered);
        // Initialise price edits from existing unit costs
        const edits: Record<string, number> = {};
        for (const do_ of filtered) for (const l of do_.lines) edits[l.id] = Number(l.unitCost);
        setPriceEdits(edits);
      })
      .catch(() => {})
      .finally(() => setLoadingDOs(false));
  }, [branchId]);

  const allLines = useMemo(() => dos.flatMap((d) => d.lines), [dos]);
  const subtotal = allLines.reduce((s, l) => s + (l.receivedQty ?? l.quantity) * (pricEdits[l.id] ?? Number(l.unitCost)), 0);

  const grouped = useMemo(() => {
    const byDate: Record<string, { doRef: string; doId: string; category: string; lines: DOLine[] }[]> = {};
    for (const do_ of dos) {
      const dateKey = do_.receivedAt ? format(parseISO(do_.receivedAt), "d MMM yyyy (EEE)") : "Unknown Date";
      const byCat: Record<string, DOLine[]> = {};
      for (const l of do_.lines) {
        if (!byCat[l.item.category]) byCat[l.item.category] = [];
        byCat[l.item.category].push(l);
      }
      if (!byDate[dateKey]) byDate[dateKey] = [];
      for (const [cat, lines] of Object.entries(byCat))
        byDate[dateKey].push({ doRef: do_.doRef, doId: do_.id, category: cat, lines });
    }
    return byDate;
  }, [dos]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceRef.trim()) { setError("Invoice number is required."); return; }
    if (dos.length === 0)   { setError("No received delivery orders for this branch."); return; }
    setError(null); setLoading(true);
    try {
      // Build line updates only where price changed
      const lineUpdates = allLines
        .filter((l) => Math.abs((pricEdits[l.id] ?? Number(l.unitCost)) - Number(l.unitCost)) > 0.001)
        .map((l) => ({ lineId: l.id, invoicedUnitCost: pricEdits[l.id] }));

      const res = await fetch("/api/stock-invoices", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "INTERNAL",
          invoiceRef: invoiceRef.trim(),
          month,
          toClinicId: branchId,
          doIds:      dos.map((d) => d.id),
          sst:        0,
          lineUpdates: lineUpdates.length ? lineUpdates : undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      const data = await res.json();
      router.push(`/inventory/stock-invoices/${data.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      {/* Step 1 */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-800">Step 1 — Select Branch &amp; Month</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Receiving Branch</label>
            <select className="input" required value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Select branch…</option>
              {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Month</label>
            <input type="month" className="input" required value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Step 2 — DOs with editable prices */}
      {branchId && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">
              Step 2 — Review &amp; Confirm Prices
            </h2>
            <span className="text-xs text-slate-400">{dos.length} delivery order{dos.length !== 1 ? "s" : ""}</span>
          </div>

          {loadingDOs && <p className="px-5 py-6 text-sm text-slate-400 text-center">Loading…</p>}
          {!loadingDOs && dos.length === 0 && <p className="px-5 py-6 text-sm text-slate-400 text-center">No received deliveries pending invoice.</p>}

          {!loadingDOs && Object.entries(grouped).map(([date, groups]) => (
            <div key={date}>
              <div className="px-5 py-2 bg-slate-50 border-b border-t border-slate-200 flex justify-between">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{date}</span>
              </div>
              {groups.map((g, gi) => (
                <div key={`${g.doRef}-${gi}`}>
                  <div className="px-6 py-1.5 bg-white border-b border-slate-100 flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-500">{g.category}</span>
                    <span className="text-xs text-slate-300">{g.doRef}</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="pl-8 pr-4 py-1.5 text-left text-slate-400 font-medium">Item</th>
                        <th className="px-4 py-1.5 text-center text-slate-400 font-medium">Qty</th>
                        <th className="px-4 py-1.5 text-right text-slate-400 font-medium">Unit Price (RM)</th>
                        <th className="px-4 py-1.5 text-right text-slate-400 font-medium">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.lines.map((l) => {
                        const qty   = l.receivedQty ?? l.quantity;
                        const price = pricEdits[l.id] ?? Number(l.unitCost);
                        const changed = Math.abs(price - Number(l.unitCost)) > 0.001;
                        return (
                          <tr key={l.id} className={`border-b border-slate-50 ${changed ? "bg-amber-50" : ""}`}>
                            <td className="pl-8 pr-4 py-1.5 text-slate-700">
                              {l.item.name}
                              <span className="text-slate-400 ml-1">{l.item.sku}</span>
                            </td>
                            <td className="px-4 py-1.5 text-center text-slate-600">{qty} {l.item.unit}</td>
                            <td className="px-4 py-1.5 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className={`w-24 border rounded px-1.5 py-0.5 text-right text-xs ${changed ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}
                                value={price}
                                onChange={(e) => setPriceEdits((p) => ({ ...p, [l.id]: parseFloat(e.target.value) || 0 }))}
                              />
                              {changed && <span className="text-amber-600 ml-1" title={`Was ${fmt(Number(l.unitCost))}`}>✎</span>}
                            </td>
                            <td className="px-4 py-1.5 text-right font-medium text-slate-700">{fmt(qty * price)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}

          {!loadingDOs && dos.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-8">
              <span className="text-sm text-slate-500">Subtotal: <strong className="text-slate-800">{fmt(subtotal)}</strong></span>
            </div>
          )}
        </div>
      ))}
        </div>
      )}

      {/* Step 3 */}
      {dos.length > 0 && (
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Step 3 — Invoice Details</h2>
          <div>
            <label className="label">Invoice Number *</label>
            <input type="text" className="input font-mono" placeholder="e.g. INV-2026-0042" required
              value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} />
            <p className="text-xs text-slate-400 mt-1">From your accounting system</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 flex justify-between items-center">
            <div className="text-sm text-slate-500">Total amount to match invoice</div>
            <div className="text-2xl font-bold text-blue-700">{fmt(subtotal)}</div>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={loading || dos.length === 0 || !invoiceRef.trim()} className="btn-primary disabled:opacity-50">
          {loading ? "Saving…" : "Save Invoice Record"}
        </button>
        <Link href="/inventory/stock-invoices" className="btn-secondary">Cancel</Link>
      </div>
    </form>
  );
}

// ── SUPPLIER: PO-based invoice ─────────────────────────────────────────────

function SupplierInvoiceForm({ prefillPoId }: { prefillPoId: string | null }) {
  const router = useRouter();
  const [pos, setPos]             = useState<PORecord[]>([]);
  const [loadingPOs, setLoadingPOs] = useState(true);
  const [selectedPoId, setSelectedPoId] = useState(prefillPoId ?? "");
  const [invoiceRef, setInvoiceRef]   = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth]             = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  // editable prices per PO line
  const [priceEdits, setPriceEdits] = useState<Record<string, number>>({});
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/purchase-orders/uninvoiced")
      .then((r) => r.json())
      .then((data: PORecord[]) => {
        setPos(data);
        // Init prices for prefilled PO
        if (prefillPoId) {
          const po = data.find((p) => p.id === prefillPoId);
          if (po) {
            const edits: Record<string, number> = {};
            for (const l of po.lines) edits[l.id] = Number(l.unitCost);
            setPriceEdits(edits);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPOs(false));
  }, [prefillPoId]);

  const selectedPO = pos.find((p) => p.id === selectedPoId);

  function selectPO(poId: string) {
    setSelectedPoId(poId);
    const po = pos.find((p) => p.id === poId);
    if (po) {
      const edits: Record<string, number> = {};
      for (const l of po.lines) edits[l.id] = Number(l.unitCost);
      setPriceEdits(edits);
    }
  }

  const subtotal = selectedPO
    ? selectedPO.lines.reduce((s, l) => {
        const qty   = l.receivedQty ?? l.quantity;
        const price = priceEdits[l.id] ?? Number(l.unitCost);
        return s + qty * price;
      }, 0)
    : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPO) { setError("Select a Purchase Order."); return; }
    if (!invoiceRef.trim()) { setError("Invoice number is required."); return; }
    setError(null); setLoading(true);
    try {
      const lineUpdates = selectedPO.lines.map((l) => ({
        lineId:           l.id,
        invoicedUnitCost: priceEdits[l.id] ?? Number(l.unitCost),
      }));

      const res = await fetch("/api/stock-invoices", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source:          "SUPPLIER",
          invoiceRef:      invoiceRef.trim(),
          month,
          purchaseOrderId: selectedPO.id,
          supplierId:      selectedPO.supplier.id,
          invoiceDate,
          sst:             0,
          lineUpdates,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      const data = await res.json();
      router.push(`/inventory/stock-invoices/${data.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      {/* Step 1 — Select PO */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-slate-800">Step 1 — Select Purchase Order</h2>
        {loadingPOs ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : pos.length === 0 ? (
          <div className="text-sm text-slate-500 bg-slate-50 rounded p-4">
            No received Purchase Orders pending invoice.{" "}
            <Link href="/inventory/purchase-orders" className="text-blue-600 underline">View Purchase Orders</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {pos.map((po) => (
              <button
                key={po.id}
                type="button"
                onClick={() => selectPO(po.id)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                  selectedPoId === po.id ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono font-semibold text-slate-800">{po.poRef}</p>
                    <p className="text-sm text-violet-700 font-medium mt-0.5">{po.supplier.name}</p>
                    <p className="text-xs text-slate-500">Receiving: {po.clinic.name}</p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {po.lines.length} item{po.lines.length !== 1 ? "s" : ""}
                    {po.receivedAt && <div>{format(new Date(po.receivedAt), "d MMM yyyy")}</div>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Step 2 — Line items with editable prices */}
      {selectedPO && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">
              Step 2 — Confirm Invoiced Prices
            </h2>
            <p className="text-xs text-slate-400">
              Edit each price to match the supplier's invoice exactly
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Category</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Qty Received</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">PO Price</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Invoice Price ✎</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {selectedPO.lines.map((l) => {
                const qty      = l.receivedQty ?? l.quantity;
                const poPx     = Number(l.unitCost);
                const invPx    = priceEdits[l.id] ?? poPx;
                const changed  = Math.abs(invPx - poPx) > 0.001;
                return (
                  <tr key={l.id} className={`table-row ${changed ? "bg-amber-50" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{l.item.name}</p>
                      <p className="text-xs text-slate-400">{l.item.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{l.item.category}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{qty} {l.item.unit}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{fmt(poPx)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`w-28 border rounded px-2 py-1 text-right text-sm ${changed ? "border-amber-400 bg-amber-50 font-medium" : "border-slate-200"}`}
                          value={invPx}
                          onChange={(e) => setPriceEdits((p) => ({ ...p, [l.id]: parseFloat(e.target.value) || 0 }))}
                        />
                        {changed && (
                          <span className="text-xs text-amber-600 font-medium" title="Price differs from PO">
                            {invPx > poPx ? "▲" : "▼"}
                          </span>
                        )}
                      </div>
                      {changed && (
                        <p className="text-xs text-amber-600 mt-0.5 text-right">
                          Δ {fmt(invPx - poPx)} / unit · stock cost will update
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{fmt(qty * invPx)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-8">
            <span className="text-sm text-slate-500">Subtotal: <strong className="text-slate-800">{fmt(subtotal)}</strong></span>
          </div>
        </div>
      )}

      {/* Step 3 — Invoice details */}
      {selectedPO && (
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Step 3 — Invoice Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Supplier Invoice Number *</label>
              <input type="text" className="input font-mono" placeholder="e.g. SUP-INV-00123" required
                value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} />
              <p className="text-xs text-slate-400 mt-1">As printed on the supplier's invoice</p>
            </div>
            <div>
              <label className="label">Invoice Date *</label>
              <input type="date" className="input" required
                value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              <p className="text-xs text-slate-400 mt-1">Date on the supplier's invoice document</p>
            </div>
            <div>
              <label className="label">Month (for ledger grouping)</label>
              <input type="month" className="input" required value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          </div>
          <div className="bg-violet-50 border border-violet-100 rounded-lg p-4 flex justify-between items-center">
            <div className="text-sm text-violet-700">
              <span className="font-medium">{selectedPO.supplier.name}</span>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 uppercase tracking-wide">Invoice Total</div>
              <div className="text-2xl font-bold text-violet-700">{fmt(subtotal)}</div>
            </div>
          </div>
          <p className="text-xs text-slate-500 bg-slate-50 rounded px-3 py-2">
            Confirming this invoice will update the stock average cost for any items where the invoiced price differs from the PO price.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={loading || !selectedPO || !invoiceRef.trim()} className="btn-primary disabled:opacity-50">
          {loading ? "Saving…" : "Confirm & Save Supplier Invoice"}
        </button>
        <Link href="/inventory/stock-invoices" className="btn-secondary">Cancel</Link>
      </div>
    </form>
  );
}
