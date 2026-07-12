"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

const STATUS_BADGE: Record<string, string> = {
  ENTITLED:                 "badge-slate",
  LOCKED_PENDING_COMPLETION:"badge-amber",
  PENDING_RELEASE:          "badge-blue",
  PAID:                     "badge-green",
  VOIDED:                   "badge-red",
};
const STATUS_LABEL: Record<string, string> = {
  ENTITLED:                 "Entitled",
  LOCKED_PENDING_COMPLETION:"Locked",
  PENDING_RELEASE:          "Pending Release",
  PAID:                     "Paid",
  VOIDED:                   "Voided",
};

export type DayRow = {
  id: string;
  patientName:   string;
  patientRef:    string;
  treatmentName: string;
  subType:       string | null;
  billed:        number;
  collected:     number;  // patient paid
  labFee:        number;
  entitled:      number | null;  // from the payout line, if created
  lineStatus:    string | null;
  doctorVerified: boolean;
};

interface Props {
  day:              string; // YYYY-MM-DD
  month:            string;
  view:             string;
  isDoctor:         boolean;
  canPickDoctor:    boolean;
  doctors:          { id: string; name: string }[];
  selectedDoctorId: string;
  doctorName:       string | null;
  rows:             DayRow[];
  signedAt:         string | null; // ISO
}

/**
 * Daily sign-off, embedded in the Doctor Payout tab. The doctor picks a day,
 * reviews the treatments they made (billed vs patient paid vs entitlement),
 * and verifies the whole day with one signature — which also completes
 * step ② (doctor verify) on every payout line of that day.
 */
