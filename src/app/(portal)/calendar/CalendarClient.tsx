"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, Views, type View } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay, startOfWeek as sow } from "date-fns";
import { enUS } from "date-fns/locale";
import { CalendarDays, Users, X, AlertCircle } from "lucide-react";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });
const DnDCalendar = withDragAndDrop(Calendar as any);

// ─── Types ────────────────────────────────────────────────────────────────────

type Opt = { id: string; name: string };
type Patient = { id: string; name: string; patientRef: string };
type Mode = "appointments" | "shifts";

interface Props {
  clinics:          Opt[];
  doctors:          Opt[];
  nurses:           Opt[];
  patients:         Patient[];
  selectedClinicId: string;
  canEditShifts:    boolean;
}

type CalEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  kind: Mode;
  meta: any;
};

const TYPE_COLOR: Record<string, string> = {
  CHECKUP: "#3b82f6", CONSULTATION: "#6366f1", TREATMENT: "#a855f7",
  FOLLOWUP: "#14b8a6", CLEANING: "#22c55e", EXTRACTION: "#ef4444", OTHER: "#64748b",
};
const APPT_TYPES = ["CHECKUP","CONSULTATION","TREATMENT","FOLLOWUP","CLEANING","EXTRACTION","OTHER"];

// ─── Component ─────────────────────────────────────────────────────────────────

