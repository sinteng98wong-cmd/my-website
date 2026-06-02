"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Clinic = { id: string; name: string };

const fmt = (d: string) => new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

export function HrDashboardClient({ clinics }: { clinics: Clinic[] }) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [summary, setSummary] = useState<any>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [trainings, setTrainings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    const year = new Date().getFullYear();
    const [sumData, staffData, leaveData, claimData, trainingData] = await Promise.all([
      fetch(`/api/reports/hr/summary?clinicId=${clinicId}&year=${year}`).then(r => r.json()).catch(() => null),
      fetch(`/api/hr/staff?clinicId=${clinicId}`).then(r => r.json()).catch(() => []),
      fetch(`/api/hr/leave?clinicId=${clinicId}&status=PENDING`).then(r => r.json()).catch(() => []),
      fetch(`/api/hr/claims?clinicId=${clinicId}&status=SUBMITTED`).then(r => r.json()).catch(() => []),
      fetch(`/api/hr/training?clinicId=${clinicId}`).then(r => r.json()).catch(() => []),
    ]);
    setSummary(sumData);
    setStaff(Array.isArray(staffData) ? staffData : []);
    setLeaves(Array.isArray(leaveData) ? leaveData : []);
    setClaims(Array.isArray(claimData) ? claimData : []);
    setTrainings(Array.isArray(trainingData) ? trainingData : []);
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { load(); }, [load]);

  const active = staff.filter(s => s.employmentStatus === "ACTIVE").length;
  const probation = staff.filter(s => s.employmentStatus === "PROBATION").length;
  const suspended = staff.filter(s => s.employmentStatus === "SUSPENDED").length;

  const upcomingLeaves = leaves.filter(l => new Date(l.startDate) > new Date()).slice(0, 8);
  const thisMonthTrainings = trainings.filter(t => t.startDate?.slice(0, 7) === today.slice(0, 7)).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">HR Overview</h1>
        <div className="flex items-center gap-2">
          <select className="form-input w-44 text-sm" value={clinicId} onChange={e => setClinicId(e.target.value)}>
            {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={load} className="btn-secondary text-sm">Refresh</button>
        </div>
      </div>

      {/* Headcount */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Staff", value: staff.length, color: "text-slate-800" },
          { label: "Active", value: active, color: "text-green-700" },
          { label: "Probation", value: probation, color: "text-amber-700" },
          { label: "Pending Leaves", value: leaves.length, color: "text-blue-700" },
          { label: "Pending Claims", value: claims.length, color: "text-purple-700" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{loading ? "…" : value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {!loading && (
        <div className="space-y-2">
          {leaves.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 cursor-pointer" onClick={() => router.push("/hr/leave")}>
              <span>🟡</span><span><strong>{leaves.length}</strong> leave application{leaves.length !== 1 ? "s" : ""} awaiting approval</span>
            </div>
          )}
          {claims.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 cursor-pointer" onClick={() => router.push("/hr/claims")}>
              <span>🟡</span><span><strong>{claims.length}</strong> claim{claims.length !== 1 ? "s" : ""} awaiting approval</span>
            </div>
          )}
          {probation > 0 && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800 cursor-pointer" onClick={() => router.push("/hr/staff")}>
              <span>📋</span><span><strong>{probation}</strong> staff on probation — check confirmation dates</span>
            </div>
          )}
          {suspended > 0 && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
              <span>🔴</span><span><strong>{suspended}</strong> staff currently suspended</span>
            </div>
          )}
        </div>
      )}

      {/* Analytics row */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card p-4">
            <p className="text-xs text-slate-400 uppercase mb-2">Leave this year</p>
            <p className="text-xl font-bold text-slate-800">{summary.leave?.totalDays ?? 0} days</p>
            {summary.leave?.byType && Object.entries(summary.leave.byType).slice(0, 3).map(([k, v]: any) => (
              <p key={k} className="text-xs text-slate-500 mt-0.5">{k}: {v}d</p>
            ))}
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-400 uppercase mb-2">KPI (completed)</p>
            <p className="text-xl font-bold text-slate-800">{summary.kpi?.avgScore ? `${summary.kpi.avgScore}%` : "—"}</p>
            <p className="text-xs text-slate-500">{summary.kpi?.completedCount ?? 0} KPIs this year</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-400 uppercase mb-2">Attendance rate</p>
            <p className="text-xl font-bold text-slate-800">{summary.attendance?.avgAttendanceRate?.toFixed(1) ?? "—"}%</p>
            <p className="text-xs text-slate-500">Avg late: {summary.attendance?.avgLateCount?.toFixed(1) ?? 0}/mo</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-400 uppercase mb-2">Training</p>
            <p className="text-xl font-bold text-slate-800">{summary.training?.completionRate ?? 0}%</p>
            <p className="text-xs text-slate-500">{summary.training?.completed ?? 0} / {summary.training?.enrolled ?? 0} completed</p>
          </div>
        </div>
      )}

      {/* Bottom grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Upcoming leaves */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 text-sm">Pending Leave Requests</h2>
            <a href="/hr/leave" className="text-xs text-blue-600 hover:underline">View all</a>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50">{["Staff","Type","Dates","Days"].map(h => <th key={h} className="px-3 py-2 text-left text-xs text-slate-500">{h}</th>)}</tr></thead>
            <tbody>
              {leaves.slice(0, 6).length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400 text-xs">No pending leaves</td></tr>}
              {leaves.slice(0, 6).map((l: any) => (
                <tr key={l.id} className="border-t border-slate-50">
                  <td className="px-3 py-2 font-medium text-xs">{l.staffProfile?.user?.name}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{l.leaveType}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{fmt(l.startDate)} – {fmt(l.endDate)}</td>
                  <td className="px-3 py-2 text-xs">{l.totalDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* This month trainings */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 text-sm">Training This Month</h2>
            <a href="/hr/training" className="text-xs text-blue-600 hover:underline">View all</a>
          </div>
          <div className="divide-y divide-slate-50">
            {thisMonthTrainings.length === 0 && <p className="px-4 py-4 text-xs text-slate-400 text-center">No training sessions this month</p>}
            {thisMonthTrainings.map((t: any) => (
              <div key={t.id} className="px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/hr/training/${t.id}`)}>
                <div>
                  <p className="text-sm font-medium text-slate-800">{t.title}</p>
                  <p className="text-xs text-slate-400">{fmt(t.startDate)} · {t.type ?? "Training"}</p>
                </div>
                <span className="text-xs text-slate-500">{t._count?.participants ?? 0} enrolled</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Staff quick overview */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 text-sm">Staff Directory</h2>
          <a href="/hr/staff" className="text-xs text-blue-600 hover:underline">View all →</a>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50">{["Name","Role","Type","Status","Join Date",""].map(h => <th key={h} className="px-4 py-2 text-left text-xs text-slate-500">{h}</th>)}</tr></thead>
          <tbody>
            {staff.slice(0, 8).map((s: any) => (
              <tr key={s.id} className="border-t border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => router.push(`/hr/staff/${s.id}`)}>
                <td className="px-4 py-2 font-medium">{s.user.name}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{s.user.role}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{s.employmentType?.replace("_"," ")}</td>
                <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${{ACTIVE:"bg-green-100 text-green-700",PROBATION:"bg-amber-100 text-amber-700",SUSPENDED:"bg-red-100 text-red-700",RESIGNED:"bg-slate-100 text-slate-500",TERMINATED:"bg-slate-100 text-slate-500"}[s.employmentStatus as string] ?? ""}`}>{s.employmentStatus}</span></td>
                <td className="px-4 py-2 text-xs text-slate-400">{s.joinDate ? fmt(s.joinDate) : "—"}</td>
                <td className="px-4 py-2 text-blue-600 text-xs">View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
