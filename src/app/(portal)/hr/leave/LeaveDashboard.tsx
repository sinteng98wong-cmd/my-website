"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STATUS_CLASS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700", APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700", CANCELLED: "bg-slate-100 text-slate-500",
  WITHDRAWN: "bg-slate-100 text-slate-500",
};
const ROLE_COLOR: Record<string, string> = {
  DOCTOR: "bg-blue-500", NURSE: "bg-green-500", RECEPTIONIST: "bg-purple-500", STOREKEEPER: "bg-orange-500",
};
const fmt = (d: string | Date) => new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
const todayISO = () => new Date().toISOString().slice(0, 10);

export function LeaveDashboard({ isManager, clinicId }: { isManager: boolean; clinicId: string }) {
  const [balances, setBalances] = useState<any[]>([]);
  const [leaves, setLeaves]     = useState<any[]>([]);
  const [month] = useState(() => new Date().toISOString().slice(0, 7));
  const [calendar, setCalendar] = useState<any[]>([]);

  useEffect(() => {
    if (!isManager) fetch("/api/hr/leave-balances").then((r) => r.json()).then((d) => Array.isArray(d) && setBalances(d)).catch(() => {});
    fetch("/api/hr/leave").then((r) => r.json()).then((d) => Array.isArray(d) && setLeaves(d)).catch(() => {});
    const q = new URLSearchParams({ month }); if (clinicId) q.set("clinicId", clinicId);
    fetch(`/api/hr/leave/calendar?${q}`).then((r) => r.json()).then((d) => Array.isArray(d) && setCalendar(d)).catch(() => {});
  }, [isManager, clinicId, month]);

  async function withdraw(id: string) {
    if (!confirm("Withdraw this leave application?")) return;
    await fetch(`/api/hr/leave/${id}/cancel`, { method: "PATCH" });
    setLeaves((p) => p.map((l) => l.id === id ? { ...l, status: "WITHDRAWN" } : l));
  }

  const pending = leaves.filter((l) => l.status === "PENDING");
  const today = todayISO();
  const onLeaveToday = calendar.filter((l) => l.startDate.slice(0, 10) <= today && l.endDate.slice(0, 10) >= today);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Leave Management</h1>
        <Link href="/hr/leave/apply" className="btn-primary">Apply for Leave</Link>
      </div>

      {/* STAFF: balance cards */}
      {!isManager && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {balances.map((b) => {
            const bal = Number(b.balance), ent = Number(b.entitled) + Number(b.carriedOver);
            const pctv = ent > 0 ? Math.max(0, Math.min(100, (bal / ent) * 100)) : 0;
            return (
              <div key={b.leaveType} className="card p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase">{b.leaveType.replace(/_/g, " ")}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{bal}<span className="text-sm text-slate-400">/{ent}</span></p>
                <div className="h-1.5 bg-slate-100 rounded mt-2"><div className={`h-1.5 rounded ${bal < 3 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${pctv}%` }} /></div>
                <p className="text-xs text-slate-400 mt-1">Taken {Number(b.taken)} · Pending {Number(b.pending)}</p>
                {bal < 3 && <p className="text-xs text-amber-600 mt-0.5">Low balance</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* MANAGER: summary cards */}
      {isManager && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card p-4 bg-amber-50 border-amber-200"><p className="text-xs uppercase text-slate-500">Pending Approvals</p><p className="text-2xl font-bold text-amber-700">{pending.length}</p></div>
          <div className="card p-4 bg-blue-50 border-blue-200"><p className="text-xs uppercase text-slate-500">On Leave Today</p><p className="text-2xl font-bold text-blue-700">{onLeaveToday.length}</p></div>
          <div className="card p-4"><p className="text-xs uppercase text-slate-500">Approved This Month</p><p className="text-2xl font-bold text-slate-800">{calendar.length}</p></div>
          <div className="card p-4"><p className="text-xs uppercase text-slate-500">Total Applications</p><p className="text-2xl font-bold text-slate-800">{leaves.length}</p></div>
        </div>
      )}

      {/* MANAGER: pending approvals */}
      {isManager && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100"><h2 className="font-semibold text-slate-700">Pending Approvals</h2></div>
          <table className="w-full text-sm">
            <thead className="table-header"><tr>{["Staff", "Role", "Type", "Dates", "Days", "Reason", ""].map((h) => <th key={h} className="px-4 py-2.5 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody>
              {pending.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No pending approvals.</td></tr>}
              {pending.map((l) => (
                <tr key={l.id} className="table-row">
                  <td className="px-4 py-2.5">{l.staffProfile?.user?.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{l.staffProfile?.user?.role}</td>
                  <td className="px-4 py-2.5">{l.leaveType}</td>
                  <td className="px-4 py-2.5">{fmt(l.startDate)}–{fmt(l.endDate)}</td>
                  <td className="px-4 py-2.5">{Number(l.totalDays)}</td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-[180px] truncate">{l.reason ?? "—"}</td>
                  <td className="px-4 py-2.5"><Link href={`/hr/leave/${l.id}`} className="text-blue-600 hover:underline text-xs">Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* STAFF: my history */}
      {!isManager && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100"><h2 className="font-semibold text-slate-700">My Leave History</h2></div>
          <table className="w-full text-sm">
            <thead className="table-header"><tr>{["Ref", "Type", "Dates", "Days", "Status", ""].map((h) => <th key={h} className="px-4 py-2.5 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody>
              {leaves.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No applications yet.</td></tr>}
              {leaves.map((l) => (
                <tr key={l.id} className="table-row">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{l.leaveRef}</td>
                  <td className="px-4 py-2.5">{l.leaveType}</td>
                  <td className="px-4 py-2.5">{fmt(l.startDate)}–{fmt(l.endDate)}</td>
                  <td className="px-4 py-2.5">{Number(l.totalDays)}</td>
                  <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded ${STATUS_CLASS[l.status]}`}>{l.status}</span></td>
                  <td className="px-4 py-2.5">
                    {l.status === "PENDING" && <button onClick={() => withdraw(l.id)} className="text-red-500 hover:underline text-xs">Withdraw</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Team leave calendar (both roles) */}
      <div className="card p-5">
        <h2 className="font-semibold text-slate-700 mb-3">Team Leave — {month}</h2>
        {calendar.length === 0 ? <p className="text-sm text-slate-400">No approved leave this month.</p> : (
          <div className="space-y-1.5">
            {calendar.map((l) => (
              <div key={l.id} className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full ${ROLE_COLOR[l.role] ?? "bg-slate-400"}`} />
                <span className="font-medium text-slate-700 w-40 truncate">{l.staffName}</span>
                <span className="text-slate-400 text-xs w-24">{l.role}</span>
                <span className="text-slate-500">{fmt(l.startDate)}–{fmt(l.endDate)}</span>
                <span className="text-slate-400 text-xs">{l.leaveType} · {l.totalDays}d</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
