"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, addMinutes, parseISO } from "date-fns";

const TYPE_LABELS: Record<string, string> = {
  CHECKUP: "Check-up", CONSULTATION: "Consultation", TREATMENT: "Treatment",
  FOLLOWUP: "Follow-up", CLEANING: "Cleaning", EXTRACTION: "Extraction", OTHER: "Other",
};
const STATUS_CLASS: Record<string, string> = {
  SCHEDULED: "badge-slate", CONFIRMED: "badge-blue", CHECKED_IN: "badge-amber",
  COMPLETED: "badge-green", CANCELLED: "badge-red", NO_SHOW: "badge-red",
};
const TYPE_COLORS: Record<string, string> = {
  CHECKUP: "bg-blue-100 text-blue-700", CONSULTATION: "bg-indigo-100 text-indigo-700",
  TREATMENT: "bg-purple-100 text-purple-700", FOLLOWUP: "bg-teal-100 text-teal-700",
  CLEANING: "bg-green-100 text-green-700", EXTRACTION: "bg-red-100 text-red-700",
  OTHER: "bg-slate-100 text-slate-600",
};

type Patient = { id: string; name: string; patientRef: string; phone?: string | null };
type Doctor  = { id: string; name: string };
type Clinic  = { id: string; name: string };
type Appt = {
  id: string; apptRef: string;
  startTime: string;  // ISO datetime string from server
  duration: number;
  type: string; status: string; chiefComplaint?: string; notes?: string;
  patient: Patient; doctor: Doctor; clinic: Clinic;
  visit: { id: string; visitRef: string } | null;
};

function fmtTime(iso: string) {
  return format(parseISO(iso), "HH:mm");
}
function fmtEndTime(iso: string, duration: number) {
  return format(addMinutes(parseISO(iso), duration), "HH:mm");
}

// datetime-local gives "YYYY-MM-DDTHH:mm" — append seconds + MYT offset
function toISO(datetimeLocal: string): string {
  const base = datetimeLocal.includes("+") ? datetimeLocal : datetimeLocal + "+08:00";
  return base.replace(/(\d{2}:\d{2})(\+)/, "$1:00$2");
}

