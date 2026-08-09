"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { REASONS, REASON_LABELS } from "@/lib/stock-issue";

type Clinic = { id: string; name: string };

const STATUS_CLASS: Record<string, string> = {
  DRAFT:            "bg-slate-100 text-slate-600",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700",
  POSTED:           "bg-green-100 text-green-700",
  REJECTED:         "bg-red-100 text-red-700",
};

const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

export function StockIssueListClient({ clinics }: { clinics: Clinic[] }) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [issues, setIssues] = useState<any[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const qs = new URLSearchParams();
    if (clinicId) qs.set("clinicId", clinicId);
    if (status) qs.set("status", status);
    if (reason) qs.set("reason", reason);
    const res = await fetch(`/api/stock-issues?${qs}`);
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Failed to load"); setIssues([]); return; }
    setIssues(Array.isArray(d) ? d : []);
  }, [clinicId, status, reason]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Stock Issues</h1>
          <p className="text-sm text-slate-500 mt-0.5 max-w-2xl">
            Consumption and write-offs. Batches are consumed earliest-expiry-first; posting is what
            moves stock and it cannot be undone by editing.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory/expiring" className="btn-secondary text-sm">Expiring Stock</Link>
          <Link href="/inventory/stock-issues/new" className="btn-primary text-sm">+ New Stock Issue</Link>
        </div>
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
          <span className="text-xs uppercase text-slate-500">Reason</span>
          <select className="form-input mt-1 w-48" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Any</option>
            {REASONS.map((r) => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>{["Reference", "Clinic", "Reason", "Lines", "Qty", "Value", "Status", "Raised by", "Date", ""]
              .map((h) => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody>
            {issues.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">No stock issues yet.</td></tr>
            )}
            {issues.map((i) => (
              <tr key={i.id} className="table-row cursor-pointer" onClick={() => router.push(`/inventory/stock-issues/${i.id}`)}>
                <td className="px-4 py-3 font-medium">{i.reference}</td>
                <td className="px-4 py-3 text-slate-600">{i.clinic.name}</td>
                <td className="px-4 py-3 text-slate-600">{REASON_LABELS[i.reason as keyof typeof REASON_LABELS]}</td>
                <td className="px-4 py-3 text-center">{i._count.lines}</td>
                <td className="px-4 py-3 text-red-600 font-medium">−{i.totalQty}</td>
                <td className="px-4 py-3">{RM(i.totalValue)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_CLASS[i.status]}`}>{i.status.replace("_", " ")}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{i.createdBy?.name}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{new Date(i.createdAt).toLocaleDateString("en-MY")}</td>
                <td className="px-4 py-3 text-blue-600 text-xs">Open →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
