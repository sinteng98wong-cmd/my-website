"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { REASON_LABELS } from "@/lib/stock-issue";

const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

const STATUS_CLASS: Record<string, string> = {
  DRAFT:            "bg-slate-100 text-slate-600",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700",
  POSTED:           "bg-green-100 text-green-700",
  REJECTED:         "bg-red-100 text-red-700",
};

export function StockIssueDetailClient({ id }: { id: string }) {
  const [issue, setIssue] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/stock-issues/${id}`);
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Failed to load"); return; }
    setIssue(d);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function act(path: string, body?: any) {
    setBusy(true); setError(""); setMsg("");
    const res = await fetch(`/api/stock-issues/${id}/${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "Action failed"); load(); return; }
    if (d.awaitingApproval) setMsg("Submitted — awaiting PIC approval. No stock has moved yet.");
    else if (d.movements !== undefined) setMsg(`Posted — ${d.movements} movement(s) written to the ledger.`);
    load();
  }

  if (error && !issue) return <div className="p-8 text-red-600">{error}</div>;
  if (!issue) return <div className="p-8 text-slate-400">Loading…</div>;

  const canReview = issue.status === "PENDING_APPROVAL" && issue.viewer?.isPic && !issue.viewer?.raisedThis;

  return (
    <div className="space-y-5">
      <Link href="/inventory/stock-issues" className="text-sm text-slate-500 hover:text-slate-700">← Stock Issues</Link>

      <div className="card p-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{issue.reference}</h1>
            <span className={`text-xs px-2 py-0.5 rounded ${STATUS_CLASS[issue.status]}`}>{issue.status.replace("_", " ")}</span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            {issue.clinic.name} · {REASON_LABELS[issue.reason as keyof typeof REASON_LABELS]}
            {issue.notes ? ` · ${issue.notes}` : ""}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Raised by {issue.createdBy?.name} on {new Date(issue.createdAt).toLocaleString("en-MY")}
            {issue.submittedBy && ` · submitted by ${issue.submittedBy.name}`}
            {issue.reviewedBy && ` · reviewed by ${issue.reviewedBy.name}`}
            {issue.postedAt && ` · posted ${new Date(issue.postedAt).toLocaleString("en-MY")}`}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Source: {issue.sourceKind}{issue.sourceRefId ? ` (${issue.sourceRefId})` : ""} · PIC:{" "}
            {issue.clinic.pic?.name ?? <span className="text-red-500">not configured</span>}
          </p>
          {issue.reviewNote && <p className="text-xs text-red-600 mt-1">Review note: {issue.reviewNote}</p>}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-right">
          <span className="text-slate-400">Total qty</span><span className="font-semibold text-red-600">−{issue.totalQty}</span>
          <span className="text-slate-400">Total value</span><span className="font-semibold">{RM(issue.totalValue)}</span>
        </div>
      </div>

      {msg && <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">{msg}</div>}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

      {issue.status === "POSTED" && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
          Posted to the ledger and final. Corrections require a compensating movement, not an edit.
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {issue.editable && (
          <button onClick={() => act("submit")} disabled={busy} className="btn-primary text-sm">
            {issue.needsApproval ? "Submit for PIC Approval" : "Post Stock Issue"}
          </button>
        )}
        {canReview && (
          <>
            <button onClick={() => act("approve")} disabled={busy} className="btn-primary bg-green-600 text-sm">Approve &amp; Post</button>
            <button onClick={() => { const r = prompt("Reason for rejecting?"); if (r) act("reject", { reason: r }); }}
              disabled={busy} className="btn-secondary text-sm">Reject</button>
          </>
        )}
        {issue.status === "PENDING_APPROVAL" && issue.viewer?.raisedThis && (
          <span className="text-xs text-slate-500 self-center">Awaiting PIC — you cannot approve a write-off you raised.</span>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>{["Item", "Qty", "Unit Cost", "Value", "Batch allocation", "Ledger"]
              .map((h) => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody>
            {issue.lines.map((l: any) => {
              const mv = issue.movements?.find((m: any) => m.id === l.movementId);
              return (
                <tr key={l.id} className="table-row align-top">
                  <td className="px-4 py-3 font-medium">
                    {l.item.name}<span className="block text-xs text-slate-400 font-mono">{l.item.sku}</span>
                  </td>
                  <td className="px-4 py-3 text-red-600 font-medium">−{l.quantity}</td>
                  <td className="px-4 py-3 text-slate-500">{l.unitCost ? RM(l.unitCost) : "—"}</td>
                  <td className="px-4 py-3">{l.unitCost ? RM(Number(l.unitCost) * l.quantity) : "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {l.allocations.length === 0
                      ? <span className="text-slate-400">{l.batch ? `pinned to ${l.batch.batchNumber}` : "FEFO on posting"}</span>
                      : l.allocations.map((a: any) => (
                          <div key={a.id} className={a.batchId ? "" : "text-amber-700"}>
                            {a.batchId ? a.batchNumber : "Unbatched stock"} × {a.quantity}
                            {a.expiryDate && <span className="text-slate-400"> · exp {new Date(a.expiryDate).toLocaleDateString("en-MY")}</span>}
                          </div>
                        ))}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {mv ? (
                      <>
                        <span className="font-mono">{mv.type}</span>
                        <span className="block">bal {mv.balanceAfter} · {RM(mv.valueDelta)} · {mv.period}</span>
                      </>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
