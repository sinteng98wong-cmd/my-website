"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { REASONS, REASON_LABELS, requiresApproval } from "@/lib/stock-issue";

type Clinic = { id: string; name: string };
type Item = { id: string; sku: string; name: string; unit: string };

export function NewStockIssueClient({
  clinics, items, preset,
}: { clinics: Clinic[]; items: Item[]; preset: any }) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState(preset?.clinicId ?? clinics[0]?.id ?? "");
  const [reason, setReason] = useState<any>(preset ? "EXPIRED" : "CLINICAL_CONSUMPTION");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<any[]>(
    preset
      ? [{ itemId: preset.itemId, quantity: preset.remainingQty, batchId: preset.id }]
      : [{ itemId: items[0]?.id ?? "", quantity: 1, batchId: "" }]
  );
  const [batches, setBatches] = useState<Record<string, any[]>>({});
  const [stock, setStock] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clinicId) return;
    fetch(`/api/inventory/stock?clinicId=${clinicId}`).then((r) => r.json()).then((rows) => {
      if (!Array.isArray(rows)) return;
      setStock(Object.fromEntries(rows.map((r: any) => [r.itemId, r.quantity])));
    }).catch(() => {});
    fetch(`/api/inventory/batches?clinicId=${clinicId}`).then((r) => r.json()).then((rows) => {
      if (!Array.isArray(rows)) return;
      const byItem: Record<string, any[]> = {};
      for (const b of rows) (byItem[b.item.id] ??= []).push(b);
      setBatches(byItem);
    }).catch(() => {});
  }, [clinicId]);

  const setLine = (i: number, patch: any) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  async function submit() {
    setBusy(true); setError("");
    const res = await fetch("/api/stock-issues", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinicId, reason, notes: notes || undefined,
        lines: lines.map((l) => ({
          itemId: l.itemId, quantity: Number(l.quantity), batchId: l.batchId || undefined,
        })),
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "Could not create the stock issue"); return; }
    router.push(`/inventory/stock-issues/${d.id}`);
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <Link href="/inventory/stock-issues" className="text-sm text-slate-500 hover:text-slate-700">← Stock Issues</Link>
      <h1 className="page-title">New Stock Issue</h1>
      <p className="text-sm text-slate-500">
        Leave the batch blank to consume earliest-expiry-first. Write-offs need the clinic PIC to approve
        before any stock moves.
      </p>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

      <div className="card p-5 space-y-4 text-sm">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs uppercase text-slate-500">Clinic</span>
            <select className="form-input mt-1 w-full" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
              {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase text-slate-500">Reason</span>
            <select className="form-input mt-1 w-full" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
            </select>
          </label>
        </div>

        {requiresApproval(reason) && (
          <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            This is a write-off — the clinic PIC must approve it before stock moves.
          </div>
        )}

        <label className="block">
          <span className="text-xs uppercase text-slate-500">Notes / reference</span>
          <input className="form-input mt-1 w-full" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. surgery room restock" />
        </label>

        <div className="space-y-2">
          <span className="text-xs uppercase text-slate-500">Lines</span>
          {lines.map((l, i) => {
            const itemBatches = batches[l.itemId] ?? [];
            const available = stock[l.itemId] ?? 0;
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <label className="col-span-5">
                  <select className="form-input w-full text-sm" value={l.itemId}
                    onChange={(e) => setLine(i, { itemId: e.target.value, batchId: "" })}>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>)}
                  </select>
                  <span className="text-xs text-slate-400">{available} available</span>
                </label>
                <label className="col-span-2">
                  <input type="number" min={1} className="form-input w-full text-sm" value={l.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })} />
                </label>
                <label className="col-span-4">
                  <select className="form-input w-full text-sm" value={l.batchId ?? ""}
                    onChange={(e) => setLine(i, { batchId: e.target.value })}>
                    <option value="">FEFO (earliest expiry first)</option>
                    {itemBatches.map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.batchNumber} · {b.remainingQty} left
                        {b.expiryDate ? ` · exp ${new Date(b.expiryDate).toLocaleDateString("en-MY")}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="col-span-1 btn-ghost text-xs"
                  onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                  disabled={lines.length === 1}>Remove</button>
              </div>
            );
          })}
          <button type="button" className="btn-secondary text-xs"
            onClick={() => setLines((p) => [...p, { itemId: items[0]?.id ?? "", quantity: 1, batchId: "" }])}>
            + Add line
          </button>
        </div>

        <button onClick={submit} disabled={busy || !clinicId} className="btn-primary text-sm">
          {busy ? "Creating…" : "Create Stock Issue"}
        </button>
      </div>
    </div>
  );
}
