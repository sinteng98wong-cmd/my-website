"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STATUS_CLASS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700", APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700", CANCELLED: "bg-slate-100 text-slate-500",
  WITHDRAWN: "bg-slate-100 text-slate-500",
};
const fmt = (d: string | Date) => new Date(d).toLocaleDateString("en-MY", { dateStyle: "medium" });
const AVAIL_LABEL: Record<string, string> = {
  OFF_DAY: "Off day", DIFFERENT_SHIFT: "Different shift", LOCUM: "Locum", OTHER_CLINIC: "Other clinic",
};

export function LeaveDetailClient({ id, isManager }: { id: string; isManager: boolean }) {
  const router = useRouter();
  const [leave, setLeave] = useState<any>(null);
  const [alert, setAlert] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [coverBusy, setCoverBusy] = useState<string | null>(null);

  async function load() {
    const l = await fetch(`/api/hr/leave/${id}`).then((r) => r.json());
    setLeave(l);
  }
  useEffect(() => { load(); }, [id]);

  // Manager: auto-run staffing check for pending leave
  useEffect(() => {
    if (!isManager || !leave || leave.status !== "PENDING") return;
    setChecking(true);
    fetch(`/api/hr/leave/${id}/check-staffing`).then((r) => r.json()).then((a) => { setAlert(a); setChecking(false); }).catch(() => setChecking(false));
  }, [isManager, leave?.status, id]);

  async function approve(confirmed: boolean) {
    setBusy(true); setError("");
    const res = await fetch(`/api/hr/leave/${id}/approve`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.requiresConfirmation) { setAlert(data.alert); return; }
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    load();
  }

  async function reject() {
    const reviewNote = prompt("Reason for rejection?");
    if (!reviewNote) return;
    setBusy(true);
    const res = await fetch(`/api/hr/leave/${id}/reject`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewNote }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error ?? "Failed"); return; }
    load();
  }

  async function requestCover(staffProfileId: string) {
    setCoverBusy(staffProfileId);
    await fetch(`/api/hr/leave/${id}/request-cover`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffProfileId }),
    });
    setCoverBusy(null);
    load();
  }

  if (!leave) return <div className="p-8 text-slate-400">Loading…</div>;
  if (leave.error) return <div className="p-8 text-red-600">{leave.error}</div>;

  const affectedCount = alert ? new Set(alert.affectedDates.map((d: any) => d.date.slice(0, 10))).size : 0;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/hr/leave" className="text-sm text-slate-500 hover:text-slate-700">← Leave Dashboard</Link>
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      {/* Details */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{leave.staffProfile?.user?.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded ${STATUS_CLASS[leave.status]}`}>{leave.status}</span>
            </div>
            <p className="text-sm text-slate-500">{leave.staffProfile?.user?.role}{leave.staffProfile?.jobTitle ? ` · ${leave.staffProfile.jobTitle}` : ""}</p>
            <p className="font-mono text-xs text-slate-400 mt-1">{leave.leaveRef}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-slate-800">{leave.leaveType}</p>
            <p className="text-slate-500">{fmt(leave.startDate)} – {fmt(leave.endDate)}</p>
            <p className="text-slate-400">{Number(leave.totalDays)} working day(s)</p>
          </div>
        </div>
        {leave.reason && <p className="mt-4 text-sm text-slate-600 bg-slate-50 rounded p-3">{leave.reason}</p>}
        {leave.attachmentUrl && <a href={leave.attachmentUrl} target="_blank" className="text-blue-600 text-sm hover:underline mt-2 inline-block">View attachment (MC)</a>}
        {leave.reviewNote && <p className="mt-2 text-xs text-slate-500">Review note: {leave.reviewNote}</p>}
      </div>

      {/* Staffing impact (manager) */}
      {isManager && leave.status === "PENDING" && (
        <div className="card p-6">
          <h2 className="font-semibold text-slate-800 mb-3">Staffing Impact</h2>
          {checking && <p className="text-sm text-slate-400">Checking staffing levels…</p>}
          {!checking && alert && !alert.hasAlert && (
            <div className="rounded-md bg-green-50 border border-green-200 text-green-700 px-4 py-3 text-sm">✓ No staffing concerns for these dates.</div>
          )}
          {!checking && alert && alert.hasAlert && (
            <div className="space-y-4">
              {alert.affectedDates.length > 0 && (
                <>
                  <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm">
                    ⚠ Staffing alert for {affectedCount} date(s).
                  </div>
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-slate-400 uppercase border-b">
                      {["Date", "Shift", "Role", "Staff", "Min", "Short", "Others on leave"].map((h) => <th key={h} className="text-left py-1">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {alert.affectedDates.map((d: any, i: number) => (
                        <tr key={i} className="border-b border-slate-50">
                          <td className="py-1.5">{fmt(d.date)}</td>
                          <td className="py-1.5 text-slate-500">{d.shift}</td>
                          <td className="py-1.5">{d.role}</td>
                          <td className="py-1.5 text-center">{d.currentCount}</td>
                          <td className="py-1.5 text-center">{d.minimumRequired}</td>
                          <td className="py-1.5 text-center text-red-600 font-medium">{d.shortfall}</td>
                          <td className="py-1.5 text-slate-500 text-xs">{d.staffOnLeave.map((s: any) => s.name).join(", ") || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {alert.notices?.length > 0 && (
                <div className="space-y-1">
                  {alert.notices.map((n: string, i: number) => (
                    <p key={i} className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">⚠ {n}</p>
                  ))}
                </div>
              )}

              {alert.coverSuggestions.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">Cover Suggestions</p>
                  <div className="space-y-2">
                    {alert.coverSuggestions.map((c: any) => (
                      <div key={c.staffProfileId} className="flex items-center justify-between bg-slate-50 rounded px-3 py-2 text-sm">
                        <div>
                          <span className="font-medium text-slate-700">{c.staffName}</span>
                          <span className="text-slate-400 text-xs ml-2">{c.role} · {AVAIL_LABEL[c.availability]}{c.clinicName ? ` (${c.clinicName})` : ""}</span>
                          <p className="text-xs text-slate-400">{c.reason}</p>
                        </div>
                        <button onClick={() => requestCover(c.staffProfileId)} disabled={coverBusy === c.staffProfileId} className="btn-outline text-xs py-1 px-2">
                          {coverBusy === c.staffProfileId ? "…" : "Request Cover"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-5 pt-4 border-t border-slate-100">
            {alert?.hasAlert ? (
              <button onClick={() => { if (confirm(`This will leave the clinic understaffed on ${affectedCount} day(s). Approve anyway?`)) approve(true); }} disabled={busy} className="px-4 py-2 rounded-md bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50">
                Approve Anyway
              </button>
            ) : (
              <button onClick={() => approve(false)} disabled={busy || checking} className="btn-primary bg-green-600 hover:bg-green-700">Approve</button>
            )}
            <button onClick={reject} disabled={busy} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">Reject</button>
          </div>
        </div>
      )}

      {/* Cover requests status */}
      {leave.coverRequests?.length > 0 && (
        <div className="card p-6">
          <h2 className="font-semibold text-slate-800 mb-3">Cover Requests</h2>
          <div className="space-y-2 text-sm">
            {leave.coverRequests.map((c: any) => (
              <div key={c.id} className="flex justify-between bg-slate-50 rounded px-3 py-2">
                <span>{c.requestedStaff?.user?.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${c.status === "ACCEPTED" ? "bg-green-100 text-green-700" : c.status === "DECLINED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