export function AppointmentsClient({
  initialAppts, clinics, doctors, patients, dateStr, clinicId,
}: {
  initialAppts: Appt[];
  clinics: Clinic[];
  doctors: Doctor[];
  patients: Patient[];
  dateStr: string;
  clinicId: string;
}) {
  const router = useRouter();
  const [appts, setAppts]         = useState<Appt[]>(initialAppts);
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState("");

  // startTime stored as datetime-local value ("2026-05-30T09:00")
  const [form, setForm] = useState({
    patientId: "", doctorId: doctors[0]?.id ?? "",
    clinicId: clinicId || clinics[0]?.id || "",
    startTime: `${dateStr}T09:00`,
    duration: 30,
    type: "CHECKUP", chiefComplaint: "", notes: "",
  });

  const filteredPatients = patients.filter(p =>
    !patientSearch ||
    p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
    p.patientRef.toLowerCase().includes(patientSearch.toLowerCase())
  );

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patientId) { setError("Select a patient"); return; }
    setSaving(true); setError("");

    const startISO = toISO(form.startTime);

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId:      form.patientId,
        clinicId:       form.clinicId,
        doctorId:       form.doctorId,
        startTime:      startISO,
        duration:       Number(form.duration),
        type:           form.type,
        chiefComplaint: form.chiefComplaint || undefined,
        notes:          form.notes || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      const detail = data.issues ? Object.entries(data.issues).map(([k,v]) => `${k}: ${(v as string[]).join(", ")}`).join(" | ") : "";
      setError((data.error ?? "Failed") + (detail ? ` — ${detail}` : ""));
      return;
    }
    setAppts(prev => [...prev, data].sort((a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    ));
    setShowForm(false);
    setForm(f => ({ ...f, patientId: "", chiefComplaint: "", notes: "" }));
    setPatientSearch("");
  }

  async function handleCheckIn(appt: Appt) {
    setCheckingIn(appt.id);
    const res = await fetch(`/api/appointments/${appt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "checkin" }),
    });
    const data = await res.json();
    setCheckingIn(null);
    if (!res.ok) return;
    router.push(`/visits/${data.visitId}`);
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancel this appointment?")) return;
    await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    setAppts(prev => prev.map(a => a.id === id ? { ...a, status: "CANCELLED" } : a));
  }

  async function handleStatus(id: string, status: string) {
    const res = await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (res.ok) setAppts(prev => prev.map(a => a.id === id ? { ...a, status: data.status } : a));
  }

  const active    = appts.filter(a => a.status !== "CANCELLED");
  const cancelled = appts.filter(a => a.status === "CANCELLED");

  return (
    <div>
      {/* Book form */}
      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Book Appointment — {dateStr}</h2>
          {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{error}</div>}
          <form onSubmit={handleBook} className="grid grid-cols-2 gap-4">

            <div className="col-span-2">
              <label className="form-label">Patient <span className="text-red-500">*</span></label>
              <input
                className="form-input mb-1" placeholder="Search by name or ref…"
                value={patientSearch}
                onChange={e => { setPatientSearch(e.target.value); setForm(f => ({ ...f, patientId: "" })); }}
              />
              {patientSearch && !form.patientId && (
                <div className="border border-slate-200 rounded-md bg-white shadow-sm max-h-40 overflow-y-auto">
                  {filteredPatients.slice(0, 10).map(p => (
                    <button key={p.id} type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between"
                      onClick={() => { setForm(f => ({ ...f, patientId: p.id })); setPatientSearch(p.name); }}>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-slate-400">{p.patientRef}</span>
                    </button>
                  ))}
                  {filteredPatients.length === 0 && (
                    <p className="px-3 py-2 text-sm text-slate-400">No patients found</p>
                  )}
                </div>
              )}
              {form.patientId && <p className="text-xs text-green-600 mt-1">✓ Patient selected</p>}
            </div>

            <div>
              <label className="form-label">Doctor <span className="text-red-500">*</span></label>
              <select className="form-input" value={form.doctorId}
                onChange={e => setForm(f => ({ ...f, doctorId: e.target.value }))} required>
                <option value="">Select doctor…</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Branch <span className="text-red-500">*</span></label>
              <select className="form-input" value={form.clinicId}
                onChange={e => setForm(f => ({ ...f, clinicId: e.target.value }))} required>
                {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Date &amp; Time <span className="text-red-500">*</span></label>
              <input
                type="datetime-local" className="form-input" required
                value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
              />
            </div>

            <div>
              <label className="form-label">Duration</label>
              <select className="form-input" value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))}>
                {[15,30,45,60,90,120].map(n => <option key={n} value={n}>{n} min</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Appointment Type</label>
              <select className="form-input" value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Chief Complaint</label>
              <input className="form-input" placeholder="e.g. Tooth pain upper right"
                value={form.chiefComplaint}
                onChange={e => setForm(f => ({ ...f, chiefComplaint: e.target.value }))} />
            </div>

            <div className="col-span-2">
              <label className="form-label">Notes</label>
              <input className="form-input" placeholder="Internal notes…"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="col-span-2 flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Booking…" : "Book Appointment"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Appointment list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            {active.length} appointment{active.length !== 1 ? "s" : ""} — {dateStr}
          </h2>
          <button onClick={() => setShowForm(f => !f)} className="btn-primary text-sm">
            {showForm ? "Cancel" : "+ Book Appointment"}
          </button>
        </div>

        {active.length === 0 && !showForm && (
          <p className="px-5 py-10 text-center text-slate-400">No appointments for this date.</p>
        )}

        <div className="divide-y divide-slate-100">
          {active.map(a => (
            <div key={a.id} className="px-5 py-4 flex items-start gap-4 hover:bg-slate-50">
              {/* Time block */}
              <div className="w-20 text-center shrink-0">
                <p className="text-lg font-bold text-slate-800">{fmtTime(a.startTime)}</p>
                <p className="text-xs text-slate-400">→ {fmtEndTime(a.startTime, a.duration)}</p>
                <p className="text-xs text-slate-400">{a.duration}m</p>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Link href={`/patients/${a.patient.id}`} className="font-semibold text-slate-900 hover:text-blue-600">
                    {a.patient.name}
                  </Link>
                  <span className="text-xs text-slate-400">{a.patient.patientRef}</span>
                  {a.patient.phone && <span className="text-xs text-slate-400">{a.patient.phone}</span>}
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`badge text-xs ${TYPE_COLORS[a.type] ?? "bg-slate-100 text-slate-600"}`}>
                    {TYPE_LABELS[a.type] ?? a.type}
                  </span>
                  <span className={STATUS_CLASS[a.status] ?? "badge-slate"}>{a.status.replace("_", " ")}</span>
                  <span className="text-xs text-slate-500">Dr. {a.doctor.name}</span>
                  <span className="text-xs text-slate-400">{a.clinic.name}</span>
                </div>
                {a.chiefComplaint && (
                  <p className="text-xs text-slate-600">Chief complaint: {a.chiefComplaint}</p>
                )}
                {a.notes && <p className="text-xs text-slate-400 italic">{a.notes}</p>}
                {a.visit && (
                  <Link href={`/visits/${a.visit.id}`} className="text-xs text-blue-600 hover:underline">
                    Visit: {a.visit.visitRef} →
                  </Link>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {a.status === "SCHEDULED" && (
                  <button onClick={() => handleStatus(a.id, "CONFIRMED")} className="btn-ghost text-xs py-1">
                    Confirm
                  </button>
                )}
                {(a.status === "SCHEDULED" || a.status === "CONFIRMED") && !a.visit && (
                  <button onClick={() => handleCheckIn(a)} disabled={checkingIn === a.id}
                    className="btn-primary text-xs py-1.5 px-3">
                    {checkingIn === a.id ? "…" : "Check In"}
                  </button>
                )}
                {a.visit && (
                  <Link href={`/visits/${a.visit.id}`} className="btn-outline text-xs py-1.5 px-3">
                    Open Visit
                  </Link>
                )}
                {a.status !== "COMPLETED" && a.status !== "CANCELLED" && (
                  <button onClick={() => handleCancel(a.id)} className="text-xs text-red-400 hover:text-red-600">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {cancelled.length > 0 && (
          <details className="border-t border-slate-200">
            <summary className="px-5 py-3 text-xs text-slate-400 cursor-pointer hover:text-slate-600">
              {cancelled.length} cancelled
            </summary>
            <div className="divide-y divide-slate-100">
              {cancelled.map(a => (
                <div key={a.id} className="px-5 py-3 flex items-center gap-3 opacity-50">
                  <span className="w-20 text-center text-sm font-bold text-slate-500">{fmtTime(a.startTime)}</span>
                  <span className="text-sm text-slate-500 line-through">{a.patient.name}</span>
                  <span className="text-xs text-slate-400">{TYPE_LABELS[a.type]}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
