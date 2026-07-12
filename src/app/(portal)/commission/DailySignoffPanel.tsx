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
  section:       "oneoff" | "progressive" | "scan";
  stagesDone:    string[];        // plan stages completed that day
  weightagePct:  number;          // Σ scheme % of those stages (one-off: 100)
  paidToday:     number;          // patient payments that day (visit + plan installments)
  billed:        number;
  labFee:        number;
  labFeeConfirmed: boolean | null; // null = no payout line yet
  net:           number;          // billed − lab fee
  gained:        number;          // one-off: net · progressive: net × weightage% · scan: billed (flat)
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
  doctorRate:       number; // % applied on (one-off + progressive) total
  rows:             DayRow[];
  signedAt:         string | null; // ISO
}

// ─── Shared cells ─────────────────────────────────────────────────────────────

function PatientCell({ r }: { r: DayRow }) {
  return (
    <td className="px-4 py-2.5">
      <p className="font-medium text-slate-900 text-sm">{r.patientName}</p>
      <p className="text-xs text-slate-400 font-mono">{r.patientRef}</p>
    </td>
  );
}

function TreatmentCell({ r }: { r: DayRow }) {
  return (
    <td className="px-4 py-2.5">
      <p className="text-slate-700 text-sm">{r.treatmentName}</p>
      <span className="flex items-center gap-1.5 flex-wrap mt-0.5">
        {r.subType && <span className="badge-slate text-[10px]">{r.subType}</span>}
        {r.lineStatus ? (
          <>
            <span className={`${STATUS_BADGE[r.lineStatus] ?? "badge-slate"} text-[10px]`}>{STATUS_LABEL[r.lineStatus] ?? r.lineStatus}</span>
            {r.doctorVerified && <CheckCircle2 size={11} className="text-green-500" />}
          </>
        ) : (
          <span className="text-[10px] text-slate-300">no payout line</span>
        )}
      </span>
    </td>
  );
}

function PaidCell({ r }: { r: DayRow }) {
  return (
    <td className="px-4 py-2.5 tabular-nums text-sm">
      {r.paidToday > 0
        ? <span className="text-green-700">{RM(r.paidToday)}</span>
        : <span className="text-slate-300">—</span>}
    </td>
  );
}

function LabFeeCell({ r }: { r: DayRow }) {
  if (r.labFee <= 0) return <td className="px-4 py-2.5 text-slate-300 text-sm">—</td>;
  return (
    <td className="px-4 py-2.5 tabular-nums text-sm">
      {RM(r.labFee)}
      {r.labFeeConfirmed
        ? <p className="text-[10px] text-green-600 font-medium">✓ Confirmed</p>
        : <p className="text-[10px] text-amber-600">(est.)</p>}
    </td>
  );
}

const TH = ({ children }: { children: React.ReactNode }) => (
  <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{children}</th>
);

