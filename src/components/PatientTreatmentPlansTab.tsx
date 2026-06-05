"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Plan = {
  id: string; planRef: string; title: string; status: string;
  totalAmount: number; totalPaid: number;
  dentist: { name: string };
  stages: { status: string }[];
};

const STATUS_COLORS: Record<string,string> = {
  DRAFT:"badge-slate", QUOTED:"badge-amber", ACCEPTED:"badge-blue",
  IN_PROGRESS:"badge-cyan", COMPLETED:"badge-green", CANCELLED:"badge-red",
};

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY",{ style:"currency",currency:"MYR" }).format(n);
}

export function PatientTreatmentPlansTab({ patientId }: { patientId: string }) {
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/treatment-plans?patientId=${patientId}`)
      .then(r => r.json())
      .then(setPlans)
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) return <div className="py-8 text-center text-slate-400">Loading…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-700">Treatment Plans</h2>
        <Link href={`/treatment-plans/new?patientId=${patientId}`} className="btn-outline text-xs py-1 px-3">+ New Plan</Link>
      </div>

      {plans.length === 0 && (
        <div className="card p-8 text-center text-slate-400">No treatment plans yet.</div>
      )}

      <div className="space-y-3">
        {plans.map(p => {
          const done  = p.stages.filter(s => s.status === "COMPLETED").length;
          const total = p.stages.length;
          const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
          const outstanding = Math.max(0, Number(p.totalAmount) - Number(p.totalPaid));

          return (
            <div key={p.id} className="card p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Link href={`/treatment-plans/${p.id}`} className="font-medium text-slate-800 hover:text-blue-600 truncate">
                    {p.title}
                  </Link>
                  <span className={STATUS_COLORS[p.status] ?? "badge-slate"}>{p.status.replace("_"," ")}</span>
                </div>
                <p className="text-xs text-slate-400">{p.planRef} · {p.dentist.name}</p>
              </div>
              <div className="flex items-center gap-6 text-sm shrink-0">
                {total > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-slate-500">{done}/{total}</span>
                  </div>
                )}
                <div className="text-right">
                  <p className="font-mono text-slate-700">{fmt(Number(p.totalAmount))}</p>
                  {outstanding > 0 && <p className="font-mono text-xs text-amber-600">{fmt(outstanding)} outstanding</p>}
                </div>
                <Link href={`/treatment-plans/${p.id}`} className="text-xs text-blue-600 hover:underline">View →</Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
