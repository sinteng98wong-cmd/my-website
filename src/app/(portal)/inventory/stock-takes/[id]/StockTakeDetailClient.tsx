"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { REASONS, REASON_LABELS, varianceOf, varianceValue } from "@/lib/stock-take";

const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

const STATUS_CLASS: Record<string, string> = {
  DRAFT:            "bg-slate-100 text-slate-600",
  SUBMITTED:        "bg-amber-100 text-amber-700",
  RECOUNT_REQUIRED: "bg-orange-100 text-orange-700",
  APPROVED:         "bg-green-100 text-green-700",
  REJECTED:         "bg-red-100 text-red-700",
};

export function StockTakeDetailClient({ id }: { id: string }) {
  const [take, setTake] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [drifted, setDrifted] = useState<any[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/stock-takes/${id}`);
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Failed to load"); return; }
    setTake(d);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveLine(lineId: string, patch: any) {
    setError("");
    const res = await fetch(`/api/stock-takes/${id}/lines`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId, ...patch }),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Save failed"); return; }
    load();
  }

  async function act(path: string, body?: any) {
    setBusy(true); setError(""); setMsg(""); setDrifted([]);
    const res = await fetch(`/api/stock-takes/${id}/${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(d.error ?? "Action failed");
      if (d.drifted) setDrifted(d.drifted);
      load();
      return;
    }
    if (d.movements !== undefined) setMsg(`Approved — ${d.movements} adjustment movement(s) posted to the ledger.`);
    load();
  }

  if (error && !take) return <div className="p-8 text-red-600">{error}</div>;
  if (!take) return <div className="p-8 text-slate-400">Loading…</div>;

  const editable = take.editable;
  const isPic = take.viewer?.isPic;
  const raisedThis = take.viewer?.raisedThis;
  const canReview = take.status === "SUBMITTED" && !raisedThis;

  const totals = take.lines.reduce(
    (a: any, l: any) => {
      const v = varianceOf(l);
      if (v === null) return a;
      return { qty: a.qty + v, value: a.value + varianceValue(v, Number(l.avgUnitCost)), counted: a.counted + 1 };
    },
    { qty: 0, value: 0, counted: 0 }
  );

  return (
    <div className="space-y-5">
      <Link href="/inventory/stock-takes" className="text-sm text-slate-500 hover:text-slate-700">← Stock Takes</Link>

      <div className="card p-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{take.reference}</h1>
            <span className={`text-xs px-2 py-0.5 rounded ${STATUS_CLASS[take.status]}`}>{take.status.replace("_", " ")}</span>
          </div>
          <p className="text-sm text-slate-600 mt-1">{take.clinic.name}{take.notes ? ` · ${take.notes}` : ""}</p>
          <p className="text-xs text-slate-400 mt-1">
            Raised by {take.createdBy?.name} on {new Date(take.createdAt).toLocaleString("en-MY")}
            {take.submittedBy && ` · submitted by ${take.submittedBy.name}`}
            {take.reviewedBy && ` · reviewed by ${take.reviewedBy.name} on ${new Date(take.reviewedAt).toLocaleString("en-MY")}`}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            PIC: {take.clinic.pic?.name ?? <span className="text-red-500">not configured</span>}
          </p>
          {take.reviewNote && <p className="text-xs text-red-600 mt-1">Review note: {take.reviewNote}</p>}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-right">
          <span className="text-slate-400">Counted</span><span>{totals.counted} / {take.lines.length}</span>
          <span className="text-slate-400">Variance qty</span>
          <span className={`font-semibold ${totals.qty < 0 ? "text-red-600" : totals.qty > 0 ? "text-green-700" : ""}`}>
            {totals.qty > 0 ? "+" : ""}{totals.qty}
          </span>
          <span className="text-slate-400">Variance value</span><span className="font-semibold">{RM(totals.value)}</span>
        </div>
      </div>

      {msg && <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">{msg}</div>}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

      {drifted.length > 0 && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded text-sm">
          <p className="font-semibold text-orange-900">Stock moved since this count</p>
          <p className="text-xs text-orange-800 mt-1">
            These lines were refreshed to the current system quantity and must be re-counted before approval.
          </p>
          <ul className="text-xs text-orange-900 mt-2 list-disc pl-5">
            {drifted.map((d: any) => (
              <li key={d.lineId}>counted against {d.countedSystemQty}, now {d.currentSystemQty}</li>
            ))}
          </ul>
        </div>
      )}

      {take.status === "APPROVED" && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
          This stock take is final. Its adjustments are posted in the ledger and cannot be edited —
          corrections require a new stock take or adjustment.
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {editable && <button onClick={() => act("submit")} disabled={busy} className="btn-primary text-sm">Submit for Review</button>}
        {take.status === "RECOUNT_REQUIRED" && (
          <button onClick={() => act("recount")} disabled={busy} className="btn-secondary text-sm">Refresh & Recount</button>
        )}
        {canReview && isPic && (
          <>
            <button onClick={() => act("approve")} disabled={busy} className="btn-primary bg-green-600 text-sm">Approve &amp; Post Adjustments</button>
            <button
              onClick={() => { const r = prompt("Reason for rejecting this stock take?"); if (r) act("reject", { reason: r }); }}
              disabled={busy} className="btn-secondary text-sm">Reject</button>
          </>
        )}
        {take.status === "SUBMITTED" && raisedThis && (
          <span className="text-xs text-slate-500 self-center">Awaiting PIC review — you cannot approve a count you raised.</span>
        )}
        {take.status === "SUBMITTED" && !raisedThis && !isPic && (
          <span className="text-xs text-slate-500 self-center">Awaiting the clinic PIC.</span>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>{["Item", "System", "Physical", "Variance", "Avg Cost", "Variance Value", "Reason", "Counted by"]
              .map((h) => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody>
            {take.lines.map((l: any) => {
              const v = varianceOf(l);
              const value = v === null ? null : varianceValue(v, Number(l.avgUnitCost));
              return (
                <tr key={l.id} className={`table-row ${v !== null && v !== 0 ? "bg-amber-50/40" : ""}`}>
                  <td className="px-4 py-2 font-medium">
                    {l.item.name}<span className="block text-xs text-slate-400 font-mono">{l.item.sku}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{l.systemQty}</td>
                  <td className="px-4 py-2">
                    {editable ? (
                      <input type="number" min={0} className="form-input w-24 text-sm" defaultValue={l.physicalQty ?? ""}
                        onBlur={(e) => {
                          const raw = e.target.value;
                          const val = raw === "" ? null : Number(raw);
                          if (val !== l.physicalQty) saveLine(l.id, { physicalQty: val });
                        }} />
                    ) : (l.physicalQty ?? "—")}
                  </td>
                  <td className={`px-4 py-2 font-semibold ${v === null ? "text-slate-300" : v < 0 ? "text-red-600" : v > 0 ? "text-green-700" : "text-slate-400"}`}>
                    {v === null ? "—" : v > 0 ? `+${v}` : v}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{RM(l.avgUnitCost)}</td>
                  <td className="px-4 py-2">{value === null ? "—" : RM(value)}</td>
                  <td className="px-4 py-2">
                    {editable ? (
                      <select className="form-input text-xs w-44" defaultValue={l.reason ?? ""}
                        onChange={(e) => saveLine(l.id, { reason: e.target.value || null })}>
                        <option value="">— none —</option>
                        {REASONS.map((r) => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
                      </select>
                    ) : (l.reason ? REASON_LABELS[l.reason as keyof typeof REASON_LABELS] : "—")}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {l.countedBy?.name ?? "—"}
                    {l.countedAt && <span className="block">{new Date(l.countedAt).toLocaleString("en-MY")}</span>}
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
