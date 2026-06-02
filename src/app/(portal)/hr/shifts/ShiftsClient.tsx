"use client";

import { useEffect, useState } from "react";

type Clinic = { id: string; name: string };
type Shift = {
  id: string; name: string; shiftType: string; startTime: string; endTime: string;
  breakMins: number; isDefault: boolean; isActive: boolean; order: number;
};
const TYPES = ["MORNING", "EVENING", "NIGHT", "FULL_DAY", "CUSTOM"];
const EMPTY = { name: "", shiftType: "MORNING", startTime: "08:00", endTime: "14:00", breakMins: 30, isDefault: false };

export function ShiftsClient({ clinics, isSuperAdmin }: { clinics: Clinic[]; isSuperAdmin: boolean }) {
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!clinicId) return;
    const d = await fetch(`/api/hr/shifts?clinicId=${clinicId}`).then((r) => r.json());
    setShifts(Array.isArray(d) ? d : []);
  }
  useEffect(() => { load(); }, [clinicId]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const res = await fetch("/api/hr/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, clinicId }) });
    if (!res.ok) { setError((await res.json()).error); return; }
    setForm({ ...EMPTY }); setAdding(false); load();
  }
  async function patch(id: string, body: any) {
    const res = await fetch(`/api/hr/shifts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const e = await res.json();
      if (e.requiresForce && confirm(`${e.error} Continue?`)) { await fetch(`/api/hr/shifts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, force: true }) }); }
      else { setError(e.error); return; }
    }
    load();
  }
  async function del(id: string) {
    if (!confirm("Delete this shift?")) return;
    const res = await fetch(`/api/hr/shifts/${id}`, { method: "DELETE" });
    if (!res.ok) { setError((await res.json()).error); return; }
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">Shift Templates</h1>
        <div className="flex gap-2">
          <select className="form-input w-44" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => setAdding((v) => !v)} className="btn-primary">{adding ? "Cancel" : "+ Add Shift"}</button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

      {adding && (
        <form onSubmit={add} className="card p-5 mb-6 grid grid-cols-3 gap-4">
          <div><label className="form-label">Name</label><input required className="form-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="form-label">Type</label><select className="form-input" value={form.shiftType} onChange={(e) => setForm((f) => ({ ...f, shiftType: e.target.value }))}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label className="form-label">Break (mins)</label><input type="number" className="form-input" value={form.breakMins} onChange={(e) => setForm((f) => ({ ...f, breakMins: +e.target.value }))} /></div>
          <div><label className="form-label">Start</label><input type="time" className="form-input" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} /></div>
          <div><label className="form-label">End</label><input type="time" className="form-input" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} /></div>
          <div className="flex items-end"><button className="btn-primary">Save Shift</button></div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Name", "Type", "Start", "End", "Break", "Default", "Active", ""].map((h) => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {shifts.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No shifts.</td></tr>}
            {shifts.map((s) => (
              <tr key={s.id} className={`table-row ${!s.isActive ? "opacity-50" : ""}`}>
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-slate-500">{s.shiftType}</td>
                <td className="px-4 py-3">{s.startTime}</td>
                <td className="px-4 py-3">{s.endTime}</td>
                <td className="px-4 py-3">{s.breakMins}m</td>
                <td className="px-4 py-3">
                  <button onClick={() => patch(s.id, { isDefault: true })} className={`text-xs px-2 py-0.5 rounded ${s.isDefault ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}>{s.isDefault ? "Default" : "Set default"}</button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => patch(s.id, { isActive: !s.isActive })} className={`relative inline-flex h-5 w-9 items-center rounded-full ${s.isActive ? "bg-green-500" : "bg-slate-300"}`}>
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition ${s.isActive ? "translate-x-5" : "translate-x-1"}`} />
                  </button>
                </td>
                <td className="px-4 py-3">{isSuperAdmin && <button onClick={() => del(s.id)} className="text-xs text-red-500 hover:underline">Delete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
