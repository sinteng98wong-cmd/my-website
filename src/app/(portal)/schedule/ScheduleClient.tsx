"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";

type SlimUser   = { id: string; name: string; role: string };
type SlimClinic = { id: string; name: string };
type Schedule = {
  id: string;
  startTime: string;  // ISO datetime
  endTime: string;    // ISO datetime
  notes?: string;
  clinic: SlimClinic;
  doctor: SlimUser;
  nurse?: SlimUser | null;
  receptionist?: SlimUser | null;
};

function fmtTime(iso: string) {
  return format(parseISO(iso), "HH:mm");
}

// datetime-local gives "YYYY-MM-DDTHH:mm" — append seconds + MYT offset
function toISO(datetimeLocal: string): string {
  const base = datetimeLocal.includes("+") ? datetimeLocal : datetimeLocal + "+08:00";
  // if seconds are missing (HH:mm+08:00), insert :00
  return base.replace(/(\d{2}:\d{2})(\+)/, "$1:00$2");
}

export function ScheduleClient({
  schedules, clinics, staff, dateStr, canManage,
}: {
  schedules: Schedule[];
  clinics: SlimClinic[];
  staff: SlimUser[];
  dateStr: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    clinicId:       clinics[0]?.id ?? "",
    doctorId:       staff.find(s => s.role === "DOCTOR")?.id ?? "",
    nurseId:        "",
    receptionistId: "",
    startTime:      `${dateStr}T08:00`,
    endTime:        `${dateStr}T13:00`,
    notes:          "",
  });

  const doctors       = staff.filter(s => s.role === "DOCTOR");
  const nurses        = staff.filter(s => s.role === "NURSE");
  const receptionists = staff.filter(s => s.role === "RECEPTIONIST" || s.role === "CLINIC_MANAGER");

  function shiftDate(days: number) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    router.push(`/schedule?date=${d.toISOString().slice(0, 10)}`);
  }

  async function handleAdd() {
    setSaving(true); setError("");
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinicId:       form.clinicId,
        doctorId:       form.doctorId,
        nurseId:        form.nurseId        || undefined,
        receptionistId: form.receptionistId || undefined,
        startTime: toISO(form.startTime),
        endTime:   toISO(form.endTime),
        notes:          form.notes || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to save");
      return;
    }
    setShowForm(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this schedule slot?")) return;
    setDeletingId(id);
    await fetch("/api/schedule", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setDeletingId(null);
    router.refresh();
  }

  const dateLabel = new Date(dateStr + "T00:00:00").toLocaleDateString("en-MY", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Schedule</h1>
          <p className="text-sm text-slate-500 mt-0.5">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftDate(-1)} className="btn-outline px-3">‹</button>
          <form>
            <input type="date" name="date" defaultValue={dateStr} className="form-input w-auto" />
          </form>
          <button onClick={() => shiftDate(1)} className="btn-outline px-3">›</button>
          {canManage && (
            <button onClick={() => setShowForm(!showForm)} className="btn-primary ml-2">
              {showForm ? "Cancel" : "+ Add Slot"}
            </button>
          )}
        </div>
      </div>

      {/* Add Slot Form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Add Schedule Slot — {dateStr}</h2>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="form-label">Clinic *</label>
              <select value={form.clinicId} onChange={e => setForm(f => ({...f, clinicId: e.target.value}))} className="form-input">
                {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Start Time *</label>
              <input
                type="datetime-local" className="form-input"
                value={form.startTime}
                onChange={e => setForm(f => ({...f, startTime: e.target.value}))}
              />
            </div>
            <div>
              <label className="form-label">End Time *</label>
              <input
                type="datetime-local" className="form-input"
                value={form.endTime}
                onChange={e => setForm(f => ({...f, endTime: e.target.value}))}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="form-label">Doctor *</label>
              <select value={form.doctorId} onChange={e => setForm(f => ({...f, doctorId: e.target.value}))} className="form-input">
                <option value="">Select doctor…</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Nurse</label>
              <select value={form.nurseId} onChange={e => setForm(f => ({...f, nurseId: e.target.value}))} className="form-input">
                <option value="">— None —</option>
                {nurses.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Receptionist</label>
              <select value={form.receptionistId} onChange={e => setForm(f => ({...f, receptionistId: e.target.value}))} className="form-input">
                <option value="">— None —</option>
                {receptionists.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="form-label">Notes</label>
            <input type="text" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
              placeholder="e.g. Half day, Public Holiday makeup…" className="form-input" />
          </div>

          <button onClick={handleAdd} disabled={saving || !form.doctorId} className="btn-primary">
            {saving ? "Saving…" : "Save Slot"}
          </button>
        </div>
      )}

      {/* Schedule Cards */}
      {schedules.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-slate-400 text-sm">No schedules for this date</p>
          {canManage && (
            <button onClick={() => setShowForm(true)} className="btn-outline mt-4 text-sm">+ Add first slot</button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <div key={s.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  {/* Time block */}
                  <div className="text-center flex-shrink-0 w-20">
                    <div className="text-sm font-semibold text-slate-900">{fmtTime(s.startTime)}</div>
                    <div className="text-xs text-slate-400">to</div>
                    <div className="text-sm font-semibold text-slate-900">{fmtTime(s.endTime)}</div>
                  </div>

                  <div className="w-px self-stretch bg-slate-200 mx-1" />

                  {/* Team */}
                  <div className="flex gap-6">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Clinic</p>
                      <p className="text-sm font-medium text-slate-900">{s.clinic.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Doctor</p>
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 flex-shrink-0">
                          {s.doctor.name[0]}
                        </div>
                        <span className="text-sm text-slate-900">{s.doctor.name}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Nurse</p>
                      {s.nurse ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-xs font-semibold text-green-700 flex-shrink-0">
                            {s.nurse.name[0]}
                          </div>
                          <span className="text-sm text-slate-900">{s.nurse.name}</span>
                        </div>
                      ) : <span className="text-sm text-slate-400">—</span>}
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Receptionist</p>
                      {s.receptionist ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-xs font-semibold text-purple-700 flex-shrink-0">
                            {s.receptionist.name[0]}
                          </div>
                          <span className="text-sm text-slate-900">{s.receptionist.name}</span>
                        </div>
                      ) : <span className="text-sm text-slate-400">—</span>}
                    </div>
                    {s.notes && (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Notes</p>
                        <p className="text-sm text-slate-600">{s.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {canManage && (
                  <button onClick={() => handleDelete(s.id)} disabled={deletingId === s.id}
                    className="text-xs text-red-400 hover:text-red-600 ml-4 flex-shrink-0">
                    {deletingId === s.id ? "…" : "Remove"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
