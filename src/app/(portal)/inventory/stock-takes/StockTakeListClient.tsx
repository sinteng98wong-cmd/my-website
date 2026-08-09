"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Clinic = { id: string; name: string };

const STATUS_CLASS: Record<string, string> = {
  DRAFT:            "bg-slate-100 text-slate-600",
  SUBMITTED:        "bg-amber-100 text-amber-700",
  RECOUNT_REQUIRED: "bg-orange-100 text-orange-700",
  APPROVED:         "bg-green-100 text-green-700",
  REJECTED:         "bg-red-100 text-red-700",
};

const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

export function StockTakeListClient({ clinics }: { clinics: Clinic[] }) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [takes, setTakes] = useState<any[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const qs = new URLSearchParams();
    if (clinicId) qs.set("clinicId", clinicId);
    if (status) qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const res = await fetch(`/api/stock-takes?${qs}`);
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Failed to load"); setTakes([]); return; }
    setTakes(Array.isArray(d) ? d : []);
  }, [clinicId, status, from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Stock Takes</h1>
          <p className="text-sm text-slate-500 mt-0.5 max-w-2xl">
            Physical counts and the adjustments they produce. Approval is the only thing that moves
            stock — it posts adjustment movements into the ledger and cannot be undone by editing.
          </p>
        </div>
        <Link href="/inventory/stock-takes/new" className="btn-primary text-sm">+ New Stock Take</Link>
      </div>

      <div className="card p-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="text-xs uppercase text-slate-500">Clinic</span>
          <select className="form-input mt-1 w-48" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            <option value="">All my clinics</option>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase text-slate-500">Status</span>
          <select className="form-input mt-1 w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any</option>
            {Object.keys(STATUS_CLASS).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase text-slate-500">From</span>
          <input type="date" className="form-input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs uppercase text-slate-500">To</span>
          <input type="date" className="form-input mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>{["Reference", "Clinic", "Items", "Variance Qty", "Variance Value", "Status", "Raised by", "Date", ""]
              .map((h) => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody>
            {takes.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No stock takes yet.</td></tr>
            )}
            {takes.map((t) => (
              <tr key={t.id} className="table-row cursor-pointer" onClick={() => router.push(`/inventory/stock-takes/${t.id}`)}>
                <td className="px-4 py-3 font-medium">{t.reference}</td>
                <td className="px-4 py-3 text-slate-600">{t.clinic.name}</td>
                <td className="px-4 py-3 text-center">{t._count.lines}</td>
                <td className={`px-4 py-3 font-medium ${t.totalVarianceQty < 0 ? "text-red-600" : t.totalVarianceQty > 0 ? "text-green-700" : "text-slate-400"}`}>
                  {t.totalVarianceQty > 0 ? "+" : ""}{t.totalVarianceQty}
                </td>
                <td className="px-4 py-3">{RM(t.totalVarianceValue)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_CLASS[t.status]}`}>{t.status.replace("_", " ")}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{t.createdBy?.name}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{new Date(t.createdAt).toLocaleDateString("en-MY")}</td>
                <td className="px-4 py-3 text-blue-600 text-xs">Open →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
