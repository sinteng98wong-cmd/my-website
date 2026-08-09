"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Option = { id: string; name: string };

export function NewStockTakeClient({ clinics, categories }: { clinics: Option[]; categories: Option[] }) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [scope, setScope] = useState<"ALL" | "CATEGORY">("ALL");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true); setError("");
    const res = await fetch("/api/stock-takes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinicId,
        notes: notes || undefined,
        categoryId: scope === "CATEGORY" ? categoryId || undefined : undefined,
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "Could not create the stock take"); return; }
    router.push(`/inventory/stock-takes/${d.id}`);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Link href="/inventory/stock-takes" className="text-sm text-slate-500 hover:text-slate-700">← Stock Takes</Link>
      <h1 className="page-title">New Stock Take</h1>
      <p className="text-sm text-slate-500">
        The system quantity of every selected item is snapshotted now. If stock moves before the
        count is approved, the affected lines must be re-counted against the new figures.
      </p>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

      <div className="card p-5 space-y-4 text-sm">
        <label className="block">
          <span className="text-xs uppercase text-slate-500">Clinic</span>
          <select className="form-input mt-1 w-full" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <div>
          <span className="text-xs uppercase text-slate-500">Scope</span>
          <div className="flex gap-4 mt-1">
            <label className="flex items-center gap-2">
              <input type="radio" checked={scope === "ALL"} onChange={() => setScope("ALL")} />
              <span>All stock items</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={scope === "CATEGORY"} onChange={() => setScope("CATEGORY")} />
              <span>One category</span>
            </label>
          </div>
        </div>

        {scope === "CATEGORY" && (
          <label className="block">
            <span className="text-xs uppercase text-slate-500">Category</span>
            <select className="form-input mt-1 w-full" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Select a category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        <label className="block">
          <span className="text-xs uppercase text-slate-500">Notes</span>
          <input className="form-input mt-1 w-full" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. month-end count" />
        </label>

        <button onClick={create} disabled={busy || !clinicId || (scope === "CATEGORY" && !categoryId)}
          className="btn-primary text-sm">
          {busy ? "Creating…" : "Create Count Sheet"}
        </button>
      </div>
    </div>
  );
}
