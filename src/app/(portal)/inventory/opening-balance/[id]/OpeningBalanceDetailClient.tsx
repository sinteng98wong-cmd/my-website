"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { canReviewOpening, lineValue, totalsOf } from "@/lib/stock-opening";

const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

const STATUS: Record<string, string> = {
  DRAFT:     "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-amber-100 text-amber-700",
  APPROVED:  "bg-green-100 text-green-700",
  REJECTED:  "bg-red-100 text-red-700",
};

export function OpeningBalanceDetailClient({ id, role, userId }: { id: string; role: string; userId: string }) {
  const router = useRouter();
  const [doc, setDoc]     = useState<any>(null);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");
  const [note, setNote]   = useState("");

  const load = useCallback(async () => {
    const d = await fetch(`/api/stock-opening/${id}`).then((r) => r.json());
    setDoc(d);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveLine(lineId: string, patch: Record<string, unknown>) {
    setError("");
    const res = await fetch(`/api/stock-opening/${id}/lines`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId, ...patch }),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Could not save"); return; }
    load();
  }

  async function act(path: string, body?: unknown) {
    setBusy(true); setError("");
    const res = await fetch(`/api/stock-opening/${id}/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "Action failed"); return; }
    load();
  }

  if (!doc) return <div className="p-8 text-slate-400">Loading…</div>;
  if (doc.error) return <div className="p-8 text-red-600">{doc.error}</div>;

  const editable = doc.status === "DRAFT";
  const lines = doc.lines.map((l: any) => ({
    ...l,
    quantity: l.quantity,
    unitCost: l.unitCost === null ? null : Number(l.unitCost),
  }));
  const totals = totalsOf(lines);

  // Separation of duties: the raiser and submitter cannot sign their own.
  const isOwnDocument = userId === doc.createdById || userId === doc.submittedById;
  const canApprove = doc.status === "SUBMITTED" && canReviewOpening(role) && !isOwnDocument;

  return (
    <div className="space-y-5">
      <Link href="/inventory/opening-balance" className="text-sm text-slate-500 hover:text-slate-700">← Opening Balance</Link>

      <div className="card p-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{doc.reference}</h1>
            <span className={`text-xs px-2 py-0.5 rounded ${STATUS[doc.status]}`}>{doc.status}</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">{doc.clinic.name}</p>
          <p className="text-xs text-slate-400 mt-1">
            Raised by {doc.createdBy?.name}
            {doc.submittedBy && ` · Submitted by ${doc.submittedBy.name}`}
            {doc.reviewedBy && ` · Reviewed by ${doc.reviewedBy.name}`}
          </p>
          {doc.reviewNote && (
            <p className="text-xs text-red-600 mt-1">Reviewer note: {doc.reviewNote}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-right">
          <span className="text-slate-400">Total quantity</span><span className="font-semibold">{totals.quantity}</span>
          <span className="text-slate-400">Total value</span><span className="font-semibold text-green-700">{RM(totals.value)}</span>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

      {doc.status === "APPROVED" && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          Posted to the stock ledger. These figures are now immutable history — any correction must go
          through a stock adjustment.
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Item", "Opening Qty", "Unit Cost", "Value", "Batch No.", "Expiry"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l: any) => (
              <tr key={l.id} className="table-row">
                <td className="px-4 py-2">
                  <span className="font-medium text-slate-800">{l.item.name}</span>
                  <span className="block text-xs text-slate-400 font-mono">{l.item.sku}</span>
                </td>
                <td className="px-4 py-2">
                  {editable ? (
                    <input
                      type="number" min={0} step={1} className="form-input w-24 text-sm"
                      defaultValue={l.quantity ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        if (v !== l.quantity) saveLine(l.id, { quantity: v });
                      }}
                    />
                  ) : <span>{l.quantity ?? "—"}</span>}
                </td>
                <td className="px-4 py-2">
                  {editable ? (
                    <input
                      type="number" min={0} step="0.0001" className="form-input w-28 text-sm"
                      defaultValue={l.unitCost ?? ""}
                      placeholder="required"
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        if (v !== l.unitCost) saveLine(l.id, { unitCost: v });
                      }}
                    />
                  ) : <span className="font-mono">{l.unitCost === null ? "—" : l.unitCost.toFixed(4)}</span>}
                </td>
                <td className="px-4 py-2 font-mono text-slate-700">
                  {lineValue(l) ? RM(lineValue(l)) : "—"}
                </td>
                <td className="px-4 py-2">
                  {editable ? (
                    <input
                      className="form-input w-32 text-sm" placeholder="optional"
                      defaultValue={l.batchNumber ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null;
                        if (v !== l.batchNumber) saveLine(l.id, { batchNumber: v });
                      }}
                    />
                  ) : <span className="text-slate-500">{l.batchNumber ?? "—"}</span>}
                </td>
                <td className="px-4 py-2">
                  {editable ? (
                    <input
                      type="date" className="form-input w-36 text-sm"
                      defaultValue={l.expiryDate ? String(l.expiryDate).slice(0, 10) : ""}
                      onBlur={(e) => saveLine(l.id, { expiryDate: e.target.value || null })}
                    />
                  ) : <span className="text-slate-500">{l.expiryDate ? String(l.expiryDate).slice(0, 10) : "—"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3">{totals.quantity}</td>
              <td />
              <td className="px-4 py-3 font-mono">{RM(totals.value)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && (
        <p className="text-xs text-slate-500">
          Unit cost is required wherever the opening quantity is above zero — there is no other cost basis
          in the system to fall back on. A counted zero is fine and simply posts nothing for that item.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {editable && (
          <button onClick={() => act("submit")} disabled={busy} className="btn-primary text-sm">
            {busy ? "Submitting…" : "Submit for Review"}
          </button>
        )}
        {canApprove && (
          <>
            <button onClick={() => act("approve")} disabled={busy} className="btn-primary bg-green-600 text-sm">
              {busy ? "Posting…" : "Approve & Post"}
            </button>
            <div className="flex items-center gap-2">
              <input
                className="form-input text-sm w-56" placeholder="Reason for rejection"
                value={note} onChange={(e) => setNote(e.target.value)}
              />
              <button
                onClick={() => act("reject", { reason: note })}
                disabled={busy || !note.trim()}
                className="btn-outline text-sm text-red-600 border-red-300"
              >
                Reject
              </button>
            </div>
          </>
        )}
        {doc.status === "SUBMITTED" && isOwnDocument && canReviewOpening(role) && (
          <p className="text-xs text-amber-700 self-center">
            You raised or submitted this document, so someone else must approve it.
          </p>
        )}
        {(doc.status === "DRAFT" || doc.status === "REJECTED") && (
          <button
            onClick={async () => {
              if (!confirm("Discard this opening balance?")) return;
              await fetch(`/api/stock-opening/${id}`, { method: "DELETE" });
              router.push("/inventory/opening-balance");
            }}
            className="btn-outline text-sm text-red-600 border-red-300"
          >
            Discard
          </button>
        )}
      </div>
    </div>
  );
}
