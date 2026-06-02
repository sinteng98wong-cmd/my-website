"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function TodayStaffingWidget({ clinicId }: { clinicId: string }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);

  useEffect(() => {
    if (!clinicId) { setLoading(false); return; }
    fetch(`/api/hr/schedule/day?clinicId=${clinicId}&date=${dateStr}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [clinicId, dateStr]);

  if (!clinicId) return null;

  const onLeave: { name: string; type: string }[] = [];
  if (data?.shifts) {
    for (const sh of data.shifts) for (const s of sh.staff) if (s.onLeave) onLeave.push({ name: s.staffName, type: s.onLeave });
  }
  const lowRoles = data?.staffingStatus?.filter((s: any) => s.isLow) ?? [];

  return (
    <div onClick={() => router.push("/hr/schedule")} className="card p-5 cursor-pointer hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Today's Staffing</h2>
        <span className="text-xs text-slate-400">{today.toLocaleDateString("en-MY", { dateStyle: "medium" })}</span>
      </div>

      {loading ? <p className="text-sm text-slate-400">Loading…</p>
        : !data?.shifts?.length ? <p className="text-sm text-slate-400">No schedule for today. <span className="text-blue-600">Set one up →</span></p>
        : (
        <div className="space-y-3">
          {data.shifts.filter((sh: any) => sh.staff.length).map((sh: any) => (
            <div key={sh.shiftTemplate.id} className="border border-slate-100 rounded-md overflow-hidden">
              <div className="bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                {sh.shiftTemplate.name} {sh.shiftTemplate.startTime && `${sh.shiftTemplate.startTime} – ${sh.shiftTemplate.endTime}`}
              </div>
              <div className="px-3 py-2 space-y-1">
                {sh.staff.map((s: any) => (
                  <div key={s.staffProfileId} className="flex items-center justify-between text-sm">
                    <span className={s.onLeave ? "text-red-400" : "text-slate-700"}>
                      {s.role === "DOCTOR" && s.pairedWith ? `${s.staffName} ↔ ${s.pairedWith.staffName}` : s.staffName}
                      <span className="text-xs text-slate-400 ml-1">{s.role}</span>
                    </span>
                    {s.onLeave ? <span className="text-xs text-red-400">On Leave ⚠</span> : <span className="text-green-500 text-xs">✓</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {onLeave.length > 0 && (
            <p className="text-xs text-slate-500">Staff on leave today: {onLeave.map((s) => `${s.name} — ${s.type}`).join(", ")}</p>
          )}
          {lowRoles.length > 0 && (
            <p className="text-xs text-amber-600">⚠ Below minimum: {lowRoles.map((r: any) => r.role).join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
