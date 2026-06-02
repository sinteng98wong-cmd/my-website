"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow, isPast, differenceInHours, format } from "date-fns";

const STATUS_CLASS: Record<string, string> = {
  OPEN: "badge-blue",
  CLOSED: "badge-slate",
  REOPENED: "badge-cyan",
  SUBMITTED: "badge-amber",
  DELIVERED: "badge-purple",
  DISTRIBUTED: "badge-green",
  INVOICED: "badge-emerald",
};

const MODE_CLASS: Record<string, string> = {
  CENTRALISED: "badge-indigo",
  DIRECT: "badge-teal",
};

type PoolOrder = any;

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

const CENTRALISED_STEPS = ["OPEN", "CLOSED", "SUBMITTED", "DELIVERED", "DISTRIBUTED", "INVOICED"];
const DIRECT_STEPS = ["OPEN", "CLOSED", "SUBMITTED", "DELIVERED", "INVOICED"];

export default function PoolOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pool, setPool] = useState<PoolOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [doGenResult, setDoGenResult] = useState<{ doRef: string; id: string }[] | null>(null);
  const [expandedParticipants, setExpandedParticipants] = useState<Set<string>>(new Set());
  const [approvedQtyEdits, setApprovedQtyEdits] = useState<Record<string, number>>({});

  const fetchPool = useCallback(async () => {
    try {
      const res = await fetch(`/api/pool-orders/${id}`);
      if (!res.ok) throw new Error("Failed to load");
      setPool(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchPool(); }, [fetchPool]);

  async function doAction(body: object, path = "") {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pool-orders/${id}${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      if (data.deliveryOrders) setDoGenResult(data.deliveryOrders);
      await fetchPool();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="text-slate-400 p-8">Loading…</div>;
  if (!pool) return <div className="p-8 text-red-600">{error ?? "Not found"}</div>;

  const now = new Date();
  const deadlineSoon = pool.deadline && !isPast(new Date(pool.deadline)) &&
    differenceInHours(new Date(pool.deadline), now) <= 48;
  const deadlinePast = pool.deadline && isPast(new Date(pool.deadline));
  const totalAmount = pool.lines.reduce((s: number, l: any) => s + Number(l.unitCost) * l.totalQty, 0);
  const moq = Number(pool.moqTarget);
  const moqPct = Math.min(100, (totalAmount / moq) * 100);
  const steps = pool.deliveryMode === "CENTRALISED" ? CENTRALISED_STEPS : DIRECT_STEPS;
  const currentStep = steps.indexOf(pool.status);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/inventory/pool-orders" className="text-slate-500 hover:text-slate-700 text-sm">
          ← Pool Orders
        </Link>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
      )}

      {deadlineSoon && ["OPEN", "REOPENED"].includes(pool.status) && (
        <div className="p-3 bg-amber-50 border border-amber-300 text-amber-800 rounded text-sm font-medium">
          ⚠ Deadline closing in {differenceInHours(new Date(pool.deadline), now)} hours — {format(new Date(pool.deadline), "d MMM yyyy, h:mm a")}
        </div>
      )}

      {doGenResult && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-sm">
          <p className="font-medium text-green-800 mb-2">Delivery Orders Generated:</p>
          <ul className="space-y-1">
            {doGenResult.map((d: any) => (
              <li key={d.id}>
                <Link href={`/inventory/delivery-orders/${d.id}`} className="text-green-700 underline">{d.doRef}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Header card */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-slate-900">{pool.poRef}</h1>
              <span className={STATUS_CLASS[pool.status] ?? "badge-slate"}>
                {pool.status.charAt(0) + pool.status.slice(1).toLowerCase()}
              </span>
              <span className={MODE_CLASS[pool.deliveryMode] ?? "badge-slate"}>
                {pool.deliveryMode === "CENTRALISED" ? "Centralised" : "Direct"}
              </span>
            </div>
            <p className="text-slate-600 font-medium">{pool.supplierName}</p>
            <p className="text-sm text-slate-400 mt-1">
              Initiated by {pool.initiatingClinic?.name}
              {pool.raisedBy && ` · ${pool.raisedBy.name}`}
            </p>
            {pool.deadline && (
              <p className="text-sm mt-1">
                Deadline:{" "}
                {deadlinePast
                  ? <span className="text-red-500 font-medium">Passed ({format(new Date(pool.deadline), "d MMM yyyy, h:mm a")})</span>
                  : <span className={deadlineSoon ? "text-amber-600 font-medium" : "text-slate-600"}>
                      {format(new Date(pool.deadline), "d MMM yyyy, h:mm a")} ({formatDistanceToNow(new Date(pool.deadline), { addSuffix: true })})
                    </span>
                }
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-wide">MOQ Progress</p>
            <p className="text-lg font-bold text-slate-900">{fmt(totalAmount)} / {fmt(moq)}</p>
            <div className="w-48 h-2 bg-slate-100 rounded-full mt-1">
              <div
                className={`h-2 rounded-full ${moqPct >= 100 ? "bg-green-500" : "bg-blue-500"}`}
                style={{ width: `${moqPct}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">{moqPct.toFixed(0)}% of MOQ</p>
          </div>
        </div>
        {pool.notes && (
          <p className="mt-4 text-sm text-slate-600 bg-slate-50 rounded p-3">{pool.notes}</p>
        )}
      </div>

      {/* Status timeline */}
      <div className="card p-4">
        <div className="flex items-center gap-0">
          {steps.map((step, i) => {
            const done = i < currentStep;
            const active = i === currentStep;
            return (
              <div key={step} className="flex items-center flex-1 last:flex-none">
                <div className={`flex flex-col items-center ${i > 0 ? "flex-1" : ""}`}>
                  {i > 0 && (
                    <div className={`h-0.5 w-full ${done || active ? "bg-blue-500" : "bg-slate-200"}`} />
                  )}
                  <div className={`w-3 h-3 rounded-full border-2 mt-1 ${
                    active ? "border-blue-600 bg-blue-600" : done ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white"
                  }`} />
                  <span className={`text-xs mt-1 whitespace-nowrap ${active ? "text-blue-700 font-semibold" : done ? "text-blue-500" : "text-slate-400"}`}>
                    {step.charAt(0) + step.slice(1).toLowerCase()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pool Items */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Pool Items</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Item", "SKU", "Unit Cost", "Total Qty", "Line Total"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pool.lines.map((l: any) => (
              <tr key={l.id} className="table-row">
                <td className="px-4 py-3 font-medium">{l.item.name}</td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{l.item.sku}</td>
                <td className="px-4 py-3">{fmt(Number(l.unitCost))}</td>
                <td className="px-4 py-3">{l.totalQty} {l.item.unit}</td>
                <td className="px-4 py-3 font-medium">{fmt(Number(l.unitCost) * l.totalQty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Participants */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Participants ({pool.participants.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Clinic</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Joined By</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Joined At</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Items</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Subtotal</th>
              {pool.deliveryMode === "DIRECT" && (
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wide">Received</th>
              )}
              <th className="px-4 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {pool.participants.map((p: any) => {
              const expanded = expandedParticipants.has(p.id);
              return (
                <>
                  <tr key={p.id} className="table-row">
                    <td className="px-4 py-3 font-medium">{p.clinic.name}</td>
                    <td className="px-4 py-3 text-slate-500">{p.joinedBy?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {format(new Date(p.joinedAt), "d MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-right">{p.items.length}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmt(Number(p.requestedAmount))}</td>
                    {pool.deliveryMode === "DIRECT" && (
                      <td className="px-4 py-3 text-center">
                        {p.receivedAt
                          ? <span className="text-green-600 text-xs">✓ {format(new Date(p.receivedAt), "d MMM")}</span>
                          : <span className="text-slate-400 text-xs">Pending</span>
                        }
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpandedParticipants((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                          return next;
                        })}
                        className="text-blue-500 hover:text-blue-700 text-xs"
                      >
                        {expanded ? "▲" : "▼"}
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr key={`${p.id}-expanded`}>
                      <td colSpan={pool.deliveryMode === "DIRECT" ? 7 : 6} className="bg-slate-50 px-8 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-400 uppercase border-b">
                              <th className="text-left py-1">Item</th>
                              <th className="text-right py-1">Req. Qty</th>
                              {pool.status === "DELIVERED" && pool.deliveryMode === "CENTRALISED" && (
                                <th className="text-right py-1">Approved Qty</th>
                              )}
                              <th className="text-right py-1">Unit Cost</th>
                              <th className="text-right py-1">Line Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.items.map((line: any) => (
                              <tr key={line.id} className="border-b last:border-0">
                                <td className="py-1">{line.item.name}</td>
                                <td className="py-1 text-right">{line.requestedQty} {line.item.unit}</td>
                                {pool.status === "DELIVERED" && pool.deliveryMode === "CENTRALISED" && (
                                  <td className="py-1 text-right">
                                    <input
                                      type="number"
                                      min="0"
                                      className="w-20 border rounded px-2 py-0.5 text-right text-xs"
                                      defaultValue={line.approvedQty ?? line.requestedQty}
                                      onBlur={async (e) => {
                                        const val = parseInt(e.target.value);
                                        if (!isNaN(val)) {
                                          await fetch(`/api/pool-orders/${id}/approved-qty`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ participantId: p.id, itemId: line.itemId, approvedQty: val }),
                                          });
                                        }
                                      }}
                                    />
                                  </td>
                                )}
                                <td className="py-1 text-right">{fmt(Number(line.unitCost))}</td>
                                <td className="py-1 text-right">{fmt(Number(line.unitCost) * line.requestedQty)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="card p-5 flex flex-wrap gap-3">
        <h2 className="w-full font-semibold text-slate-700 mb-1">Actions</h2>

        {["OPEN", "REOPENED"].includes(pool.status) && (
          <button
            onClick={() => doAction({ status: "CLOSED" }, "/status")}
            disabled={actionLoading}
            className="btn-secondary"
          >
            Close Pool
          </button>
        )}

        {pool.status === "CLOSED" && (
          <>
            <button
              onClick={() => fetch(`/api/pool-orders/${id}/reopen`, { method: "PATCH" }).then(() => fetchPool())}
              disabled={actionLoading}
              className="btn-secondary"
            >
              Reopen
            </button>
            <button
              onClick={() => doAction({ status: "SUBMITTED" }, "/status")}
              disabled={actionLoading}
              className="btn-primary"
            >
              Submit to Supplier
            </button>
          </>
        )}

        {pool.status === "SUBMITTED" && (
          <button
            onClick={() => doAction({ status: "DELIVERED" }, "/status")}
            disabled={actionLoading}
            className="btn-primary"
          >
            Mark Delivered
          </button>
        )}

        {pool.status === "DELIVERED" && pool.deliveryMode === "CENTRALISED" && (
          <button
            onClick={async () => {
              if (confirm(`Generate ${pool.participants.length - 1} DOs to branch clinics?`)) {
                await doAction({ status: "DISTRIBUTED" }, "/status");
              }
            }}
            disabled={actionLoading}
            className="btn-primary"
          >
            Generate Delivery Orders
          </button>
        )}

        {["DELIVERED", "DISTRIBUTED"].includes(pool.status) && (
          <button
            onClick={() => doAction({ status: "INVOICED" }, "/status")}
            disabled={actionLoading}
            className="btn-secondary"
          >
            Mark Invoiced
          </button>
        )}

        {actionLoading && <span className="text-slate-400 text-sm self-center">Processing…</span>}
      </div>

      {/* Linked DOs — shown once DISTRIBUTED */}
      {pool.deliveryOrders?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">
              Branch Delivery Orders ({pool.deliveryOrders.length})
            </h2>
            {pool.status === "DISTRIBUTED" && (
              <p className="text-xs text-slate-400">
                HQ: mark each as dispatched. Branches: confirm receipt on their DO page.
              </p>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">DO Ref</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">To Clinic</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pool.deliveryOrders.map((d: any) => {
                const DO_STATUS_CLASS: Record<string, string> = {
                  DRAFT: "badge-slate", PENDING: "badge-amber", APPROVED: "badge-blue",
                  IN_TRANSIT: "badge-indigo", RECEIVED: "badge-green", INVOICED: "badge-emerald",
                };
                return (
                  <tr key={d.id} className="table-row">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{d.doRef}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {pool.participants.find((p: any) => p.clinicId === d.toClinicId)?.clinic?.name ?? d.toClinicId}
                    </td>
                    <td className="px-4 py-3">
                      <span className={DO_STATUS_CLASS[d.status] ?? "badge-slate"}>
                        {d.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex items-center gap-3">
                      <Link
                        href={`/inventory/delivery-orders/${d.id}`}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        View
                      </Link>
                      {/* HQ can mark as dispatched directly from here */}
                      {d.status === "APPROVED" && (
                        <button
                          className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                          onClick={async () => {
                            setActionLoading(true);
                            await fetch(`/api/delivery-orders/${d.id}/status`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "IN_TRANSIT" }),
                            });
                            await fetchPool();
                            setActionLoading(false);
                          }}
                        >
                          Mark Dispatched
                        </button>
                      )}
                      {/* Branch receipt status hint */}
                      {d.status === "IN_TRANSIT" && (
                        <span className="text-xs text-amber-600">⏳ Awaiting branch receipt</span>
                      )}
                      {d.status === "RECEIVED" && (
                        <span className="text-xs text-green-600">✓ Received</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