export function DailySignoffPanel({
  day, month, view, isDoctor, canPickDoctor, doctors, selectedDoctorId, doctorName, rows, signedAt,
}: Props) {
  const router = useRouter();
  const [open,  setOpen]  = useState(true);
  const [busy,  setBusy]  = useState(false);
  const [msg,   setMsg]   = useState("");
  const [err,   setErr]   = useState("");
  const [confirm, setConfirm] = useState(false);

  const totalBilled    = rows.reduce((s, r) => s + r.billed, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const totalEntitled  = rows.reduce((s, r) => s + (r.entitled ?? 0), 0);
  const outstanding    = Math.round((totalBilled - totalCollected) * 100) / 100;
  const allVerified    = rows.length > 0 && rows.every(r => r.doctorVerified || r.lineStatus === null);

  async function sign() {
    setConfirm(false); setBusy(true); setErr(""); setMsg("");
    const res = await fetch("/api/commission/daily-signoff", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ date: day }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(d.error ?? "Failed to sign off"); return; }
    const parts = ["Day signed"];
    if (d.verified > 0)               parts.push(`${d.verified} payout line${d.verified === 1 ? "" : "s"} verified`);
    if (d.skippedAwaitingCounter > 0) parts.push(`${d.skippedAwaitingCounter} awaiting counter cash verification`);
    setMsg(parts.join(" — "));
    router.refresh();
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer select-none hover:bg-slate-50/60 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="icon-box-sm bg-green-100 text-green-600 flex-shrink-0">
            <ClipboardCheck size={15} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm">
              Daily Sign-off{!isDoctor && doctorName ? ` — ${doctorName}` : ""}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {rows.length} treatment{rows.length === 1 ? "" : "s"} on {day}
              {signedAt
                ? <span className="text-green-600 font-medium"> · Signed ✓ {new Date(signedAt).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" })}</span>
                : <span className="text-amber-600 font-medium"> · Not signed</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-3 text-right">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Billed</p>
              <p className="text-sm font-semibold text-slate-800 tabular-nums">{RM(totalBilled)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Patient Paid</p>
              <p className="text-sm font-semibold text-green-700 tabular-nums">{RM(totalCollected)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Entitled</p>
              <p className="text-sm font-semibold text-blue-700 tabular-nums">{RM(totalEntitled)}</p>
            </div>
          </div>
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100">
          {/* Day / doctor selectors */}
          <form className="flex flex-wrap items-center gap-2 px-5 py-3 bg-slate-50/60">
            <input type="hidden" name="tab"   value="locum" />
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="view"  value={view} />
            <label className="text-xs font-medium text-slate-600">Day</label>
            <input type="date" name="day" defaultValue={day} className="form-input w-auto text-sm py-1.5" />
            {canPickDoctor && (
              <>
                <label className="text-xs font-medium text-slate-600 ml-2">Doctor</label>
                <select name="signoffDoctor" defaultValue={selectedDoctorId} className="form-input w-auto text-sm py-1.5">
                  {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </>
            )}
            <button type="submit" className="btn-secondary text-xs">View</button>
          </form>

          {rows.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-400">No treatments on {day}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    {["Patient", "Treatment", "Billed", "Patient Paid", "Lab Fee", "Entitled", "Payout Status"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="table-row">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900 text-sm">{r.patientName}</p>
                        <p className="text-xs text-slate-400 font-mono">{r.patientRef}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-slate-700">{r.treatmentName}</p>
                        {r.subType && <span className="badge-slate text-[10px]">{r.subType}</span>}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{RM(r.billed)}</td>
                      <td className="px-4 py-2.5 tabular-nums">
                        <span className={r.collected >= r.billed ? "text-green-700" : "text-amber-600"}>{RM(r.collected)}</span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-500">{r.labFee > 0 ? RM(r.labFee) : "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.entitled !== null ? RM(r.entitled) : "—"}</td>
                      <td className="px-4 py-2.5">
                        {r.lineStatus ? (
                          <span className="flex items-center gap-1.5">
                            <span className={`${STATUS_BADGE[r.lineStatus] ?? "badge-slate"} text-[10px]`}>{STATUS_LABEL[r.lineStatus] ?? r.lineStatus}</span>
                            {r.doctorVerified && <CheckCircle2 size={12} className="text-green-500" />}
                          </span>
                        ) : <span className="text-xs text-slate-300">no payout line</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Day Totals</td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold text-slate-800">{RM(totalBilled)}</td>
                    <td className="px-4 py-2.5 tabular-nums font-bold text-green-700">
                      {RM(totalCollected)}
                      {outstanding > 0 && <p className="text-[10px] font-normal text-amber-600">{RM(outstanding)} outstanding</p>}
                    </td>
                    <td />
                    <td className="px-4 py-2.5 tabular-nums font-semibold text-blue-700">{RM(totalEntitled)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Sign action */}
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-slate-100">
            {isDoctor && rows.length > 0 && (
              <button
                onClick={() => setConfirm(true)}
                disabled={busy}
                className={`text-sm ${signedAt && allVerified ? "btn-secondary" : "btn-primary bg-green-600 hover:bg-green-700 focus:ring-green-500"}`}
              >
                {busy ? "Signing…" : signedAt ? "Re-sign Day" : "Sign & Verify Day"}
              </button>
            )}
            {!isDoctor && (
              <p className="text-xs text-slate-400">Only the doctor can sign their day; managers view only.</p>
            )}
            {msg && <span className="text-xs text-green-600">{msg}</span>}
            {err && <span className="text-xs text-red-600">{err}</span>}
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-semibold text-slate-900">Confirm sign-off for {day}?</h3>
            <p className="text-sm text-slate-500">
              You are confirming {rows.length} treatment{rows.length === 1 ? "" : "s"} —{" "}
              {RM(totalBilled)} billed, {RM(totalCollected)} collected from patients.
            </p>
            <p className="text-xs text-slate-400">
              Signing also completes your payment verification (step ②) on this day&apos;s payout lines.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setConfirm(false)} disabled={busy} className="btn-secondary text-sm">Cancel</button>
              <button onClick={sign} disabled={busy}
                className="btn-primary bg-green-600 hover:bg-green-700 text-sm focus:ring-green-500">
                {busy ? "Signing…" : "Confirm & Sign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
