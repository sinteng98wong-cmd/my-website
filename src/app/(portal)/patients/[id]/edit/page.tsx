"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ReferralFields, emptyReferral, type ReferralValue } from "@/components/ReferralFields";

type Source = { id: string; name: string };

const MY_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
  "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor",
  "Terengganu", "Kuala Lumpur", "Labuan", "Putrajaya",
];

export default function EditPatientPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [referral, setReferral] = useState<ReferralValue>(emptyReferral);
  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/patient-sources").then((r) => r.json()).then(setSources).catch(() => {});
    fetch(`/api/patients/${id}`).then((r) => r.json()).then((p) => {
      setForm({
        name: p.name ?? "", icNumber: p.icNumber ?? "", passportNo: p.passportNo ?? "",
        isForeigner: p.isForeigner, phone: p.phone ?? "", email: p.email ?? "",
        dateOfBirth: p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : "",
        gender: p.gender ?? "", address: p.address ?? "", city: p.city ?? "",
        state: p.state ?? "", postcode: p.postcode ?? "", status: p.status ?? "ACTIVE",
        medicalNotes: p.medicalNotes ?? "",
      });
      setSourceId(p.sourceId ?? "");
      if (p.referralType) {
        setReferral({
          referralType: p.referralType,
          referredByPatientId: p.referredByPatientId ?? "",
          referredByPatientName: p.referredByPatient ? `${p.referredByPatient.name} (${p.referredByPatient.patientRef})` : "",
          referredByDoctorId: p.referredByDoctorId ?? "",
          referredByClinicId: p.referredByClinicId ?? "",
          externalReferrerName: p.externalReferrerName ?? "",
          externalReferrerType: p.externalReferrerType ?? "person",
          externalReferrerPhone: p.externalReferrerPhone ?? "",
          externalReferrerEmail: p.externalReferrerEmail ?? "",
        });
      }
      setLoading(false);
    }).catch(() => { setError("Failed to load patient"); setLoading(false); });
  }, [id]);

  const selectedSource = sources.find((s) => s.id === sourceId);
  const isReferral = selectedSource?.name.toLowerCase().includes("referral") ?? false;
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    const body: any = {
      name: form.name, icNumber: form.isForeigner ? null : form.icNumber,
      passportNo: form.isForeigner ? form.passportNo : null,
      phone: form.phone, email: form.email, dateOfBirth: form.dateOfBirth || null,
      gender: form.gender || null, address: form.address, city: form.city,
      state: form.state, postcode: form.postcode, status: form.status,
      medicalNotes: form.medicalNotes, sourceId: sourceId || null,
      referralType: isReferral ? (referral.referralType || null) : null,
      referredByPatientId: referral.referredByPatientId,
      referredByDoctorId: referral.referredByDoctorId,
      referredByClinicId: referral.referredByClinicId,
      externalReferrerName: referral.externalReferrerName,
      externalReferrerType: referral.externalReferrerType,
      externalReferrerPhone: referral.externalReferrerPhone,
      externalReferrerEmail: referral.externalReferrerEmail,
    };
    const res = await fetch(`/api/patients/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error ?? "Failed to save"); return; }
    router.push(`/patients/${id}`);
    router.refresh();
  }

  if (loading || !form) return <div className="p-8 text-slate-400">Loading…</div>;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href={`/patients/${id}`} className="text-sm text-slate-500 hover:text-slate-700">← Back to patient</Link>
        <h1 className="page-title mt-2">Edit Patient</h1>
      </div>

      <div className="card p-6">
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{error}</div>}
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Full Name <span className="text-red-500">*</span></label>
              <input required className="form-input" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Status</label>
              <select className="form-input" value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="ACTIVE">Active</option>
                <option value="PENDING">Pending</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isForeigner} onChange={(e) => set("isForeigner", e.target.checked)} />
            Foreign patient (passport holder)
          </label>

          <div className="grid grid-cols-2 gap-4">
            {form.isForeigner ? (
              <div>
                <label className="form-label">Passport Number</label>
                <input className="form-input" value={form.passportNo} onChange={(e) => set("passportNo", e.target.value)} />
              </div>
            ) : (
              <div>
                <label className="form-label">IC Number</label>
                <input className="form-input" value={form.icNumber} onChange={(e) => set("icNumber", e.target.value)} />
              </div>
            )}
            <div>
              <label className="form-label">Date of Birth</label>
              <input type="date" className="form-input" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Gender</label>
              <select className="form-input" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">—</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input type="tel" className="form-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="form-label">Email</label>
              <input type="email" className="form-input" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <p className="text-sm font-semibold text-slate-700 mb-2">Address</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="form-label">Street Address</label>
                <input className="form-input" value={form.address} onChange={(e) => set("address", e.target.value)} />
              </div>
              <div>
                <label className="form-label">City</label>
                <input className="form-input" value={form.city} onChange={(e) => set("city", e.target.value)} />
              </div>
              <div>
                <label className="form-label">State</label>
                <select className="form-input" value={form.state} onChange={(e) => set("state", e.target.value)}>
                  <option value="">—</option>
                  {MY_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Postcode</label>
                <input className="form-input" value={form.postcode} onChange={(e) => set("postcode", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <label className="form-label">How did you hear about us?</label>
            <select className="form-input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">—</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {isReferral && <ReferralFields value={referral} onChange={setReferral} />}

          <div>
            <label className="form-label">Medical Notes</label>
            <textarea rows={3} className="form-input" value={form.medicalNotes} onChange={(e) => set("medicalNotes", e.target.value)} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save Changes"}</button>
            <Link href={`/patients/${id}`} className="btn-outline">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
