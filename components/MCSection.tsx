"use client";

import { useState, useEffect } from "react";

interface MC {
  id: string;
  mcRef: string;
  issueDate: string;
  fromDate: string;
  toDate: string;
  days: number;
  diagnosis: string | null;
  remarks: string | null;
  issuedBy: { name: string };
  clinic: { name: string };
}

interface Clinic { id: string; name: string }

export function MCSection({ patientId, clinics }: { patientId: string; clinics: Clinic[] }) {
  const [mcs, setMcs]         = useState<MC[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  // Form state
  const [fromDate, setFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [toDate, setToDate]     = useState(new Date().toISOString().slice(0, 10));
  const [diagnosis, setDiagnosis] = useState("");
  const [remarks, setRemarks]   = useState("");
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");

  const days = Math.max(1, Math.round(
    (new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1);

  useEffect(() => {
    fetch(`/api/patients/${patientId}/mc`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setMcs(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [patientId]);

  async function handleIssue() {
    if (!clinicId) { setError("Select a clinic"); return; }
    setSaving(true); setError("");
    const res = await fetch(`/api/patients/${patientId}/mc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromDate, toDate, diagnosis, remarks, clinicId }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to issue MC");
      setSaving(false);
      return;
    }
    const newMc = await res.json();
    setMcs((prev) => [newMc, ...prev]);
    setSaving(false);
    setShowForm(false);
    setDiagnosis("");
    setRemarks("");
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString("en-MY", { dateStyle: "medium" });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{mcs.length} MC{mcs.length !== 1 ? "s" : ""} issued</p>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs px-3 py-1.5">
          {showForm ? "Cancel" : "+ Issue MC"}
        </button>
      </div>

      {/* Issue form */}
      {showForm && (
        <div className="border border-slate-200 rounded-lg p-4 mb-4 bg-slate-50">
          <p className="text-sm font-semibold text-slate-900 mb-3">Issue Medical Certificate</p>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="form-label text-xs">From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="form-input text-sm" />
            </div>
            <div>
              <label className="form-label text-xs">To Date</label>
              <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} className="form-input text-sm" />
            </div>
          </div>

          <div className="mb-3 p-2.5 bg-blue-50 border border-blue-200 rounded-md text-center">
            <span className="text-sm font-semibold text-blue-700">{days} day{days !== 1 ? "s" : ""}</span>
            <span className="text-xs text-blue-500 ml-1">rest</span>
          </div>

          <div className="mb-3">
            <label className="form-label text-xs">Clinic</label>
            <select value={clinicId} onChange={(e) => setClinicId(e.target.value)} className="form-input text-sm">
              {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="mb-3">
            <label className="form-label text-xs">Diagnosis / Reason</label>
            <input type="text" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="e.g. Dental pain, Post-extraction" className="form-input text-sm" />
          </div>

          <div className="mb-4">
            <label className="form-label text-xs">Remarks</label>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)}
              rows={2} placeholder="Additional notes…" className="form-input text-sm resize-none" />
          </div>

          <button onClick={handleIssue} disabled={saving} className="btn-primary text-sm">
            {saving ? "Issuing…" : "Issue MC"}
          </button>
        </div>
      )}

      {/* MC list */}
      {loading ? (
        <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
      ) : mcs.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">No MCs issued</p>
      ) : (
        <div className="space-y-2">
          {mcs.map((mc) => (
            <div key={mc.id} className="border border-slate-200 rounded-lg p-4 bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-400">{mc.mcRef}</span>
                    <span className="badge-blue">{mc.days} day{mc.days !== 1 ? "s" : ""}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900">
                    {fmt(mc.fromDate)}{mc.days > 1 ? ` — ${fmt(mc.toDate)}` : ""}
                  </p>
                  {mc.diagnosis && <p className="text-sm text-slate-600 mt-0.5">{mc.diagnosis}</p>}
                  {mc.remarks && <p className="text-xs text-slate-400 mt-0.5">{mc.remarks}</p>}
                </div>
                <div className="text-right text-xs text-slate-400">
                  <p>{mc.issuedBy.name}</p>
                  <p>{mc.clinic.name}</p>
                  <p className="mt-0.5">Issued {fmt(mc.issueDate)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