function SectionTitle({ n, label, hint }: { n: string; label: string; hint: string }) {
  return (
    <div className="px-4 pt-4 pb-1.5 flex items-baseline gap-2">
      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">{n} {label}</p>
      <p className="text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

/**
 * Daily commission slip, embedded in the Doctor Payout tab.
 * ① One-Off (net, full weightage) + ② Progressive (stage weightage gained
 * that day) — their total × the doctor's % — plus ③ Scans at flat rate.
 * Signing verifies the whole day (step ② on every payout line).
 */
export function DailySignoffPanel({
  day, month, view, isDoctor, canPickDoctor, doctors, selectedDoctorId, doctorName, doctorRate, rows, signedAt,
}: Props) {
  const router = useRouter();
  const [open,  setOpen]  = useState(true);
  const [busy,  setBusy]  = useState(false);
  const [msg,   setMsg]   = useState("");
  const [err,   setErr]   = useState("");
  const [confirm, setConfirm] = useState(false);

  const oneOff      = rows.filter(r => r.section === "oneoff");
  const progressive = rows.filter(r => r.section === "progressive");
  const scans       = rows.filter(r => r.section === "scan");

  const sub1 = oneOff.reduce((s, r) => s + r.gained, 0);
  const sub2 = progressive.reduce((s, r) => s + r.gained, 0);
  const sub3 = scans.reduce((s, r) => s + r.gained, 0);
  const professionalFee = Math.round((sub1 + sub2) * doctorRate) / 100;
  const entitledDay     = Math.round((professionalFee + sub3) * 100) / 100;

  const totalBilled    = rows.reduce((s, r) => s + r.billed, 0);
  const totalCollected = rows.reduce((s, r) => s + r.paidToday, 0);

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
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Entitled (Day)</p>
              <p className="text-sm font-semibold text-blue-700 tabular-nums">{RM(entitledDay)}</p>
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
            <>
              {/* ── ① One-Off ─────────────────────────────────────────── */}
              {oneOff.length > 0 && (
                <>
                  <SectionTitle n="①" label="One-Off" hint="full value counts toward the doctor's share" />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="table-header">
                        <tr><TH>Patient</TH><TH>Treatment</TH><TH>Paid Today</TH><TH>Billed</TH><TH>Lab Fee</TH><TH>Net</TH></tr>
                      </thead>
                      <tbody>
                        {oneOff.map(r => (
                          <tr key={r.id} className="table-row">
                            <PatientCell r={r} />
                            <TreatmentCell r={r} />
                            <PaidCell r={r} />
                            <td className="px-4 py-2.5 tabular-nums text-sm">{RM(r.billed)}</td>
                            <LabFeeCell r={r} />
                            <td className="px-4 py-2.5 tabular-nums text-sm font-medium">{RM(r.net)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 border-t border-slate-200">
                          <td colSpan={5} className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase text-right">Subtotal ①</td>
                          <td className="px-4 py-2 tabular-nums text-sm font-semibold text-slate-800">{RM(sub1)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* ── ② Progressive ─────────────────────────────────────── */}
              {progressive.length > 0 && (
                <>
                  <SectionTitle n="②" label="Progressive" hint="staged cases earn by the weightage of stages done today" />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="table-header">
                        <tr><TH>Patient</TH><TH>Treatment</TH><TH>Stage Done</TH><TH>Paid Today</TH><TH>Billed</TH><TH>Lab Fee</TH><TH>Net</TH><TH>Weightage</TH><TH>Gained</TH></tr>
                      </thead>
                      <tbody>
                        {progressive.map(r => (
                          <tr key={r.id} className="table-row">
                            <PatientCell r={r} />
                            <TreatmentCell r={r} />
                            <td className="px-4 py-2.5 text-sm">
                              {r.stagesDone.length > 0
                                ? r.stagesDone.map(s => <p key={s} className="text-slate-700">{s}</p>)
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <PaidCell r={r} />
                            <td className="px-4 py-2.5 tabular-nums text-sm">{RM(r.billed)}</td>
                            <LabFeeCell r={r} />
                            <td className="px-4 py-2.5 tabular-nums text-sm">{RM(r.net)}</td>
                            <td className="px-4 py-2.5 tabular-nums text-sm font-medium text-blue-700">{r.weightagePct > 0 ? `${r.weightagePct}%` : "—"}</td>
                            <td className="px-4 py-2.5 tabular-nums text-sm font-medium">{RM(r.gained)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 border-t border-slate-200">
                          <td colSpan={8} className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase text-right">Subtotal ②</td>
                          <td className="px-4 py-2 tabular-nums text-sm font-semibold text-slate-800">{RM(sub2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* ── ③ Scans (flat) ────────────────────────────────────── */}
              {scans.length > 0 && (
                <>
                  <SectionTitle n="③" label="Scans" hint="flat rate — full value, no doctor percentage" />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="table-header">
                        <tr><TH>Patient</TH><TH>Treatment</TH><TH>Paid Today</TH><TH>Billed</TH><TH>Flat Commission</TH></tr>
                      </thead>
                      <tbody>
                        {scans.map(r => (
                          <tr key={r.id} className="table-row">
                            <PatientCell r={r} />
                            <TreatmentCell r={r} />
                            <PaidCell r={r} />
                            <td className="px-4 py-2.5 tabular-nums text-sm">{RM(r.billed)}</td>
                            <td className="px-4 py-2.5 tabular-nums text-sm font-medium">{RM(r.gained)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 border-t border-slate-200">
                          <td colSpan={4} className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase text-right">Subtotal ③</td>
                          <td className="px-4 py-2 tabular-nums text-sm font-semibold text-slate-800">{RM(sub3)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* ── Totals: (① + ②) × doctor % + ③ flat ───────────────── */}
              <div className="mx-4 my-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div className="space-y-1.5 text-sm max-w-md ml-auto">
                  <div className="flex justify-between text-slate-600">
                    <span>① One-Off + ② Progressive</span>
                    <span className="tabular-nums">{RM(sub1 + sub2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>× Doctor&apos;s share ({doctorRate}%)</span>
                    <span className="tabular-nums">{RM(professionalFee)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>+ ③ Scans (flat)</span>
                    <span className="tabular-nums">{RM(sub3)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-300 font-bold text-slate-900">
                    <span>Entitled Commission (day)</span>
                    <span className="tabular-nums text-blue-700">{RM(entitledDay)}</span>
                  </div>
                  {totalBilled - totalCollected > 0.005 && (
                    <p className="text-[11px] text-amber-600 text-right">
                      {RM(totalBilled - totalCollected)} billed today is not collected yet
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Sign action */}
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-slate-100">
            {isDoctor && rows.length > 0 && (
              <button
                onClick={() => setConfirm(true)}
                disabled={busy}
                className={`text-sm ${signedAt ? "btn-secondary" : "btn-primary bg-green-600 hover:bg-green-700 focus:ring-green-500"}`}
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
              You are confirming {rows.length} treatment{rows.length === 1 ? "" : "s"} — {RM(totalBilled)} billed,{" "}
              {RM(totalCollected)} collected, {RM(entitledDay)} entitled commission for the day.
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
