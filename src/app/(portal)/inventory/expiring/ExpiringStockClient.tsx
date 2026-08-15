"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Clinic = { id: string; name: string };
const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

export function ExpiringStockClient({ clinics }: { clinics: Clinic[] }) {
  const [clinicId, setClinicId] = useState("");
  const [days, setDays] = useState(90);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const qs = new URLSearchParams({ days: String(days) });
    if (clinicId) qs.set("clinicId", clinicId);
    const res = await fetch(`/api/inventory/expiring?${qs}`);
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Failed to load"); setRows([]); return; }
    setRows(Array.isArray(d) ? d : []);
  }, [clinicId, days]);

  useEffect(() => { load(); }, [load]);

  const expired = rows.filter((r) => r.expired);
  const atRisk = rows.filter((r) => !r.expired);
  const valueExpired = expired.reduce((s, r) => s + r.estimatedValue, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Expiring &amp; Expired Stock</h1>
          <p className="text-sm text-slate-500 mt-0.5 max-w-2xl">
            Expired stock does not disappear on its own — write it off so the loss is recorded in the
            ledger. Write-offs need PIC approval.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="form-input w-48 text-sm" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            <option value="">All my clinics</option>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="form-input w-40 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={30}>Next 30 days</option>
            <option value={90}>Next 90 days</option>
            <option value={180}>Next 180 days</option>
          </select>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="card p-4"><p className="text-xs uppercase text-slate-500">Expired batches</p>
          <p className={`text-xl font-bold ${expired.length ? "text-red-700" : "text-green-700"}`}>{expired.length}</p></div>
        <div className="card p-4"><p className="text-xs uppercase text-slate-500">Value expired</p>
          <p className="text-xl font-bold text-red-700">{RM(valueExpired)}</p></div>
        <div className="card p-4"><p className="text-xs uppercase text-slate-500">Expiring soon</p>
          <p className="text-xl font-bold text-amber-700">{atRisk.length}</p></div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>{["Item", "Batch", "Expiry", "Clinic", "Remaining", "Avg Cost", "Est. Value", ""]
              .map((h) => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Nothing expiring in this window.</td></tr>
            )}
            {rows.map((b) => (
              <tr key={b.id} className={`table-row ${b.expired ? "bg-red-50/50" : ""}`}>
                <td className="px-4 py-3 font-medium">
                  {b.item.name}<span className="block text-xs text-slate-400 font-mono">{b.item.sku}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{b.batchNumber}</td>
                <td className="px-4 py-3">
                  {b.expired
                    ? <span className="text-xs font-semibold text-white bg-red-600 px-2 py-0.5 rounded">EXPIRED</span>
                    : <span className="text-xs text-amber-700">{new Date(b.expiryDate).toLocaleDateString("en-MY")}</span>}
                  {b.expired && <span className="block text-xs text-red-600 mt-0.5">{new Date(b.expiryDate).toLocaleDateString("en-MY")}</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{b.clinic.name}</td>
                <td className="px-4 py-3 font-medium">{b.remainingQty} {b.item.unit}</td>
                <td className="px-4 py-3 text-slate-500">{RM(b.avgUnitCost)}</td>
                <td className="px-4 py-3">{RM(b.estimatedValue)}</td>
                <td className="px-4 py-3">
                  <Link href={`/inventory/stock-issues/new?batchId=${b.id}`} className="text-xs text-blue-600 hover:underline">
                    Write off →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
