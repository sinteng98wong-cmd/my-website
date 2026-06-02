"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const TYPES = ["MEDICAL", "TRANSPORT", "MEAL", "ACCOMMODATION", "TRAINING", "UNIFORM", "TELEPHONE", "OTHER"];
const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

export default function NewClaimPage() {
  const router = useRouter();
  const [limits, setLimits] = useState<any[]>([]);
  const [form, setForm] = useState({ claimType: "TRANSPORT", amount: "", receiptDate: new Date().toISOString().slice(0, 10), description: "", receiptUrl: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch("/api/hr/claims/limits").then((r) => r.json()).then((d) => Array.isArray(d) && setLimits(d)); }, []);
  const limit = limits.find((l) => l.claimType === form.claimType);

  async function submit(immediately: boolean) {
    setError(""); setSaving(true);
    const res = await fetch("/api/hr/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
    const d = await res.json();
    if (!res.ok) { setError(d.error); setSaving(false); return; }
    if (immediately) await fetch(`/api/hr/claims/${d.claim.id}/submit`, { method: "PATCH" });
    router.push("/hr/claims");
  }

  const overLimit = limit && Number(form.amount) > limit.limitAmount;

  return (
    <div className="max-w-lg">
      <div className="mb-6"><Link href="/hr/claims" className="text-sm text-slate-500 hover:text-slate-700">← Claims</Link><h1 className="page-title mt-2">New Claim</h1></div>
      <div className="card p-6 space-y-4">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}
        <div>
          <label className="form-label">Claim Type</label>
          <select className="form-input" value={form.claimType} onChange={(e) => setForm((f) => ({ ...f, claimType: e.target.value }))}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          {limit && <p className="text-xs text-slate-400 mt-1">{form.claimType}: limit {RM(limit.limitAmount)} ({limit.period})</p>}
        </div>
        <div><label className="form-label">Amount (RM)</label><input type="number" step="0.01" min="0" className="form-input" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></div>
        {overLimit && <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">This claim exceeds the {limit.period.toLowerCase()} limit. Your manager will review.</p>}
        <div><label className="form-label">Receipt Date</label><input type="date" className="form-input" value={form.receiptDate} onChange={(e) => setForm((f) => ({ ...f, receiptDate: e.target.value }))} /></div>
        <div><label className="form-label">Description</label><textarea rows={3} required className="form-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
        <div><label className="form-label">Receipt URL (image/PDF)</label><input className="form-input" value={form.receiptUrl} onChange={(e) => setForm((f) => ({ ...f, receiptUrl: e.target.value }))} placeholder="https://…" /></div>
        <div className="flex gap-3">
          <button onClick={() => submit(false)} disabled={saving || !form.amount || !form.description} className="btn-outline">Save as Draft</button>
          <button onClick={() => submit(true)} disabled={saving || !form.amount || !form.description} className="btn-primary">Submit</button>
        </div>
      </div>
    </div>
  );
}
