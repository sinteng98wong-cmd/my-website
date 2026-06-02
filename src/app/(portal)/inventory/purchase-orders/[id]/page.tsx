"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";

const STATUS_CLASS: Record<string, string> = {
  DRAFT:     "badge-slate",
  SUBMITTED: "badge-amber",
  CONFIRMED: "badge-blue",
  PARTIAL:   "badge-indigo",
  RECEIVED:  "badge-green",
  INVOICED:  "badge-emerald",
  CANCELLED: "badge-red",
};

const STEPS = ["DRAFT", "SUBMITTED", "CONFIRMED", "RECEIVED", "INVOICED"];

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

function ExpiryBadge({ date }: { date: string }) {
  const days  = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
  const label = format(new Date(date), "d MMM yyyy");
  if (days < 0)    return <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Expired · {label}</span>;
  if (days <= 30)  return <span className="text-xs font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded">{days}d · {label}</span>;
  if (days <= 90)  return <span className="text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{days}d · {label}</span>;
  return <span className="text-xs text-slate-500">{label}</span>;
}

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [po, setPO]           = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [qtyEdits, setQtyEdits]     = useState<Record<string, number>>({});
  const [batchEdits, setBatchEdits] = useState<Record<string, string>>({});
  const [expiryEdits, setExpiryEdits] = useState<Record<string, string>>({});

  const fetchPO = useCallback(async () => {
    try {
      const res  = await fetch(`/api/purchase-orders/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setPO(data);
      const q: Record<string, number> = {};
      const b: Record<string, string> = {};
      const e: Record<string, string> = {};
      for (const l of data.lines) {
        q[l.id] = l.receivedQty ?? l.quantity;
        b[l.id] = l.batchNumber ?? "";
        e[l.id] = l.expiryDate ? l.expiryDate.slice(0, 10) : "";
      }
      setQtyEdits(q); setBatchEdits(b); setExpiryEdits(e);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchPO(); }, [fetchPO]);

  async function saveLineQty(lineId: string) {
    await fetch(`/api/purchase-orders/${id}/received-qty`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lineId,
        receivedQty: qtyEdits[lineId],
        batchNumber: batchEdits[lineId] || undefined,
        expiryDate:  expiryEdits[lineId] || undefined,
      }),
    });
  }

  async function changeStatus(status: string) {
    setActionBusy(true); setError(null);
    try {
      if (status === "RECEIVED" || status === "PARTIAL") {
        for (const lineId of Object.keys(qtyEdits)) await saveLineQty(lineId);
      }
      const res  = await fetch(`/api/purchase-orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      await fetchPO();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) return <div className="text-slate-400 p-8">Loading…</div>;
  if (!po)     return <div className="p-8 text-red-600">{error ?? "Not found"}</div>;

  const isReceiving = ["CONFIRMED", "PARTIAL", "SUBMITTED"].includes(po.status);
  const totalValue  = po.lines.reduce((s: number, l: any) => s + l.quantity * Number(l.unitCost), 0);
  const currentStep = STEPS.indexOf(po.status);

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/inventory/purchase-orders" className="text-slate-500 hover:text-slate-700 text-sm">
        ← Purchase Orders
      </Link>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-slate-900">{po.poRef}</h1>
              <span className={STATUS_CLASS[po.status] ?? "badge-slate"}>{po.status}</span>
              {/* Source badge */}
              <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                External Supplier
              </span>
            </div>
            <p className="text-slate-700 font-medium text-lg">{po.supplier.name}</p>
            <div className="text-xs text-slate-400 mt-1 space-y-0.5">
              {po.supplier.email && <p>{po.supplier.email}</p>}
              {po.supplier.phone && <p>{po.supplier.phone}</p>}
              <p>Receiving: <span className="text-slate-600">{po.clinic.name}</span></p>
              {po.raisedBy && <p>Raised by {po.raisedBy.name} on {format(new Date(po.createdAt), "d MMM yyyy")}</p>}
              {po.expectedDate && <p>Expected: {format(new Date(po.expectedDate), "d MMM yyyy")}</p>}
              {po.receivedAt   && <p>Received: {format(new Date(po.receivedAt), "d MMM yyyy")}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Order Value</p>
            <p className="text-xl font-bold text-slate-900">{fmt(totalValue)}</p>
          </div>
        </div>
        {po.notes && <p className="mt-4 text-sm text-slate-600 bg-slate-50 rounded p-3">{po.notes}</p>}
      </div>

      {/* Status steps */}
      <div className="card p-4">
        <div className="flex items-center">
          {STEPS.map((step, i) => {
            const done   = i < currentStep;
            const active = i === currentStep;
            return (
              <div key={step} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full border-2 ${active ? "border-violet-600 bg-violet-600" : done ? "border-violet-400 bg-violet-400" : "border-slate-300 bg-white"}`} />
                  <span className={`text-xs mt-1 whitespace-nowrap ${active ? "text-violet-700 font-semibold" : done ? "text-violet-400" : "text-slate-400"}`}>
                    {step.charAt(0) + step.slice(1).toLowerCase()}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-4 ${done || active ? "bg-violet-400" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lines table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Order Lines</h2>
          {isReceiving && (
            <p className="text-xs text-slate-400">Enter received qty, batch no. and expiry on receipt</p>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Ordered</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Received</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Batch No.</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Expiry</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Unit Cost</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Total</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l: any) => (
              <tr key={l.id} className="table-row">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{l.item.name}</p>
                  <p className="text-xs text-slate-400">{l.item.sku} · {l.item.category}</p>
                </td>
                <td className="px-4 py-3 text-right">{l.quantity} {l.item.unit}</td>
                <td className="px-4 py-3 text-right">
                  {isReceiving ? (
                    <input type="number" min="0" className="w-20 border rounded px-2 py-1 text-right text-sm"
                      value={qtyEdits[l.id] ?? l.quantity}
                      onChange={(e) => setQtyEdits((p) => ({ ...p, [l.id]: parseInt(e.target.value) || 0 }))}
                      onBlur={() => saveLineQty(l.id)} />
                  ) : (
                    <span>{l.receivedQty ?? "—"}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isReceiving ? (
                    <input type="text" className="w-28 border rounded px-2 py-1 text-sm font-mono"
                      placeholder="BT-xxxx"
                      value={batchEdits[l.id] ?? ""}
                      onChange={(e) => setBatchEdits((p) => ({ ...p, [l.id]: e.target.value }))}
                      onBlur={() => saveLineQty(l.id)} />
                  ) : (
                    <span className="font-mono text-xs text-slate-600">{l.batchNumber ?? "—"}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isReceiving ? (
                    <input type="date" className="w-36 border rounded px-2 py-1 text-sm"
                      value={expiryEdits[l.id] ?? ""}
                      onChange={(e) => setExpiryEdits((p) => ({ ...p, [l.id]: e.target.value }))}
                      onBlur={() => saveLineQty(l.id)} />
                  ) : l.expiryDate ? (
                    <ExpiryBadge date={l.expiryDate} />
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{fmt(Number(l.unitCost))}</td>
                <td className="px-4 py-3 text-right font-medium">{fmt(l.quantity * Number(l.unitCost))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Linked invoices */}
      {po.stockInvoices?.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-700 mb-3">Linked Supplier Invoices</h2>
          <div className="space-y-2">
            {po.stockInvoices.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between text-sm bg-slate-50 rounded px-3 py-2">
                <span className="font-mono font-semibold text-slate-800">{inv.invoiceRef}</span>
                <span className="text-slate-500">{fmt(Number(inv.totalAmount) + Number(inv.sst))}</span>
                <Link href={`/inventory/stock-invoices/${inv.id}`} className="text-xs text-blue-600 hover:underline">View</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="card p-5 flex flex-wrap gap-3">
        <h2 className="w-full font-semibold text-slate-700 mb-1">Actions</h2>
        {po.status === "DRAFT" && (
          <button onClick={() => changeStatus("SUBMITTED")} disabled={actionBusy} className="btn-primary">
            Submit to Supplier
          </button>
        )}
        {po.status === "SUBMITTED" && (
          <>
            <button onClick={() => changeStatus("CONFIRMED")} disabled={actionBusy} className="btn-primary">
              Mark Confirmed by Supplier
            </button>
            <button onClick={() => changeStatus("CANCELLED")} disabled={actionBusy} className="btn-secondary">
              Cancel
            </button>
          </>
        )}
        {(po.status === "CONFIRMED" || po.status === "PARTIAL") && (
          <>
            <button onClick={() => changeStatus("RECEIVED")} disabled={actionBusy} className="btn-primary">
              Confirm Full Receipt
            </button>
            <button onClick={() => changeStatus("PARTIAL")} disabled={actionBusy} className="btn-secondary">
              Save as Partial
            </button>
          </>
        )}
        {po.status === "RECEIVED" && (
          <Link href={`/inventory/stock-invoices/new?poId=${po.id}`} className="btn-primary">
            Record Supplier Invoice →
          </Link>
        )}
        {actionBusy && <span className="text-slate-400 text-sm self-center">Processing…</span>}
      </div>
    </div>
  );
}
