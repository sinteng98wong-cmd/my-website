"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Clinic = { id: string; name: string };
type Record_ = { id: string; discRef: string; type: string; status: string; incidentDate: string; isConfidential: boolean; staffProfile: { user: { name: string } }; clinic: { name: string } };

const TYPES = ["VERBAL_WARNING","WRITTEN_WARNING","SHOW_CAUSE","SUSPENSION","DEMOTION","TERMINATION"];
const STATUS_BADGE: Record<string, string> = { OPEN:"bg-red-100 text-red-700", RESPONDED:"bg-amber-100 text-amber-700", RESOLVED:"bg-green-100 text-green-700", CLOSED:"bg-slate-100 text-slate-500", APPEALED:"bg-purple-100 text-purple-700" };

export function DisciplinaryClient({ clinics, isSuperAdmin }: { clinics: Clinic[]; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [records, setRecords] = useState<Record_[]>([]);
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [staff, setStaff] = useState<any[]>([]);
  const [form, setForm] = useState({ staffProfileId: "", clinicId: clinics[0]?.id ?? "", type: "VERBAL_WARNING", incidentDate: "", incidentDesc: "", responseDeadline: "", isConfidential: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (clinicId) params.set("clinicId", clinicId);
    if (statusFilter) params.set("status", statusFilter);
    const d = await fetch(`/api/hr/disciplinary?${params}`).then((r) => r.json());
    setRecords(Array.isArray(d) ? d : []);
  }
  useEffect(() => { load(); }, [clinicId, statusFilter]);

  async function openNew() {
    const s = await fetch("/api/hr/staff").then((r) => r.json()).catch(() => []);
    setStaff(Array.isArray(s) ? s : []);
    setForm((f) => ({ ...f, clinicId: clinicId, staffProfileId: "", incidentDate: "", incidentDesc: "", responseDeadline: "" }));
    setError("");
    setShowNew(true);
  }

  async function create() {
    setBusy(true); setError("");
    const res = await fetch("/api/hr/disciplinary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, attachmentUrls: [] }) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    setShowNew(false);
    router.push(`/hr/disciplinary/${d.id}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">Disciplinary Records</h1>
        <div className="flex gap-2 flex-wrap items-center">
          <select className="form-input w-40 text-sm" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="form-input w-36 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {Object.keys(STATUS_BADGE).map((s) => <option key={s}>{s}</option>)}
          </select>
          <button onClick={openNew} className="btn-primary text-sm">New Record</button>
        </div>
      </div>

      {showNew && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-slate-800">New Disciplinary Record</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Staff *</label>
              <select className="form-input" value={form.staffProfileId} onChange={(e) => setForm((f) => ({ ...f, staffProfileId: e.target.value }))}>
                <option value="">Select…</option>
                {staff.map((s: any) => <option key={s.id} value={s.id}>{s.user?.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Type *</label>
              <select className="form-input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Incident Date *</label>
              <input type="date" className="form-input" value={form.incidentDate} onChange={(e) => setForm((f) => ({ ...f, incidentDate: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Response Deadline</label>
              <input type="date" className="form-input" value={form.responseDeadline} onChange={(e) => setForm((f) => ({ ...f, responseDeadline: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="form-label">Incident Description *</label>
            <textarea rows={4} className="form-input" value={form.incidentDesc} onChange={(e) => setForm((f) => ({ ...f, incidentDesc: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isConfidential} onChange={(e) => setForm((f) => ({ ...f, isConfidential: e.target.checked }))} />
            Confidential
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={create} disabled={busy} className="btn-primary text-sm">{busy ? "Creating…" : "Create Record"}</button>
            <button onClick={() => setShowNew(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>{["Ref","Staff","Type","Incident Date","Status","Confidential",""].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {records.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No records.</td></tr>}
            {records.map((r) => (
              <tr key={r.id} className="table-row cursor-pointer" onClick={() => router.push(`/hr/disciplinary/${r.id}`)}>
                <td className="px-4 py-3 text-slate-500 text-xs">{r.discRef}</td>
                <td className="px-4 py-3 font-medium">{r.staffProfile.user.name}</td>
                <td className="px-4 py-3">{r.type.replace("_"," ")}</td>
                <td className="px-4 py-3 text-slate-600">{new Date(r.incidentDate).toLocaleDateString("en-MY")}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                <td className="px-4 py-3 text-center">{r.isConfidential ? "🔒" : ""}</td>
                <td className="px-4 py-3 text-blue-600 text-xs">View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
