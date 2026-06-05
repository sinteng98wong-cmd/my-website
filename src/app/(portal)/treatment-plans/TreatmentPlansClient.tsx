"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Clinic  = { id: string; name: string };
type Doctor  = { id: string; name: string };

type Plan = {
  id: string; planRef: string; title: string; status: string; paymentMode: string;
  totalAmount: number; totalPaid: number; createdAt: string;
  patient:  { name: string; patientRef: string };
  dentist:  { name: string };
  clinic:   { name: string };
  stages:   { status: string; cost: number }[];
  payments: { amount: number }[];
};

const STATUS_COLORS: Record<string,string> = {
  DRAFT:       "badge-slate",
  QUOTED:      "badge-amber",
  ACCEPTED:    "badge-blue",
  IN_PROGRESS: "badge-cyan",
  COMPLETED:   "badge-green",
  CANCELLED:   "badge-red",
};

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY",{ style:"currency", currency:"MYR" }).format(n);
}

export function TreatmentPlansClient({
  clinics, doctors, initialClinicId, initialStatus, role,
}: {
  clinics: Clinic[]; doctors: Doctor[];
  initialClinicId: string; initialStatus: string; role: string;
}) {
  const [clinicId, setClinicId] = useState(initialClinicId);
  const [status,   setStatus]   = useState(initialStatus);
  const [plans,    setPlans]    = useState<Plan[]>([]);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ ...(clinicId ? { clinicId } : {}), ...(status ? { status } : {}) });
    const res = await fetch(`/api/treatment-plans?${qs}`);
    setPlans(res.ok ? await res.json() : []);
    setLoading(false);
  }, [clinicId, status]);

  useEffect(() => { load(); }, [load]);

  const canCreate = ["SUPER_ADMIN","CLINIC_MANAGER","DOCTOR"].includes(role);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Treatment Plans</h1>
          <p className="text-sm text-slate-500 mt-0.5">Multi-stage treatment tracking with quotation and payment management</p>
        </div>
        {canCreate && (
          <Link href="/treatment-plans/new" className="btn-primary">+ New Plan</Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-end gap-3 mb-5">
        <div>
          <label className="form-label">Branch</label>
          <select className="form-input w-auto" value={clinicId} onChange={e => setClinicId(e.target.value)}>
            <option value="">All Branches</option>
            {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Status</label>
          <select className="form-input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {["DRAFT","QUOTED","ACCEPTED","IN_PROGRESS","COMPLETED","CANCELLED"].map(s => (
              <option key={s} value={s}>{s.replace("_"," ")}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Ref","Patient","Plan","Dentist","Status","Total","Paid","Progress",""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && plans.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No plans found</td></tr>}
            {plans.map(p => {
              const done  = p.stages.filter(s => s.status === "COMPLETED").length;
              const total = p.stages.length;
              const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
              const outstanding = Math.max(0, Number(p.totalAmount) - Number(p.totalPaid));
              return (
                <tr key={p.id} className="table-row">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.planRef}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{p.patient.name}</p>
                    <p className="text-xs text-slate-400">{p.patient.patientRef}</p>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-medium text-slate-700 truncate">{p.title}</p>
                    <p className="text-xs text-slate-400">{p.clinic.name}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{p.dentist.name}</td>
                  <td className="px-4 py-3">
                    <span className={STATUS_COLORS[p.status] ?? "badge-slate"}>
                      {p.status.replace("_"," ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">{fmt(Number(p.totalAmount))}</td>
                  <td className="px-4 py-3 font-mono text-green-700">{fmt(Number(p.totalPaid))}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{done}/{total}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/treatment-plans/${p.id}`} className="text-xs text-blue-600 hover:underline">View</Link>
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
