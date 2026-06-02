"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "badge-slate",
  PENDING: "badge-amber",
  APPROVED: "badge-blue",
  IN_TRANSIT: "badge-indigo",
  RECEIVED: "badge-green",
  INVOICED: "badge-emerald",
};

const STEPS = ["DRAFT", "PENDING", "APPROVED", "IN_TRANSIT", "RECEIVED", "INVOICED"];

type DeliveryOrder = any;

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

function ExpiryBadge({ date }: { date: string }) {
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
  const label = new Date(date).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
  if (days < 0)    return <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Expired · {label}</span>;
  if (days <= 30)  return <span className="text-xs font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded">{days}d · {label}</span>;
  if (days <= 90)  return <span className="text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{days}d · {label}</span>;
  if (days <= 180) return <span className="text-xs font-medium text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">{label}</span>;
  return <span className="text-xs text-slate-500">{label}</span>;
}

export default function DeliveryOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [receivedQtyEdits, setReceivedQtyEdits]     = useState<Record<string, number>>({});
  const [batchEdits, setBatchEdits]                 = useState<Record<string, string>>({});
  const [expiryEdits, setExpiryEdits]               = useState<Record<string, string>>({});

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/delivery-orders/${id}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setOrder(data);
      // Initialize receivedQty edits from existing values
      const qtyEdits: Record<string, number>  = {};
      const batEdits: Record<string, string>  = {};
      const expEdits: Record<string, string>  = {};
      for (const line of data.lines) {
        qtyEdits[line.id] = line.receivedQty ?? line.quantity;
        batEdits[line.id] = line.batchNumber ?? "";
        expEdits[line.id] = line.expiryDate  ? line.expiryDate.slice(0, 10) : "";
      }
      setReceivedQtyEdits(qtyEdits);
      setBatchEdits(batEdits);
      setExpiryEdits(expEdits);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  async function changeStatus(status: string) {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/delivery-orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      if (data.hasDiscrepancy) {
        alert("Some items were received with quantity differences. Please review.");
      }
      await fetchOrder();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function saveReceivedQty(lineId: string) {
    const qty = receivedQtyEdits[lineId];
    if (qty === undefined) return;
    await fetch(`/api/delivery-orders/${id}/received-qty`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lineId,
        receivedQty: qty,
        batchNumber: batchEdits[lineId]  || undefined,
        expiryDate:  expiryEdits[lineId] || undefined,
      }),
    });
  }

  if (loading) return <div className="text-slate-400 p-8">Loading…</div>;
  if (!order) return <div className="p-8 text-red-600">{error ?? "Not found"}</div>;

  const currentStep = STEPS.indexOf(order.status);
  const totalValue = order.lines.reduce((s: number, l: any) => s + l.quantity * Number(l.unitCost), 0);
  const hasDiscrepancy = order.lines.some((l: any) => l.receivedQty !== null && l.receivedQty !== l.quantity);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between mb-2">
        <Link href="/inventory/delivery-orders" className="text-slate-500 hover:text-slate-700 text-sm">
          ← Delivery Orders
        </Link>
        <a
          href={`/api/delivery-orders/${id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-sm flex items-center gap-2"
        >
          <span>🖨</span> Export PDF
        </a>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
      )}

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-slate-900">{order.doRef}</h1>
              <span className={STATUS_CLASS[order.status] ?? "badge-slate"}>
                {order.status.replace("_", " ")}
              </span>
            </div>
            <p className="text-slate-700 font-medium">
              {order.fromClinic.name} → {order.toClinic.name}
            </p>
            {order.poolOrder && (
              <p className="text-sm text-slate-400 mt-1">
                From Pool Order:{" "}
                <Link href={`/inventory/pool-orders/${order.poolOrder.id}`} className="text-blue-600 hover:underline">
                  {order.poolOrder.poRef}
                </Link>
              </p>
            )}
            <div className="text-xs text-slate-400 mt-2 space-y-0.5">
              {order.raisedBy && <p>Raised by {order.raisedBy.name} on {format(new Date(order.raisedAt), "d MMM yyyy")}</p>}
              {order.approvedBy && <p>Approved by {order.approvedBy.name} on {order.approvedAt ? format(new Date(order.approvedAt), "d MMM yyyy") : "—"}</p>}
              {order.dispatchedAt && <p>Dispatched: {format(new Date(order.dispatchedAt), "d MMM yyyy")}</p>}
              {order.receivedAt && <p>Received: {format(new Date(order.receivedAt), "d MMM yyyy")}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Total Value</p>
            <p className="text-xl font-bold text-slate-900">{fmt(totalValue)}</p>
          </div>
        </div>
        {order.notes && (
          <p className="mt-4 text-sm text-slate-600 bg-slate-50 rounded p-3">{order.notes}</p>
        )}
      </div>

      {/* Status timeline */}
      <div className="card p-4">
        <div className="flex items-center">
          {STEPS.map((step, i) => {
            const done = i < currentStep;
            const active = i === currentStep;
            return (
              <div key={step} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full border-2 ${
                    active ? "border-blue-600 bg-blue-600" : done ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white"
                  }`} />
                  <span className={`text-xs mt-1 whitespace-nowrap ${active ? "text-blue-700 font-semibold" : done ? "text-blue-500" : "text-slate-400"}`}>
                    {step.replace("_", " ").charAt(0) + step.replace("_", " ").slice(1).toLowerCase()}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-4 ${done || active ? "bg-blue-500" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Discrepancy warning */}
      {hasDiscrepancy && order.status === "RECEIVED" && (
        <div className="p-3 bg-amber-50 border border-amber-300 text-amber-800 rounded text-sm">
          ⚠ Some items were received with quantity differences. Please check with the dispatching clinic.
        </div>
      )}

      {/* Lines table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Items</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Qty Sent</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Qty Received</th>
              {order.status === "IN_TRANSIT" && (
                <>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Batch No.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Expiry Date</th>
                </>
              )}
              {order.status !== "IN_TRANSIT" && (
                <>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Batch</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Expiry</th>
                </>
              )}
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Unit Cost</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l: any) => {
              const discrepancy = l.receivedQty !== null && l.receivedQty !== l.quantity;
              const isEditing   = order.status === "IN_TRANSIT";
              return (
                <tr key={l.id} className={`table-row ${discrepancy ? "bg-amber-50" : ""}`}>
                  <td className="px-4 py-3 font-medium">{l.item.name}
                    <span className="ml-1.5 text-xs text-slate-400">{l.item.sku}</span>
                  </td>
                  <td className="px-4 py-3 text-right">{l.quantity} {l.item.unit}</td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        className="w-20 border rounded px-2 py-1 text-right text-sm"
                        value={receivedQtyEdits[l.id] ?? l.quantity}
                        onChange={(e) => setReceivedQtyEdits((prev) => ({ ...prev, [l.id]: parseInt(e.target.value) || 0 }))}
                        onBlur={() => saveReceivedQty(l.id)}
                      />
                    ) : l.receivedQty !== null ? (
                      <span className={discrepancy ? "text-amber-700 font-medium" : ""}>
                        {l.receivedQty} {l.item.unit}{discrepancy ? " ⚠" : ""}
                      </span>
                    ) : "—"}
                  </td>
                  {/* Batch number */}
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input
                        type="text"
                        className="w-32 border rounded px-2 py-1 text-sm font-mono"
                        placeholder="e.g. BT-2025-01"
                        value={batchEdits[l.id] ?? ""}
                        onChange={(e) => setBatchEdits((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        onBlur={() => saveReceivedQty(l.id)}
                      />
                    ) : (
                      <span className="font-mono text-xs text-slate-600">{l.batchNumber ?? "—"}</span>
                    )}
                  </td>
                  {/* Expiry date */}
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input
                        type="date"
                        className="w-36 border rounded px-2 py-1 text-sm"
                        value={expiryEdits[l.id] ?? ""}
                        onChange={(e) => setExpiryEdits((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        onBlur={() => saveReceivedQty(l.id)}
                      />
                    ) : l.expiryDate ? (
                      <ExpiryBadge date={l.expiryDate} />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{fmt(Number(l.unitCost))}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(l.quantity * Number(l.unitCost))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="card p-5 flex flex-wrap gap-3">
        <h2 className="w-full font-semibold text-slate-700 mb-1">Actions</h2>

        {order.status === "DRAFT" && (
          <button onClick={() => changeStatus("PENDING")} disabled={actionLoading} className="btn-primary">
            Submit for Approval
          </button>
        )}

        {order.status === "PENDING" && (
          <>
            <button onClick={() => changeStatus("APPROVED")} disabled={actionLoading} className="btn-primary">
              Approve
            </button>
            <button onClick={() => changeStatus("DRAFT")} disabled={actionLoading} className="btn-secondary">
              Reject
            </button>
          </>
        )}

        {order.status === "APPROVED" && (
          <button onClick={() => changeStatus("IN_TRANSIT")} disabled={actionLoading} className="btn-primary">
            Mark Dispatched
          </button>
        )}

        {order.status === "IN_TRANSIT" && (
          <button
            onClick={async () => {
              // Save all qty edits first
              for (const lineId of Object.keys(receivedQtyEdits)) {
                await saveReceivedQty(lineId);
              }
              const anyDiff = order.lines.some((l: any) => {
                const edited = receivedQtyEdits[l.id];
                return edited !== undefined && edited !== l.quantity;
              });
              if (anyDiff && !confirm("Some quantities differ from dispatched amounts. Confirm receipt anyway?")) return;
              changeStatus("RECEIVED");
            }}
            disabled={actionLoading}
            className="btn-primary"
          >
            Confirm Receipt
          </button>
        )}

        {order.status === "RECEIVED" && (
          <button onClick={() => changeStatus("INVOICED")} disabled={actionLoading} className="btn-secondary">
            Mark Invoiced
          </button>
        )}

        {actionLoading && <span className="text-slate-400 text-sm self-center">Processing…</span>}
      </div>
    </div>
  );
}