export function CalendarClient({ clinics, doctors, nurses, patients, selectedClinicId, canEditShifts }: Props) {
  const [mode, setMode]         = useState<Mode>("appointments");
  const [clinicId, setClinicId] = useState(selectedClinicId);
  const [view, setView]         = useState<View>(Views.WEEK);
  const [date, setDate]         = useState(new Date());
  const [events, setEvents]     = useState<CalEvent[]>([]);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);
  const [newAppt, setNewAppt]   = useState<{ start: Date; end: Date } | null>(null);
  const [newShift, setNewShift] = useState<{ start: Date; end: Date } | null>(null);

  const flash = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 4500);
  }, []);

  // Visible range for the current view (fetch window)
  const range = useMemo(() => {
    const d = new Date(date);
    let start: Date, end: Date;
    if (view === Views.DAY)   { start = new Date(d.setHours(0,0,0,0)); end = new Date(new Date(start).setDate(start.getDate()+1)); }
    else if (view === Views.MONTH) { start = new Date(d.getFullYear(), d.getMonth(), 1); end = new Date(d.getFullYear(), d.getMonth()+1, 1); }
    else { start = sow(new Date(date), { weekStartsOn: 0 }); end = new Date(new Date(start).setDate(start.getDate()+7)); } // week/agenda
    return { start, end };
  }, [date, view]);

  const load = useCallback(async () => {
    if (mode === "appointments") {
      const qs = new URLSearchParams({ from: range.start.toISOString(), to: range.end.toISOString(), ...(clinicId ? { clinicId } : {}) });
      const res = await fetch(`/api/appointments?${qs}`);
      const d = await res.json();
      if (!res.ok) { flash(d.error ?? "Failed to load", false); return; }
      setEvents((d as any[]).map(a => ({
        id: a.id,
        title: `${a.patient.name} · ${a.doctor.name}`,
        start: new Date(a.startTime),
        end:   new Date(new Date(a.startTime).getTime() + a.duration * 60000),
        kind: "appointments" as Mode,
        meta: a,
      })));
    } else {
      // Staff shifts — fetch week-by-week for the visible range (roster API is week+role)
      const weekStart = sow(new Date(date), { weekStartsOn: 1 }).toLocaleDateString("en-CA");
      const [docs, nrs] = await Promise.all([
        fetch(`/api/shifts?weekStart=${weekStart}&role=DOCTOR`).then(r => r.json()),
        fetch(`/api/shifts?weekStart=${weekStart}&role=NURSE`).then(r => r.json()),
      ]);
      const all = [...(docs.shifts ?? []), ...(nrs.shifts ?? [])]
        .filter((s: any) => !clinicId || s.branch.id === clinicId);
      setEvents(all.map((s: any) => ({
        id: s.id,
        title: `${s.user.name} · ${s.branch.name}`,
        start: new Date(s.startTime),
        end:   new Date(s.endTime),
        kind: "shifts" as Mode,
        meta: s,
      })));
    }
  }, [mode, clinicId, range.start, range.end, date, flash]);

  useEffect(() => { load(); }, [load]);

  // Colour blocks
  const eventPropGetter = useCallback((e: CalEvent) => {
    if (e.kind === "appointments") {
      const cancelled = e.meta.status === "CANCELLED" || e.meta.status === "NO_SHOW";
      return { style: { backgroundColor: cancelled ? "#94a3b8" : (TYPE_COLOR[e.meta.type] ?? "#3b82f6"), opacity: cancelled ? 0.5 : 1, border: "none" } };
    }
    return { style: { backgroundColor: e.meta.status === "APPROVED" ? "#0ea5e9" : "#f59e0b", border: "none" } };
  }, []);

  // ── Drag / resize → reschedule ────────────────────────────────────────────
  async function onEventDrop({ event, start, end }: any) {
    const e = event as CalEvent;
    const duration = Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000));
    if (e.kind === "appointments") {
      const res = await fetch(`/api/appointments/${e.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reschedule", startTime: start.toISOString(), duration }),
      });
      const d = await res.json();
      if (!res.ok) { flash(d.error ?? "Reschedule failed", false); return; }
      flash("Appointment moved", true); load();
    } else {
      if (!canEditShifts) { flash("Only admins can edit shifts", false); return; }
      const res = await fetch(`/api/shifts/${e.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: start.toISOString(), endTime: end.toISOString() }),
      });
      const d = await res.json();
      if (!res.ok) { flash(d.error ?? "Move failed", false); return; }
      flash("Shift moved", true); load();
    }
  }

  function onSelectSlot({ start, end }: any) {
    if (mode === "appointments") setNewAppt({ start, end });
    else if (canEditShifts)      setNewShift({ start, end });
  }

  function onSelectEvent(event: any) {
    const e = event as CalEvent;
    if (e.kind === "appointments") {
      const next = prompt(`Appointment: ${e.meta.patient.name}\nStatus (${e.meta.status}) → type new status:\nSCHEDULED / CONFIRMED / COMPLETED / CANCELLED / NO_SHOW`, e.meta.status);
      if (next && next !== e.meta.status) updateApptStatus(e.id, next.toUpperCase());
    }
  }

  async function updateApptStatus(id: string, status: string) {
    const res = await fetch(`/api/appointments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) { const d = await res.json(); flash(d.error ?? "Failed", false); return; }
    flash("Status updated", true); load();
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-medium">
          <button onClick={() => setMode("appointments")}
            className={`flex items-center gap-1.5 px-4 py-2 transition-colors ${mode === "appointments" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
            <CalendarDays size={14} /> Appointments
          </button>
          <button onClick={() => setMode("shifts")}
            className={`flex items-center gap-1.5 px-4 py-2 transition-colors ${mode === "shifts" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
            <Users size={14} /> Staff Schedule
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 font-medium">{mode === "shifts" ? "Branch" : "Clinic"}</label>
          <select value={clinicId} onChange={e => setClinicId(e.target.value)} className="form-input w-auto text-sm py-1.5">
            <option value="">All</option>
            {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {mode === "shifts" && !canEditShifts && <span className="text-xs text-slate-400">view only</span>}
      </div>

      {toast && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${toast.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {!toast.ok && <AlertCircle size={15} />}{toast.msg}
        </div>
      )}

      <div className="card p-3" style={{ height: "72vh" }}>
        <DnDCalendar
          localizer={localizer}
          events={events}
          date={date}
          view={view}
          onNavigate={setDate}
          onView={setView}
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          step={30}
          timeslots={2}
          min={new Date(1970, 0, 1, 8, 0)}
          max={new Date(1970, 0, 1, 21, 0)}
          selectable
          resizable
          onEventDrop={onEventDrop}
          onEventResize={onEventDrop}
          onSelectSlot={onSelectSlot}
          onSelectEvent={onSelectEvent}
          eventPropGetter={eventPropGetter as any}
          draggableAccessor={(e: any) => e.kind === "appointments" || canEditShifts}
          popup
          style={{ height: "100%" }}
        />
      </div>

      {newAppt && (
        <NewApptModal
          slot={newAppt} clinics={clinics} doctors={doctors} patients={patients} defaultClinic={clinicId}
          onClose={() => setNewAppt(null)}
          onCreated={() => { setNewAppt(null); flash("Appointment created", true); load(); }}
          onError={m => flash(m, false)}
        />
      )}
      {newShift && (
        <NewShiftModal
          slot={newShift} clinics={clinics} staff={[...doctors, ...nurses]} defaultClinic={clinicId}
          onClose={() => setNewShift(null)}
          onCreated={() => { setNewShift(null); flash("Shift created", true); load(); }}
          onError={m => flash(m, false)}
        />
      )}
    </div>
  );
}

// ─── New appointment modal ────────────────────────────────────────────────────

function NewApptModal({ slot, clinics, doctors, patients, defaultClinic, onClose, onCreated, onError }: {
  slot: { start: Date; end: Date }; clinics: Opt[]; doctors: Opt[]; patients: Patient[]; defaultClinic: string;
  onClose: () => void; onCreated: () => void; onError: (m: string) => void;
}) {
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId]   = useState(doctors[0]?.id ?? "");
  const [clinicId, setClinicId]   = useState(defaultClinic || clinics[0]?.id || "");
  const [type, setType]           = useState("CHECKUP");
  const [busy, setBusy]           = useState(false);
  const duration = Math.max(15, Math.round((slot.end.getTime() - slot.start.getTime()) / 60000)) || 30;

  async function submit() {
    if (!patientId || !doctorId || !clinicId) { onError("Pick a patient, doctor and clinic"); return; }
    setBusy(true);
    const res = await fetch("/api/appointments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, doctorId, clinicId, startTime: slot.start.toISOString(), duration, type }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json(); onError(d.error ?? "Failed to create"); return; }
    onCreated();
  }

  return (
    <Modal title="New appointment" subtitle={`${slot.start.toLocaleString("en-MY", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${duration} min`} onClose={onClose}>
      <Field label="Patient">
        <select value={patientId} onChange={e => setPatientId(e.target.value)} className="form-input">
          <option value="">Select…</option>
          {patients.map(p => <option key={p.id} value={p.id}>{p.name} ({p.patientRef})</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Doctor"><select value={doctorId} onChange={e => setDoctorId(e.target.value)} className="form-input">{doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Clinic"><select value={clinicId} onChange={e => setClinicId(e.target.value)} className="form-input">{clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      </div>
      <Field label="Type">
        <select value={type} onChange={e => setType(e.target.value)} className="form-input">{APPT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
      </Field>
      <Actions busy={busy} onClose={onClose} onSubmit={submit} label="Create" />
    </Modal>
  );
}

// ─── New shift modal ──────────────────────────────────────────────────────────

function NewShiftModal({ slot, clinics, staff, defaultClinic, onClose, onCreated, onError }: {
  slot: { start: Date; end: Date }; clinics: Opt[]; staff: Opt[]; defaultClinic: string;
  onClose: () => void; onCreated: () => void; onError: (m: string) => void;
}) {
  const [userId, setUserId]     = useState(staff[0]?.id ?? "");
  const [branchId, setBranchId] = useState(defaultClinic || clinics[0]?.id || "");
  const [busy, setBusy]         = useState(false);
  const end = slot.end.getTime() > slot.start.getTime() ? slot.end : new Date(slot.start.getTime() + 8 * 3600000);

  async function submit() {
    if (!userId || !branchId) { onError("Pick a staff member and branch"); return; }
    setBusy(true);
    const res = await fetch("/api/shifts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, branchId, startTime: slot.start.toISOString(), endTime: end.toISOString() }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json(); onError(d.error ?? "Failed"); return; }
    onCreated();
  }

  return (
    <Modal title="New shift" subtitle={`${slot.start.toLocaleString("en-MY", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`} onClose={onClose}>
      <Field label="Staff"><select value={userId} onChange={e => setUserId(e.target.value)} className="form-input">{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Branch"><select value={branchId} onChange={e => setBranchId(e.target.value)} className="form-input">{clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Actions busy={busy} onClose={onClose} onSubmit={submit} label="Create shift" />
    </Modal>
  );
}

// ─── Small modal primitives ───────────────────────────────────────────────────

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div><h3 className="font-semibold text-slate-900">{title}</h3>{subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}</div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="form-label">{label}</label>{children}</div>;
}
function Actions({ busy, onClose, onSubmit, label }: { busy: boolean; onClose: () => void; onSubmit: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
      <button onClick={onClose} disabled={busy} className="btn-secondary text-sm">Cancel</button>
      <button onClick={onSubmit} disabled={busy} className="btn-primary text-sm">{busy ? "Saving…" : label}</button>
    </div>
  );
}
