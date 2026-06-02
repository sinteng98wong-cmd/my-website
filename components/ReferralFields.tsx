"use client";

import { useEffect, useState } from "react";

export type ReferralValue = {
  referralType:          string;   // "" | PATIENT | INTERNAL_DOCTOR | INTERNAL_CLINIC | EXTERNAL
  referredByPatientId:   string;
  referredByPatientName: string;   // display only
  referredByDoctorId:    string;
  referredByClinicId:    string;
  externalReferrerName:  string;
  externalReferrerType:  string;   // doctor | clinic | person
  externalReferrerPhone: string;
  externalReferrerEmail: string;
};

export const emptyReferral: ReferralValue = {
  referralType: "", referredByPatientId: "", referredByPatientName: "",
  referredByDoctorId: "", referredByClinicId: "",
  externalReferrerName: "", externalReferrerType: "person",
  externalReferrerPhone: "", externalReferrerEmail: "",
};

type Doctor = { id: string; name: string; clinicName: string | null };
type Clinic = { id: string; name: string };

const TYPES = [
  { key: "PATIENT",         label: "Existing Patient" },
  { key: "INTERNAL_DOCTOR", label: "Our Doctor" },
  { key: "INTERNAL_CLINIC", label: "Another Clinic" },
  { key: "EXTERNAL",        label: "External (not in system)" },
];

export function ReferralFields({
  value, onChange,
}: {
  value: ReferralValue;
  onChange: (v: ReferralValue) => void;
}) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<{ id: string; name: string; patientRef: string }[]>([]);

  const set = (patch: Partial<ReferralValue>) => onChange({ ...value, ...patch });

  useEffect(() => {
    fetch("/api/users/doctors").then((r) => r.json()).then(setDoctors).catch(() => {});
    fetch("/api/clinics").then((r) => r.json()).then(setClinics).catch(() => {});
  }, []);

  useEffect(() => {
    if (value.referralType !== "PATIENT" || patientQuery.length < 2) { setPatientResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/patients?q=${encodeURIComponent(patientQuery)}`)
        .then((r) => r.json())
        .then((rows: any[]) => setPatientResults(rows.slice(0, 8).map((p) => ({ id: p.id, name: p.name, patientRef: p.patientRef }))))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [patientQuery, value.referralType]);

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-4">
      <p className="text-sm font-semibold text-slate-700">Referred by</p>

      {/* Type radios */}
      <div className="grid grid-cols-2 gap-2">
        {TYPES.map((t) => (
          <label key={t.key} className={`flex items-center gap-2 rounded-md border p-2 cursor-pointer text-sm ${
            value.referralType === t.key ? "border-blue-500 bg-white" : "border-slate-200 bg-white/60"
          }`}>
            <input type="radio" name="referralType" checked={value.referralType === t.key}
              onChange={() => set({ referralType: t.key })} />
            {t.label}
          </label>
        ))}
      </div>

      {/* PATIENT */}
      {value.referralType === "PATIENT" && (
        <div>
          {value.referredByPatientId ? (
            <div className="flex items-center justify-between rounded-md bg-white border border-slate-200 px-3 py-2 text-sm">
              <span>{value.referredByPatientName}</span>
              <button type="button" className="text-xs text-red-500" onClick={() => set({ referredByPatientId: "", referredByPatientName: "" })}>Change</button>
            </div>
          ) : (
            <div className="relative">
              <input className="form-input" placeholder="Search patient by name / phone / IC…"
                value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
              {patientResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow max-h-48 overflow-y-auto">
                  {patientResults.map((p) => (
                    <button key={p.id} type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-0"
                      onClick={() => { set({ referredByPatientId: p.id, referredByPatientName: `${p.name} (${p.patientRef})` }); setPatientQuery(""); setPatientResults([]); }}>
                      {p.name} <span className="text-slate-400 text-xs">{p.patientRef}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* INTERNAL_DOCTOR */}
      {value.referralType === "INTERNAL_DOCTOR" && (
        <div className="space-y-2">
          <select className="form-input" value={value.referredByDoctorId}
            onChange={(e) => set({ referredByDoctorId: e.target.value })}>
            <option value="">Select doctor…</option>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.clinicName ? ` — ${d.clinicName}` : ""}</option>)}
          </select>
          <button type="button" className="text-xs text-blue-600"
            onClick={() => set({ referralType: "EXTERNAL", externalReferrerType: "doctor" })}>
            Doctor not in system? Enter name instead →
          </button>
        </div>
      )}

      {/* INTERNAL_CLINIC */}
      {value.referralType === "INTERNAL_CLINIC" && (
        <div className="space-y-2">
          <select className="form-input" value={value.referredByClinicId}
            onChange={(e) => set({ referredByClinicId: e.target.value })}>
            <option value="">Select clinic…</option>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" className="text-xs text-blue-600"
            onClick={() => set({ referralType: "EXTERNAL", externalReferrerType: "clinic" })}>
            Clinic not in system? Enter name instead →
          </button>
        </div>
      )}

      {/* EXTERNAL */}
      {value.referralType === "EXTERNAL" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select className="form-input" value={value.externalReferrerType}
              onChange={(e) => set({ externalReferrerType: e.target.value })}>
              <option value="doctor">Doctor</option>
              <option value="clinic">Clinic</option>
              <option value="person">Person</option>
            </select>
            <input className="form-input" placeholder="Name *" value={value.externalReferrerName}
              onChange={(e) => set({ externalReferrerName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="form-input" placeholder="Phone (optional)" value={value.externalReferrerPhone}
              onChange={(e) => set({ externalReferrerPhone: e.target.value })} />
            <input className="form-input" placeholder="Email (optional)" value={value.externalReferrerEmail}
              onChange={(e) => set({ externalReferrerEmail: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}
