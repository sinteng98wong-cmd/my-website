"use client";

import { useEffect, useState, useCallback } from "react";

type Clinic = { id: string; name: string };
type Shift = { id: string; name: string; startTime: string; endTime: string };
type Row = {
  id: string; staffProfileId: string; staffName: string; role: string;
  date: string; shiftTemplate: Shift | null; isOff: boolean; isPublicHoliday: boolean;
  notes: string | null; onLeave: string | null;
};

const ROLE_ORDER = ["DOCTOR", "NURSE", "RECEPTIONIST", "STOREKEEPER"];
const SHIFT_COLOR: Record<string, string> = { MORNING: "bg-blue-100 text-blue-700", EVENING: "bg-amber-100 text-amber-700", NIGHT: "bg-purple-100 text-purple-700", FULL_DAY: "bg-emerald-100 text-emerald-700" };

function mondayOf(d: Date) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmtDay = (d: Date) => d.toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" });

export function ScheduleClient({ clinics, isManager }: { clinics: Clinic[]; isManager: boolean }) {
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [rows, setRows] = useState<Row[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [edit, setEdit] = useState<Row | null>(null);
  const [dayPanel, setDayPanel] = useState<string | null>(null);
  const [dayData, setDayData] = useState<any>(null);
  const [msg, setMsg] = useState("");

  const days = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)); // Mon-Sat

  const load = useCallback(async () => {
    if (!clinicId) return;
    const month = iso(weekStart).slice(0, 7);
    // load current + next month to cover week spanning month boundary
    const next = addDays(weekStart, 6);
    const months = Array.from(new Set([month, iso(next).slice(0, 7)]));
    const all: Row[] = [];
    for (const m of months) {
      const d = await fetch(`/api/hr/schedule?clinicId=${clinicId}&month=${m}`).then((r) => r.json());
      if (Array.isArray(d)) all.push(...d);
    }
    setRows(all);
    const s = await fetch(`/api/hr/shifts?clinicId=${clinicId}`).then((r) => r.json());
    setShifts(Array.isArray(s) ? s.filter((x: any) => x.isActive) : []);
  }, [clinicId, weekStart]);
  useEffect(() => { load(); }, [load]);

  // staff list grouped by role
  const staffMap = new Map<string, { staffProfileId: string; staffName: string; role: string }>();
  for (const r of rows) if (!staffMap.has(r.staffProfileId)) staffMap.set(r.staffProfileId, { staffProfileId: r.staffProfileId, staffName: r.staffName, role: r.role });
  const staff = [...staffMap.values()].sort((a, b) => (ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)) || a.staffName.localeCompare(b.staffName));

  const cellOf = (sid: string, date: Date) => rows.find((r) => r.staffProfileId === sid && r.date.slice(0, 10) === iso(date));

  async function generate() {
    const [y, m] = iso(weekStart).slice(0, 7).split("-").map(Number);
    const res = await fetch("/api/hr/schedule/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clinicId, year: y, month: m }) });
    const d = await res.json();
    setMsg(`Generated ${d.created}, skipped ${d.skipped}.${d.warning ? " " + d.warning : ""}`);
    load();
  }
  async function copyLastWeek() {
    const res = await fetch("/api/hr/schedule/copy-week", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clinicId, fromWeekStart: iso(addDays(weekStart, -7)), toWeekStart: iso(weekStart) }) });
    const d = await res.json();
    setMsg(`Copied ${d.copied}, skipped ${d.skipped}.`);
    load();
  }
  async function saveCell(body: any) {
    if (!edit) return;
    const res = await fetch(`/api/hr/schedule/${edit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (d.requiresConfirmation) { if (confirm(d.message + " Continue?")) await fetch(`/api/hr/schedule/${edit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, confirmed: true }) }); else return; }
    setEdit(null); load();
  }
  async function openDay(date: string) {
    setDayPanel(date);
    const d = await fetch(`/api/hr/schedule/day?clinicId=${clinicId}&date=${date}`).then((r) => r.json());
    setDayData(d);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">Staff Schedule</h1>
        <div className="flex items-center gap-2">
          <select className="form-input w-40 text-sm" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>{clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="btn-outline text-sm px-2">‹</button>
          <span className="text-sm text-slate-600 w-40 text-center">{fmtDay(weekStart)} – {fmtDay(addDays(weekStart, 5))}</span>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="btn-outline text-sm px-2">›</button>
          {isManager && <button onClick={generate} className="btn-primary text-sm">Generate</button>}
          {isManager && <button onClick={copyLastWeek} className="btn-outline text-sm">Copy Last Week</button>}
        </div>
      </div>
      {msg && <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">{msg}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-3 py-2 text-left text-xs text-slate-500 uppercase sticky left-0 bg-slate-50">Staff</th>
              {days.map((d) => (
                <th key={iso(d)} className="px-3 py-2 text-center text-xs text-slate-500">
                  <button onClick={() => openDay(iso(d))} className="hover:text-blue-600">{fmtDay(d)}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No schedule. {isManager && "Click Generate to create one."}</td></tr>}
            {staff.map((s) => (
              <tr key={s.staffProfileId} className="border-b border-slate-50">
                <td className="px-3 py-2 sticky left-0 bg-white">
                  <span className="font-medium text-slate-700">{s.staffName}</span>
                  <span className="block text-xs text-slate-400">{s.role}</span>
                </td>
                {days.map((d) => {
                  const c = cellOf(s.staffProfileId, d);
                  return (
                    <td key={iso(d)} className="px-2 py-2 text-center">
                      <button onClick={() => c && isManager && setEdit(c)} className="w-full">
                        {!c ? <span className="text-slate-300 text-xs">—</span>
                          : c.onLeave ? <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-500 border border-red-200" style={{ backgroundImage: "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(239,68,68,.1) 4px,rgba(239,68,68,.1) 8px)" }}>{c.onLeave}</span>
                          : c.isOff ? <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">Off</span>
                          : c.isPublicHoliday ? <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">PH</span>
                          : c.shiftTemplate ? <span className={`text-xs px-1.5 py-0.5 rounded ${SHIFT_COLOR[(c.shiftTemplate as any).shiftType] ?? "bg-slate-100 text-slate-600"}`}>{c.shiftTemplate.name}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit cell modal */}
      {edit && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-lg p-6 w-96 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">{edit.staffName} — {fmtDay(new Date(edit.date))}</h3>
            <div>
              <label className="form-label">Shift</label>
              <select className="form-input" defaultValue={edit.shiftTemplate?.id ?? ""} onChange={(e) => saveCell({ shiftTemplateId: e.target.value, isOff: false })}>
                <option value="">— none —</option>
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => saveCell({ isOff: !edit.isOff })} className="btn-outline text-sm">{edit.isOff ? "Unmark Off" : "Mark Off"}</button>
              <button onClick={() => setEdit(null)} className="btn-outline text-sm ml-auto">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Day detail panel */}
      {dayPanel && (
        <div className="fixed inset-0 bg-black/20 flex justify-end z-50" onClick={() => { setDayPanel(null); setDayData(null); }}>
          <div className="bg-white w-96 h-full overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">{fmtDay(new Date(dayPanel))}</h3>
              <button onClick={() => { setDayPanel(null); setDayData(null); }} className="text-slate-400">✕</button>
            </div>
            {!dayData ? <p className="text-slate-400 text-sm">Loading…</p> : (
              <>
                <div className={`text-sm rounded px-3 py-2 ${dayData.understaffed ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-green-50 text-green-700"}`}>
                  {dayData.understaffed ? "⚠ Understaffed" : "✓ Staffing OK"}
                  <div className="text-xs mt-1">{dayData.staffingStatus.map((s: any) => `${s.role}: ${s.present}/${s.minimum}`).join(" · ")}</div>
                </div>
                {dayData.shifts.map((sh: any) => (
                  <div key={sh.shiftTemplate.id}>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{sh.shiftTemplate.name} {sh.shiftTemplate.startTime && `(${sh.shiftTemplate.startTime}-${sh.shiftTemplate.endTime})`}</p>
                    {sh.staff.length === 0 ? <p className="text-xs text-slate-400">None</p> : sh.staff.map((st: any) => (
                      <div key={st.staffProfileId} className="flex items-center justify-between text-sm py-0.5">
                        <span className={st.onLeave ? "text-red-400 line-through" : ""}>{st.staffName} <span className="text-xs text-slate-400">{st.role}</span></span>
                        {st.pairedWith && <span className="text-xs text-blue-600">↔ {st.pairedWith.staffName}</span>}
                        {st.onLeave && <span className="text-xs text-red-400">{st.onLeave}</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
