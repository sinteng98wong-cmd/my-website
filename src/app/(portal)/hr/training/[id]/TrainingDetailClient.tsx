"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = ["PLANNED","ONGOING","COMPLETED","CANCELLED"];
const STATUS_BADGE: Record<string, string> = { PLANNED:"bg-blue-100 text-blue-700", ONGOING:"bg-amber-100 text-amber-700", COMPLETED:"bg-green-100 text-green-700", CANCELLED:"bg-slate-100 text-slate-500" };
const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-MY", { dateStyle: "medium" });

export function TrainingDetailClient({ id, isManager }: { id: string; isManager: boolean }) {
  const router = useRouter();
  const [training, setTraining] = useState<any>(null);
  const [allStaff, setAllStaff] = useState<any[]>([]);
  const [showEnroll, setShowEnroll] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [editStatus, setEditStatus] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const d = await fetch(`/api/hr/training/${id}`).then((r) => r.json());
    setTraining(d);
  }
  useEffect(() => { load(); }, [id]);

  async function openEnroll() {
    const s = await fetch("/api/hr/staff").then((r) => r.json()).catch(() => []);
    setAllStaff(Array.isArray(s) ? s : []);
    setSelectedStaff([]);
    setShowEnroll(true);
  }

  async function enroll() {
    setBusy(true); setError("");
    const res = await fetch(`/api/hr/training/${id}/enroll`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffProfileIds: selectedStaff }) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    setShowEnroll(false);
    load();
  }

  async function updateStatus(staffProfileId: string, status: string) {
    await fetch(`/api/hr/training/${id}/enrollment/${staffProfileId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, completedAt: status === "COMPLETED" ? new Date().toISOString() : undefined }) });
    load();
  }

  async function exportAttendance() {
    if (!training) return;
    const rows = [["Name","Role","Status","Score","Certificate"]];
    for (const p of training.participants) {
      rows.push([p.staffProfile.user.name, p.staffProfile.user.role, p.status, p.score ?? "", p.certificateUrl ?? ""]);
    }
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${training.title}-attendance.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!training) return <div className="p-8 text-slate-400">Loading…</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <button onClick={() => router.push("/hr/training")} className="text-sm text-slate-500 hover:text-slate-700">← Training</button>

      <div className="card p-6 space-y-3">
        <h1 className="text-xl font-bold text-slate-800">{training.title}</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span className="text-slate-400">Provider:</span> {training.provider ?? "—"}</div>
          <div><span className="text-slate-400">Type:</span> {training.type ?? "—"}</div>
          <div><span className="text-slate-400">Venue:</span> {training.venue ?? "—"}</div>
          <div><span className="text-slate-400">Cost:</span> {training.cost ? RM(Number(training.cost)) : "—"}</div>
          <div className="col-span-2"><span className="text-slate-400">Dates:</span> {fmtDate(training.startDate)} – {fmtDate(training.endDate)}</div>
          {training.maxSlots && <div><span className="text-slate-400">Max Slots:</span> {training.maxSlots}</div>}
        </div>
        {training.description && <p className="text-sm text-slate-600">{training.description}</p>}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Participants ({training.participants.length})</h2>
          {isManager && (
            <div className="flex gap-2">
              <button onClick={exportAttendance} className="btn-secondary text-xs">Export CSV</button>
              <button onClick={openEnroll} className="btn-primary text-xs">Enroll Staff</button>
            </div>
          )}
        </div>

        {showEnroll && (
          <div className="p-4 border-b border-slate-100 space-y-3">
            <p className="text-sm font-medium text-slate-700">Select staff to enroll:</p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {allStaff.map((s: any) => (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 px-2 py-1 rounded">
                  <input type="checkbox" checked={selectedStaff.includes(s.id)} onChange={(e) => setSelectedStaff((prev) => e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id))} />
                  {s.user?.name} ({s.user?.role})
                </label>
              ))}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button onClick={enroll} disabled={busy || !selectedStaff.length} className="btn-primary text-xs">{busy ? "Enrolling…" : `Enroll ${selectedStaff.length}`}</button>
              <button onClick={() => setShowEnroll(false)} className="btn-secondary text-xs">Cancel</button>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>{["Name","Role","Status","Score","Certificate","Notes"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {training.participants.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No participants yet.</td></tr>}
            {training.participants.map((p: any) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{p.staffProfile.user.name}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{p.staffProfile.user.role}</td>
                <td className="px-4 py-3">
                  {isManager ? (
                    <select className="form-input text-xs py-0.5 w-32" value={editStatus[p.staffProfile.id] ?? p.status} onChange={(e) => { setEditStatus((s) => ({ ...s, [p.staffProfile.id]: e.target.value })); updateStatus(p.staffProfile.id, e.target.value); }}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  ) : <span className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGE[p.status]}`}>{p.status}</span>}
                </td>
                <td className="px-4 py-3">{p.score ?? "—"}</td>
                <td className="px-4 py-3">{p.certificateUrl ? <a href={p.certificateUrl} target="_blank" className="text-blue-600 text-xs hover:underline">Download</a> : "—"}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{p.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
