"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
const STATUS: Record<string, string> = { DRAFT: "bg-slate-100 text-slate-600", SUBMITTED: "bg-amber-100 text-amber-700", APPROVED: "bg-blue-100 text-blue-700", REJECTED: "bg-red-100 text-red-700", PAID: "bg-green-100 text-green-700" };

export function ClaimsClient({ isManager, canPay }: { isManager: boolean; canPay: boolean }) {
  const [claims, setClaims] = useState<any[]>([]);
  const [limits, setLimits] = useState<any[]>([]);
  const [status, setStatus] = useState("");

  async function load() {
    const q = status ? `?status=${status}` : "";
    const d = await fetch(`/api/hr/claims${q}`).then((r) => r.json());
    setClaims(Array.isArray(d) ? d : []);
  }
  useEffect(() => { load(); }, [status]);
  useEffect(() => { if (!isManager) fetch("/api/hr/claims/limits").then((r) => r.json()).then((d) => Array.isArray(d) && setLimits(d)); }, [isManager]);

  async function act(id: string, path: string, body?: any) {
    const res = await fetch(`/api/hr/claims/${id}/${path}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) { alert((await res.json()).error); return; }
    load();
  }

  const pending = claims.filter((c) => c.status === "SUBMITTED").length;
  const approved = claims.filter((c) => c.status === "APPROVED").length;
  const paid = claims.filter((c) => c.status === "PAID").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Claims</h1>
        <Link href="/hr/claims/new" className="btn-primary">New Claim</Link>
      </div>

      {/* Staff: limit cards */}
      {!isManager && limits.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {limits.map((l) => {
            const used = claims.filter((c) => c.claimType === l.claimType && c.status !== "REJECTED").reduce((s, c) => s + Number(c.amount), 0);
            const pctv = l.limitAmount > 0 ? Math.min(100, (used / l.limitAmount) * 100) : 0;
            return (
              <div key={l.claimType} className="card p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase">{l.claimType}</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{RM(used)} <span className="text-xs text-slate-400">/ {RM(l.limitAmount)}</span></p>
                <div className="h-1.5 bg-slate-100 rounded mt-1.5"><div className={`h-1.5 rounded ${pctv > 80 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${pctv}%` }} /></div>
                <p className="text-[10px] text-slate-400 mt-0.5">{l.period}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Manager: summary */}
      {isManager && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 bg-amber-50 border-amber-200"><p className="text-xs uppercase text-slate-500">Pending</p><p className="text-2xl font-bold text-amber-700">{pending}</p></div>
          <div className="card p-4 bg-blue-50 border-blue-200"><p className="text-xs uppercase text-slate-500">Approved</p><p className="text-2xl font-bold text-blue-700">{approved}</p></div>
          <div className="card p-4 bg-green-50 border-green-200"><p className="text-xs uppercase text-slate-500">Paid</p><p className="text-2xl font-bold text-green-700">{paid}</p></div>
        </div>
      )}

      <div className="flex gap-2">
        <select className="form-input w-40 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{[isManager ? "Staff" : "Date", "Type", "Amount", "Description", "Status", "Actions"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {claims.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No claims.</td></tr>}
            {claims.map((c) => (
              <tr key={c.id} className="table-row">
                <td className="px-4 py-3">{isManager ? c.staffProfile?.user?.name : new Date(c.receiptDate).toLocaleDateString("en-MY")}</td>
                <td className="px-4 py-3">{c.claimType}</td>
                <td className="px-4 py-3 font-medium">{RM(c.amount)}</td>
                <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">{c.description}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${STATUS[c.status]}`}>{c.status}</span></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 text-xs">
                    {!isManager && c.status === "DRAFT" && <button onClick={() => act(c.id, "submit")} className="text-blue-600 hover:underline">Submit</button>}
                    {isManager && c.status === "SUBMITTED" && <button onClick={() => act(c.id, "approve")} className="text-green-600 hover:underline">Approve</button>}
                    {isManager && c.status === "SUBMITTED" && <button onClick={() => { const r = prompt("Reason?"); if (r) act(c.id, "reject", { reviewNote: r }); }} className="text-red-500 hover:underline">Reject</button>}
                    {canPay && c.status === "APPROVED" && <button onClick={() => { const ref = prompt("Payment reference?") ?? ""; act(c.id, "pay", { paymentRef: ref }); }} className="text-green-700 hover:underline">Pay</button>}
                    <Link href={`/hr/claims/${c.id}`} className="text-slate-500 hover:underline">View</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
