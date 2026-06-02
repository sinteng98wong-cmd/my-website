"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Clinic = { id: string; name: string };

const ROLES = ["DOCTOR","NURSE","RECEPTIONIST","STOREKEEPER","FINANCE","CLINIC_MANAGER"];
const EMP_TYPES = ["FULL_TIME","PART_TIME","CONTRACT","LOCUM","INTERN"];
const STEPS = ["Personal Info","Employment","Payroll","Review & Create"];

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="form-label">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

export function NewStaffClient({ clinics }: { clinics: Clinic[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ id: string; tempPassword?: string } | null>(null);

  const [form, setForm] = useState({
    // Step 1
    name: "", email: "", phone: "", dateOfBirth: "", gender: "MALE",
    icNo: "", passportNo: "", address: "", city: "", state: "", postcode: "",
    emergencyName: "", emergencyPhone: "", emergencyRelation: "",
    // Step 2
    employeeId: "", jobTitle: "", department: "",
    userRole: "NURSE", employmentType: "FULL_TIME", employmentStatus: "PROBATION",
    joinDate: "", confirmationDate: "", clinicId: clinics[0]?.id ?? "",
    // Step 3
    basicSalary: "", bankName: "", bankAccountNo: "", epfNo: "", socsoNo: "", incomeTaxNo: "",
    // Options
    createAccount: true,
  });

  const F = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));
  const FC = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.checked }));

  async function submit() {
    setError(""); setBusy(true);
    const res = await fetch("/api/hr/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, basicSalary: form.basicSalary ? parseFloat(form.basicSalary) : undefined }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    setCreated({ id: d.id, tempPassword: d.tempPassword });
  }

  if (created) {
    return (
      <div className="max-w-lg mx-auto card p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <span className="text-3xl">✓</span>
        </div>
        <h2 className="text-xl font-bold text-slate-800">Staff Member Created!</h2>
        <p className="text-slate-600">{form.name} has been added to the system.</p>
        {created.tempPassword && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
            <p className="font-medium">Temporary password:</p>
            <p className="font-mono text-lg">{created.tempPassword}</p>
            <p className="text-xs mt-1">Share this securely with the staff member.</p>
          </div>
        )}
        <div className="flex gap-2 justify-center">
          <button onClick={() => router.push(`/hr/staff/${created.id}`)} className="btn-primary">View Profile</button>
          <button onClick={() => router.push("/hr/staff")} className="btn-secondary">Back to Directory</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={() => router.push("/hr/staff")} className="text-sm text-slate-500 hover:text-slate-700">← Staff Directory</button>
      </div>
      <h1 className="page-title">Add Staff Member</h1>

      {/* Step indicator */}
      <div className="flex gap-0">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1 flex items-center">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-l-md ${i === 0 ? "rounded-l-md" : ""} ${i === STEPS.length-1 ? "rounded-r-md" : ""} w-full ${i === step ? "bg-blue-600 text-white" : i < step ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"}`}>
              <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ borderColor: "currentColor" }}>{i < step ? "✓" : i + 1}</span>
              <span className="text-xs font-medium hidden sm:block">{s}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-6 space-y-4">
        {step === 0 && (
          <>
            <h2 className="font-semibold text-slate-800">Personal Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Full Name" required><input className="form-input" value={form.name} onChange={F("name")} /></Field>
              <Field label="Email"><input type="email" className="form-input" value={form.email} onChange={F("email")} /></Field>
              <Field label="Phone"><input className="form-input" value={form.phone} onChange={F("phone")} /></Field>
              <Field label="Date of Birth"><input type="date" className="form-input" value={form.dateOfBirth} onChange={F("dateOfBirth")} /></Field>
              <Field label="Gender">
                <select className="form-input" value={form.gender} onChange={F("gender")}>
                  {["MALE","FEMALE","OTHER"].map(g => <option key={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="IC No"><input className="form-input" value={form.icNo} onChange={F("icNo")} /></Field>
              <Field label="Passport No"><input className="form-input" value={form.passportNo} onChange={F("passportNo")} /></Field>
              <Field label="State"><input className="form-input" value={form.state} onChange={F("state")} /></Field>
            </div>
            <Field label="Address"><input className="form-input" value={form.address} onChange={F("address")} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="City"><input className="form-input" value={form.city} onChange={F("city")} /></Field>
              <Field label="Postcode"><input className="form-input" value={form.postcode} onChange={F("postcode")} /></Field>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-slate-700 mb-3">Emergency Contact</p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Name"><input className="form-input" value={form.emergencyName} onChange={F("emergencyName")} /></Field>
                <Field label="Phone"><input className="form-input" value={form.emergencyPhone} onChange={F("emergencyPhone")} /></Field>
                <Field label="Relationship"><input className="form-input" value={form.emergencyRelation} onChange={F("emergencyRelation")} /></Field>
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="font-semibold text-slate-800">Employment Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Employee ID"><input className="form-input font-mono" value={form.employeeId} onChange={F("employeeId")} placeholder="Auto-generated if blank" /></Field>
              <Field label="Assign to Clinic" required>
                <select className="form-input" value={form.clinicId} onChange={F("clinicId")}>
                  {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Job Title"><input className="form-input" value={form.jobTitle} onChange={F("jobTitle")} /></Field>
              <Field label="Department"><input className="form-input" value={form.department} onChange={F("department")} /></Field>
              <Field label="Role" required>
                <select className="form-input" value={form.userRole} onChange={F("userRole")}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Employment Type">
                <select className="form-input" value={form.employmentType} onChange={F("employmentType")}>
                  {EMP_TYPES.map(t => <option key={t}>{t.replace("_"," ")}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className="form-input" value={form.employmentStatus} onChange={F("employmentStatus")}>
                  {["PROBATION","ACTIVE"].map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Join Date"><input type="date" className="form-input" value={form.joinDate} onChange={F("joinDate")} /></Field>
              <Field label="Confirmation Date"><input type="date" className="form-input" value={form.confirmationDate} onChange={F("confirmationDate")} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm mt-2">
              <input type="checkbox" checked={form.createAccount} onChange={FC("createAccount")} />
              Create login account for this staff member
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="font-semibold text-slate-800">Payroll Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Basic Salary (RM)"><input type="number" className="form-input" value={form.basicSalary} onChange={F("basicSalary")} /></Field>
              <Field label="Bank Name"><input className="form-input" value={form.bankName} onChange={F("bankName")} /></Field>
              <Field label="Bank Account No"><input className="form-input font-mono" value={form.bankAccountNo} onChange={F("bankAccountNo")} /></Field>
              <Field label="EPF No"><input className="form-input font-mono" value={form.epfNo} onChange={F("epfNo")} /></Field>
              <Field label="SOCSO No"><input className="form-input font-mono" value={form.socsoNo} onChange={F("socsoNo")} /></Field>
              <Field label="Income Tax No"><input className="form-input font-mono" value={form.incomeTaxNo} onChange={F("incomeTaxNo")} /></Field>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="font-semibold text-slate-800">Review & Create</h2>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Name", form.name], ["Email", form.email], ["Phone", form.phone],
                  ["Role", form.userRole], ["Type", form.employmentType], ["Status", form.employmentStatus],
                  ["Clinic", clinics.find(c => c.id === form.clinicId)?.name ?? "—"],
                  ["Join Date", form.joinDate || "—"], ["Basic Salary", form.basicSalary ? `RM ${form.basicSalary}` : "—"],
                ].map(([label, val]) => (
                  <div key={label}><span className="text-slate-400">{label}:</span> <span className="font-medium">{val}</span></div>
                ))}
              </div>
              {form.createAccount && <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">A login account will be created. Save the temporary password shown after creation.</p>}
            </div>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-between">
        <button onClick={() => step === 0 ? router.push("/hr/staff") : setStep(s => s - 1)} className="btn-secondary">
          {step === 0 ? "Cancel" : "← Back"}
        </button>
        {step < STEPS.length - 1
          ? <button onClick={() => { if (!form.name && step === 0) { setError("Full name is required"); return; } setError(""); setStep(s => s + 1); }} className="btn-primary">Next →</button>
          : <button onClick={submit} disabled={busy} className="btn-primary">{busy ? "Creating…" : "Create Staff Member"}</button>
        }
      </div>
    </div>
  );
}
