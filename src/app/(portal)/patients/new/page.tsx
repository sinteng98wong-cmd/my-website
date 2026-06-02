"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ReferralFields, emptyReferral, type ReferralValue } from "@/components/ReferralFields";

type Clinic = { id: string; name: string };
type Source = { id: string; name: string };

const MY_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
  "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor",
  "Terengganu", "Kuala Lumpur", "Labuan", "Putrajaya",
];

export default function NewPatientPage() {
  const router = useRouter();
  const [isForeigner, setIsForeigner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [referral, setReferral] = useState<ReferralValue>(emptyReferral);

  useEffect(() => {
    fetch("/api/clinics").then((r) => r.json()).then(setClinics).catch(() => {});
    fetch("/api/admin/patient-sources").then((r) => r.json()).then(setSources).catch(() => {});
  }, []);

  const selectedSource = sources.find((s) => s.id === sourceId);
  const isReferral = selectedSource?.name.toLowerCase().includes("referral") ?? false;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body: any = {
      name: fd.get("name") as string,
      homeClinicId: fd.get("homeClinicId") as string,
      isForeigner,
      icNumber: !isForeigner ? (fd.get("icNumber") as string) || undefined : undefined,
      passportNo: isForeigner ? (fd.get("passportNo") as string) || undefined : undefined,
      phone: (fd.get("phone") as string) || undefined,
      email: (fd.get("email") as string) || undefined,
      dateOfBirth: (fd.get("dateOfBirth") as string) || undefined,
      gender: (fd.get("gender") as string) || undefined,
      address: (fd.get("address") as string) || undefined,
      city: (fd.get("city") as string) || undefined,
      state: (fd.get("state") as string) || undefined,
      postcode: (fd.get("postcode") as string) || undefined,
      sourceId: sourceId || undefined,
    };
    if (isReferral && referral.referralType) {
      Object.assign(body, {
        referralType: referral.referralType,
        referredByPatientId: referral.referredByPatientId || undefined,
        referredByDoctorId: referral.referredByDoctorId || undefined,
        referredByClinicId: referral.referredByClinicId || undefined,
        externalReferrerName: referral.externalReferrerName || undefined,
        externalReferrerType: referral.externalReferrerType || undefined,
        externalReferrerPhone: referral.externalReferrerPhone || undefined,
        externalReferrerEmail: referral.externalReferrerEmail || undefined,
      });
    }

    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to register patient");
      return;
    }
    const patient = await res.json();
    router.push(`/patients/${patient.id}`);
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="page-title">Register Patient</h1>
        <p className="text-sm text-slate-500 mt-0.5">Create a new patient record</p>
      </div>

      <div className="card p-6">
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Full Name <span className="text-red-500">*</span></label>
              <input name="name" required className="form-input" />
            </div>
            <div>
              <label className="form-label">Home Clinic <span className="text-red-500">*</span></label>
              <select name="homeClinicId" required className="form-input">
                <option value="">Select clinic…</option>
                {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input id="foreigner" type="checkbox" checked={isForeigner}
              onChange={(e) => setIsForeigner(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600" />
            <label htmlFor="foreigner" className="text-sm font-medium text-slate-700">Foreign patient (passport holder)</label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {isForeigner ? (
              <div>
                <label className="form-label">Passport Number <span className="text-red-500">*</span></label>
                <input name="passportNo" required className="form-input" />
              </div>
            ) : (
              <div>
                <label className="form-label">IC Number <span className="text-red-500">*</span></label>
                <input name="icNumber" required className="form-input" placeholder="900101-14-5678" />
              </div>
            )}
            <div>
              <label className="form-label">Date of Birth</label>
              <input name="dateOfBirth" type="date" className="form-input" />
            </div>
            <div>
              <label className="form-label">Gender</label>
              <select name="gender" className="form-input">
                <option value="">—</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input name="phone" type="tel" className="form-input" placeholder="+60 12-345 6789" />
            </div>
            <div className="col-span-2">
              <label className="form-label">Email</label>
              <input name="email" type="email" className="form-input" />
            </div>
          </div>

          {/* Address */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-sm font-semibold text-slate-700 mb-2">Address</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="form-label">Street Address</label>
                <input name="address" className="form-input" />
              </div>
              <div>
                <label className="form-label">City</label>
                <input name="city" className="form-input" />
              </div>
              <div>
                <label className="form-label">State</label>
                <select name="state" className="form-input">
                  <option value="">—</option>
                  {MY_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Postcode</label>
                <input name="postcode" className="form-input" />
              </div>
            </div>
          </div>

          {/* Source */}
          <div className="pt-2 border-t border-slate-100">
            <label className="form-label">How did you hear about us? <span className="text-red-500">*</span></label>
            <select required className="form-input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">Select…</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {isReferral && <ReferralFields value={referral} onChange={setReferral} />}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Saving…" : "Register Patient"}
            </button>
            <button type="button" onClick={() => router.back()} className="btn-outline">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
