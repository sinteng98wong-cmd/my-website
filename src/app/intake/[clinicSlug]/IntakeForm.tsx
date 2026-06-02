"use client";

import { useState } from "react";

type Source = { id: string; name: string };

const MY_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
  "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor",
  "Terengganu", "Kuala Lumpur", "Labuan", "Putrajaya",
];

export function IntakeForm({ clinicSlug, sources }: { clinicSlug: string; sources: Source[] }) {
  const [done, setDone]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [sourceId, setSourceId] = useState("");
  const [referrerType, setReferrerType] = useState("");  // patient | doctor | clinic

  const isReferral = sources.find((s) => s.id === sourceId)?.name.toLowerCase().includes("referral") ?? false;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    const body: any = {
      name: fd.get("name"), phone: fd.get("phone"), email: fd.get("email"),
      dateOfBirth: fd.get("dateOfBirth"), gender: fd.get("gender"),
      address: fd.get("address"), city: fd.get("city"),
      state: fd.get("state"), postcode: fd.get("postcode"),
      medicalNotes: fd.get("medicalNotes"), sourceId,
    };
    if (isReferral && referrerType) {
      body.referrerType = referrerType === "patient" ? "person" : referrerType;
      body.referrerName = fd.get("referrerName");
    }
    const res = await fetch(`/api/intake/${clinicSlug}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setLoading(false);
    if (res.ok) setDone(true);
    else setError((await res.json()).error ?? "Something went wrong. Please try again.");
  }

  if (done) {
    return (
      <div className="text-center py-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 text-2xl">✓</div>
        <h2 className="text-lg font-semibold text-slate-800">Thank you!</h2>
        <p className="text-sm text-slate-500 mt-2">
          Your details have been received. Our team will contact you shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

      <div>
        <label className="form-label">Full Name *</label>
        <input name="name" required className="form-input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Date of Birth *</label>
          <input name="dateOfBirth" type="date" required className="form-input" />
        </div>
        <div>
          <label className="form-label">Gender *</label>
          <select name="gender" required className="form-input">
            <option value="">—</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className="form-label">Phone *</label>
          <input name="phone" type="tel" required className="form-input" />
        </div>
        <div>
          <label className="form-label">Email</label>
          <input name="email" type="email" className="form-input" />
        </div>
      </div>

      <div>
        <label className="form-label">Address</label>
        <input name="address" className="form-input" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <input name="city" placeholder="City" className="form-input" />
        <select name="state" className="form-input">
          <option value="">State</option>
          {MY_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input name="postcode" placeholder="Postcode" className="form-input" />
      </div>

      <div>
        <label className="form-label">How did you hear about us? *</label>
        <select required className="form-input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="">Select…</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isReferral && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2">
          <p className="text-sm font-medium text-slate-700">Who referred you?</p>
          {[
            { key: "patient", label: "Another patient referred me" },
            { key: "doctor",  label: "A doctor referred me" },
            { key: "clinic",  label: "A clinic referred me" },
          ].map((o) => (
            <label key={o.key} className="flex items-center gap-2 text-sm">
              <input type="radio" name="referrerType" checked={referrerType === o.key}
                onChange={() => setReferrerType(o.key)} />
              {o.label}
            </label>
          ))}
          {referrerType && (
            <input name="referrerName" className="form-input mt-1"
              placeholder={referrerType === "patient" ? "Patient name or phone" : referrerType === "doctor" ? "Doctor's name" : "Clinic name"} />
          )}
        </div>
      )}

      <div>
        <label className="form-label">Any allergies or medical notes</label>
        <textarea name="medicalNotes" rows={3} className="form-input" />
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Submitting…" : "Submit Registration"}
      </button>
    </form>
  );
}
