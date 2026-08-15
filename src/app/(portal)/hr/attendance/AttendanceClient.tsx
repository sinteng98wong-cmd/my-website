"use client";

import { useEffect, useState } from "react";

type Clinic = { id: string; name: string };

const STATUSES = ["PRESENT","ABSENT","LATE","HALF_DAY","ON_LEAVE","PUBLIC_HOLIDAY","OFF_DAY","REMOTE"] as const;
const STATUS_CLASS: Record<string, string> = { PRESENT:"bg-green-100 text-green-700", ABSENT:"bg-red-100 text-red-700", LATE:"bg-amber-100 text-amber-700", HALF_DAY:"bg-orange-100 text-orange-700", ON_LEAVE:"bg-blue-100 text-blue-700", PUBLIC_HOLIDAY:"bg-purple-100 text-purple-700", OFF_DAY:"bg-slate-100 text-slate-500", REMOTE:"bg-teal-100 text-teal-700" };

export function AttendanceClient({ clinics }: { clinics: Clinic[] }) {
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [mode, setMode] = useState<"day" | "month">("day");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submission, setSubmission] = useState<any>(null);
  const [msg, setMsg] = useState("");

  async function loadDay() {
    const d = await fetch(`/api/hr/attendance?clinicId=${clinicId}&date=${date}`).then(r => r.json()).catch(() => []);
    setRecords(Array.isArray(d) ? d : []);
    const init: Record<string, string> = {};
    for (const r of (Array.isArray(d) ? d : [])) init[r.id] = r.status;
    setEditing(init);
  }

  async function loadMonth() {
    const [d, s] = await Promise.all([
      fetch(`/api/hr/attendance/monthly-summary?clinicId=${clinicId}&month=${month}`).then(r => r.json()).catch(() => []),
      fetch(`/api/hr/attendance/monthly-submission?clinicId=${clinicId}&month=${month}`).then(r => r.json()).catch(() => null),
    ]);
    setSummary(Array.isArray(d) ? d : []);
    setSubmission(s && !s.error ? s : null);
  }

  useEffect(() => { setMsg(""); if (mode === "day") loadDay(); else loadMonth(); }, [clinicId, date, month, mode]);

  async function submitMonth() {
    if (!confirm(`Submit ${month} attendance for this branch? Records for the month are locked once submitted.`)) return;
    setBusy(true); setMsg("");
    const res = await fetch("/api/hr/attendance/monthly-submission", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicId, month }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? `Attendance for ${month} submitted.` : d.error ?? "Submission failed");
    loadMonth();
  }

  async function saveStatus(recordId: string, status: string) {
    await fetch(`/api/hr/attendance/${recordId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    loadDay();
  }

  async function markAllPresent() {
    setBusy(true);
    const updates = records.map(r => ({ staffProfileId: r.staffProfileId, clinicId, date, status: "PRESENT" }));
    await fetch("/api/hr/attendance/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: updates }) });
    setBusy(false);
    loadDay();
  }

  function exportMonthly() {
    const rows = [["Name","Role","Present","Absent","Late","On Leave","PH","OT (hrs)"]];
    for (const s of summary) rows.push([s.name, s.role, s.present, s.absent, s.late, s.onLeave, s.publicHoliday, (s.overtimeMins / 60).toFixed(1)]);
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `attendance-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">Attendance Management</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="form-input w-44 text-sm" value={clinicId} onChange={e => setClinicId(e.target.value)}>
            {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex rounded border border-slate-200 overflow-hidden text-sm">
            <button onClick={() => setMode("day")} className={`px-3 py-1.5 ${mode === "day" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Daily</button>
            <button onClick={() => setMode("month")} className={`px-3 py-1.5 ${mode === "month" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Monthly</button>
          </div>
          {mode === "day"
            ? <input type="date" className="form-input text-sm w-40" value={date} onChange={e => setDate(e.target.value)} />
            : <input type="month" className="form-input text-sm w-36" value={month} onChange={e => setMonth(e.target.value)} />
          }
          {mode === "day" && <button onClick={markAllPresent} disabled={busy} className="btn-secondary text-sm">{busy ? "Marking…" : "Mark All Present"}</button>}
          {mode === "month" && <button onClick={exportMonthly} className="btn-secondary text-sm">Export CSV</button>}
          {mode === "month" && submission?.canSubmit && !submission?.submission && (
            <button onClick={submitMonth} disabled={busy} className="btn-primary text-sm">{busy ? "Submitting…" : "Submit Month (Head Nurse)"}</button>
          )}
        </div>
      </div>

      {mode === "month" && submission?.submission && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
          Attendance for {month} submitted by {submission.submission.submittedBy?.name} on{" "}
          {new Date(submission.submission.submittedAt).toLocaleDateString("en-MY")} — records are locked.
        </div>
      )}
      {mode === "month" && !submission?.submission && !submission?.canSubmit && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded text-sm text-slate-600">
          {submission?.headNurseStaffProfileId
            ? "Only the branch's designated Head Nurse can submit this month's attendance."
            : "No Head Nurse designated for this branch — set one in Payroll Settings before the month can be submitted."}
        </div>
      )}
      {msg && <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">{msg}</div>}

      {mode === "day" && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>{["Name","Role","Status","Check In","Check Out","Late (min)","OT (min)","Notes"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {records.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No attendance records for this date. Mark attendance to create records.</td></tr>}
              {records.map(r => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{r.staffProfile?.user?.name}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{r.staffProfile?.user?.role}</td>
                  <td className="px-4 py-2">
                    <select className="form-input text-xs py-0.5 w-36" value={editing[r.id] ?? r.status} onChange={e => { setEditing(p => ({ ...p, [r.id]: e.target.value })); saveStatus(r.id, e.target.value); }}>
                      {STATUSES.map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-xs font-mono">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td className="px-4 py-2 text-xs font-mono">{r.checkOut ? new Date(r.checkOut).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td className="px-4 py-2 text-xs text-center">{r.lateMinutes ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-center">{r.overtimeMinutes ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{r.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode === "month" && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>{["Name","Role","Present","Absent","Late","On Leave","PH","OT (hrs)","Lunch OT (hrs)"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {summary.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No attendance data for this month.</td></tr>}
              {summary.map((s, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{s.role}</td>
                  <td className="px-4 py-2 text-green-700 font-medium">{s.present}</td>
                  <td className="px-4 py-2 text-red-600">{s.absent}</td>
                  <td className="px-4 py-2 text-amber-700">{s.late}</td>
                  <td className="px-4 py-2 text-blue-700">{s.onLeave}</td>
                  <td className="px-4 py-2 text-purple-700">{s.publicHoliday}</td>
                  <td className="px-4 py-2 text-slate-600">{(s.overtimeMins / 60).toFixed(1)}</td>
                  <td className="px-4 py-2 text-slate-600">{((s.lunchOtMins ?? 0) / 60).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
