"use client";

import { useEffect, useState } from "react";

type Clinic = { id: string; name: string };

export function PairingsClient({ clinics }: { clinics: Clinic[] }) {
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [rows, setRows] = useState<any[]>([]);
  const [staff, setStaff] = useState<{ doctors: any[]; nurses: any[] }>({ doctors: [], nurses: [] });
  const [overrideDate, setOverrideDate] = useState(new Date().toISOString().slice(0, 10));
  const [setModal, setSetModal] = useState(false);
  const [ovModal, setOvModal] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [form, setForm] = useState({ dentistProfileId: "", nurseProfileId: "" });
  const [msg, setMsg] = useState("");

  async function load() {
    if (!clinicId) return;
    const d = await fetch(`/api/hr/pairings?clinicId=${clinicId}&date=${overrideDate}`).then((r) => r.json());
    setRows(Array.isArray(d) ? d : []);
  }
  useEffect(() => { load(); }, [clinicId, overrideDate]);

  // staff lists for selectors (reuse pairings rows for doctors; fetch nurses via suggest of first doctor is wrong — use a roster endpoint)
  useEffect(() => {
    if (!clinicId) return;
    // doctors come from pairing rows; nurses we derive from suggestions when needed
    fetch(`/api/hr/pairings?clinicId=${clinicId}`).then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setStaff((s) => ({ ...s, doctors: d.map((x) => x.dentist) }));
    });
  }, [clinicId]);

  async function loadSuggestions(dentistProfileId: string) {
    const d = await fetch(`/api/hr/pairings/suggest?clinicId=${clinicId}&dentistProfileId=${dentistProfileId}&date=${overrideDate}`).then((r) => r.json());
    setSuggestions(Array.isArray(d) ? d : []);
  }

  async function saveDefault() {
    const res = await fetch("/api/hr/pairings/default", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, clinicId }) });
    if (!res.ok) { setMsg((await res.json()).error); return; }
    setSetModal(false); setForm({ dentistProfileId: "", nurseProfileId: "" }); load();
  }
  async function saveOverride() {
    const res = await fetch("/api/hr/pairings/override", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, clinicId, date: overrideDate }) });
    const d = await res.json();
    if (!res.ok) { setMsg(d.error); return; }
    if (d.warnings?.length) setMsg(d.warnings.join(" "));
    setOvModal(false); setForm({ dentistProfileId: "", nurseProfileId: "" }); load();
  }
  async function removePairing(id: string, isDefault: boolean) {
    if (!confirm(isDefault ? "This will remove the permanent pairing. Continue?" : "Remove this override?")) return;
    await fetch(`/api/hr/pairings/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Dentist–Nurse Pairings</h1>
        <select className="form-input w-44" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>{clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>
      {msg && <div className="p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">{msg}</div>}

      {/* Default pairings */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-semibold text-slate-700">Default Pairings</h2>
          <button onClick={() => { setSetModal(true); setForm({ dentistProfileId: "", nurseProfileId: "" }); setSuggestions([]); }} className="btn-primary text-sm">Set Pairing</button>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Dentist", "Default Nurse", "Since", ""].map((h) => <th key={h} className="px-4 py-2 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dentist.profileId} className="table-row">
                <td className="px-4 py-2.5 font-medium">{r.dentist.name}</td>
                <td className="px-4 py-2.5">{r.defaultNurse ? r.defaultNurse.name : <span className="text-slate-400">— none —</span>}</td>
                <td className="px-4 py-2.5 text-slate-400 text-xs">{r.defaultNurse?.since ? new Date(r.defaultNurse.since).toLocaleDateString("en-MY") : "—"}</td>
                <td className="px-4 py-2.5">{r.defaultNurse && <button onClick={() => removePairing(r.defaultNurse.pairingId, true)} className="text-xs text-red-500 hover:underline">Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Date overrides */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center gap-3">
          <h2 className="font-semibold text-slate-700">Date Overrides</h2>
          <div className="flex gap-2 items-center">
            <input type="date" className="form-input text-sm py-1" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} />
            <button onClick={() => { setOvModal(true); setForm({ dentistProfileId: "", nurseProfileId: "" }); setSuggestions([]); }} className="btn-outline text-sm">Add Override</button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Dentist", "Override Nurse", "Date", ""].map((h) => <th key={h} className="px-4 py-2 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {rows.filter((r) => r.dateOverride).length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No overrides for {overrideDate}.</td></tr>}
            {rows.filter((r) => r.dateOverride).map((r) => (
              <tr key={r.dentist.profileId} className="table-row">
                <td className="px-4 py-2.5 font-medium">{r.dentist.name}</td>
                <td className="px-4 py-2.5">{r.dateOverride.nurse?.user?.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{overrideDate}</td>
                <td className="px-4 py-2.5"><button onClick={() => removePairing(r.dateOverride.pairingId, false)} className="text-xs text-red-500 hover:underline">Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {(setModal || ovModal) && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => { setSetModal(false); setOvModal(false); }}>
          <div className="bg-white rounded-lg p-6 w-[28rem] space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">{setModal ? "Set Default Pairing" : `Override for ${overrideDate}`}</h3>
            <div>
              <label className="form-label">Dentist</label>
              <select className="form-input" value={form.dentistProfileId} onChange={(e) => { setForm((f) => ({ ...f, dentistProfileId: e.target.value })); loadSuggestions(e.target.value); }}>
                <option value="">Select…</option>
                {staff.doctors.map((d) => <option key={d.profileId} value={d.profileId}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Nurse {ovModal && <span className="text-xs text-slate-400">(availability shown)</span>}</label>
              <select className="form-input" value={form.nurseProfileId} onChange={(e) => setForm((f) => ({ ...f, nurseProfileId: e.target.value }))}>
                <option value="">Select…</option>
                {suggestions.map((s) => <option key={s.nurseProfileId} value={s.nurseProfileId} disabled={ovModal && !s.isAvailable}>
                  {s.nurseName}{s.isPreviouslyPaired ? " ★" : ""}{ovModal && !s.isAvailable ? ` — ${s.unavailableReason}` : ""}
                </option>)}
              </select>
              {form.dentistProfileId && suggestions.length === 0 && <p className="text-xs text-slate-400 mt-1">No nurses found.</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={setModal ? saveDefault : saveOverride} disabled={!form.dentistProfileId || !form.nurseProfileId} className="btn-primary disabled:opacity-50">Save</button>
              <button onClick={() => { setSetModal(false); setOvModal(false); }} className="btn-outline">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
