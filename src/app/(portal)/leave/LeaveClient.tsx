"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Leave = {
  id: string; leaveRef: string; leaveType: string; status: string;
  fromDate: string; toDate: string; days: number; reason?: string | null;
  reviewNote?: string | null; appliedAt: string; reviewedAt?: string | null;
  staff: { id: string; name: string; role: string };
  clinic: { name: string };
  reviewedBy?: { name: string } | null;
};
type Clinic = { id: string; name: string };

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL_LEAVE: "Annual Leave", MEDICAL_LEAVE: "Medical Leave",
  EMERGENCY_LEAVE: "Emergency Leave", UNPAID_LEAVE: "Unpaid Leave",
};
const LEAVE_BADGE: Record<string, string> = {
  ANNUAL_LEAVE: "badge-blue", MEDICAL_LEAVE: "badge-amber",
  EMERGENCY_LEAVE: "badge-red", UNPAID_LEAVE: "badge-slate",
};
const STATUS_BADGE: Record<string, string> = {
  PENDING: "badge-amber", APPROVED: "badge-green",
  REJECTED: "badge-red", CANCELLED: "badge-slate",
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-MY", { dateStyle: "medium" });
}

export function LeaveClient({
  leaves, clinics, isManager, userId, month, stats,
}: {
  leaves: Leave[];
  clinics: Clinic[];
  isManager: boolean;
  userId: string;
  month: string;
  stats: { pending: number; approved: number; totalDays: number };
}) {
  const router = useRouter();
  const [showForm, setShowForm]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const [reviewId, setReviewId]     = useState<string|null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [localLeaves, setLocalLeaves] = useState<Leave[]>(leaves);

  // Apply form
  const [form, setForm] = useState({
    leaveType: "ANNUAL_LEAVE",
    fromDate: new Date().toISOString().slice(0, 10),
    toDate: new Date().toISOString().slice(0, 10),
    reason: "",
    clinicId: clinics[0]?.id ?? "",
  });

  const days = Math.max(1, Math.round(
    (new Date(form.toDate).getTime() - new Date(form.fromDate).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1);

  async function handleApply() {
    setSaving(true); setError("");
    const res = await fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    setLocalLeaves(prev => [data, ...prev]);
    setShowForm(false);
    setForm(f => ({ ...f, reason: "" }));
  }

  async function handleAction(id: string, action: "approve"|"reject"|"cancel") {
    const res = await fetch(`/api/leave/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reviewNote }),
    });
    const updated = await res.json();
    if (res.ok) {
      setLocalLeaves(prev => prev.map(l => l.id === id ? updated : l));
      setReviewId(null);
      setReviewNote("");
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">{isManager ? "Leave Management" : "My Leave"}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{month}</p>
        </div>
        <div className="flex items-center gap-2">
          <form className="flex items-center gap-2">
            <input type="month" name="month" defaultValue={month} className="form-input w-auto" />
            <button type="submit" className="btn-outline">Apply</button>
          </form>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            {showForm ? "Cancel" : "+ Apply Leave"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Pending Approval</p>
          <p className={`text-2xl font-semibold mt-1 ${stats.pending > 0 ? "text-amber-600" : "text-slate-900"}`}>
            {stats.pending}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Approved</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.approved}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Days Approved</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{stats.totalDays}</p>
        </div>
      </div>

      {/* Apply Form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Apply for Leave</h2>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">Leave Type *</label>
              <select value={form.leaveType} onChange={e => setForm(f => ({...f, leaveType: e.target.value}))} className="form-input">
                {Object.entries(LEAVE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Clinic *</label>
              <select value={form.clinicId} onChange={e => setForm(f => ({...f, clinicId: e.target.value}))} className="form-input">
                {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">From Date *</label>
              <input type="date" value={form.fromDate}
                onChange={e => setForm(f => ({...f, fromDate: e.target.value}))} className="form-input" />
            </div>
            <div>
              <label className="form-label">To Date *</label>
              <input type="date" value={form.toDate} min={form.fromDate}
                onChange={e => setForm(f => ({...f, toDate: e.target.value}))} className="form-input" />
            </div>
          </div>

          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-center">
            <span className="text-sm font-semibold text-blue-700">{days} day{days !== 1 ? "s" : ""}</span>
            <span className="text-xs text-blue-500 ml-1">leave applied</span>
          </div>

          <div className="mb-4">
            <label className="form-label">Reason</label>
            <textarea value={form.reason} onChange={e => setForm(f => ({...f, reason: e.target.value}))}
              rows={2} placeholder="Optional reason…" className="form-input resize-none" />
          </div>

          <button onClick={handleApply} disabled={saving} className="btn-primary">
            {saving ? "Submitting…" : "Submit Application"}
          </button>
        </div>
      )}

      {/* Leave List */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {[
                isManager ? "Staff" : null,
                "Ref", "Type", "From", "To", "Days", "Reason", "Clinic", "Status", "Actions"
              ].filter(Boolean).map((h) => (
                <th key={h!} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {localLeaves.length === 0 && (
              <tr>
                <td colSpan={isManager ? 10 : 9} className="px-5 py-8 text-center text-slate-400">
                  No leave records for {month}
                </td>
              </tr>
            )}
            {localLeaves.map((l) => (
              <>
                <tr key={l.id} className="table-row">
                  {isManager && (
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{l.staff.name}</p>
                      <p className="text-xs text-slate-400">{l.staff.role}</p>
                    </td>
                  )}
                  <td className="px-5 py-3 font-mono text-xs text-slate-400">{l.leaveRef}</td>
                  <td className="px-5 py-3">
                    <span className={LEAVE_BADGE[l.leaveType] ?? "badge-slate"}>
                      {LEAVE_LABELS[l.leaveType] ?? l.leaveType}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">{fmt(l.fromDate)}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{fmt(l.toDate)}</td>
                  <td className="px-5 py-3 text-center font-semibold">{Number(l.days)}</td>
                  <td className="px-5 py-3 text-slate-500 max-w-32 truncate">{l.reason ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-500">{l.clinic.name}</td>
                  <td className="px-5 py-3">
                    <span className={STATUS_BADGE[l.status] ?? "badge-slate"}>{l.status}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {/* Manager: approve / reject pending */}
                      {isManager && l.status === "PENDING" && (
                        <>
                          <button onClick={() => handleAction(l.id, "approve")}
                            className="text-xs text-green-600 hover:underline font-medium">Approve</button>
                          <button onClick={() => setReviewId(reviewId === l.id ? null : l.id)}
                            className="text-xs text-red-500 hover:underline font-medium">Reject</button>
                        </>
                      )}
                      {/* Staff: cancel own pending */}
                      {!isManager && l.staff.id === userId && l.status === "PENDING" && (
                        <button onClick={() => handleAction(l.id, "cancel")}
                          className="text-xs text-slate-500 hover:underline">Cancel</button>
                      )}
                      {/* Reviewed by */}
                      {l.reviewedBy && (
                        <span className="text-xs text-slate-400">{l.reviewedBy.name}</span>
                      )}
                    </div>
                  </td>
                </tr>
                {/* Reject note form */}
                {reviewId === l.id && (
                  <tr key={`${l.id}-review`} className="bg-red-50">
                    <td colSpan={isManager ? 10 : 9} className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <input
                          value={reviewNote}
                          onChange={e => setReviewNote(e.target.value)}
                          placeholder="Rejection reason (optional)…"
                          className="form-input flex-1 text-sm"
                        />
                        <button onClick={() => handleAction(l.id, "reject")}
                          className="btn-primary bg-red-600 hover:bg-red-700 text-sm">
                          Confirm Reject
                        </button>
                        <button onClick={() => setReviewId(null)} className="btn-outline text-sm">Cancel</button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
