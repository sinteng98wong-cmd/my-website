"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, Circle, AlertCircle, ChevronDown, ChevronUp,
  FlaskConical, Stethoscope, Zap, TrendingUp, Lock, BadgeCheck,
} from "lucide-react";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

// ─── Types ────────────────────────────────────────────────────────────────────

export type LocumLine = {
  id: string;
  category: string;
  status: string;
  /** Workflow bucket for the status-grouped view (computed server-side) */
  bucket: string;
  billedAmount: number;
  labFee: number;
  labFeeConfirmed: boolean;
  sst: number;
  doctorSplit: number;
  netPool: number;
  entitledAmount: number;
  releasedAmount: number;
  counterVerifiedAt: string | null;
  doctorVerifiedAt:  string | null;
  labFeeLoggedAt:    string | null;
  completionMarkedAt: string | null;
  pendingReleaseAt:  string | null;
  paidAt:            string | null;
  forceReleasedAt:   string | null;
  subType:           string | null;
  toothCodes:        string | null;
  notes:             string | null;
  treatment: {
    treatmentType: { name: string; code: string };
    visit: { patient: { name: string; patientRef: string } };
    labJobId: string | null;
  };
  treatmentPlan: {
    planRef: string; title: string; status: string;
    totalAmount: number; totalPaid: number;
  } | null;
};

export type LocumDoctorGroup = {
  doctorProfileId: string;
  doctorName:      string;
  dayRate:         number;
  sessionsWorked:  number;
  basicPayFloor:   number;
  totalBilled:     number;
  totalNetPool:    number;
  totalEntitled:   number;
  totalReleased:   number;
  lines:           LocumLine[];
};

interface Props {
  groups:      LocumDoctorGroup[];
  month:       string;
  role:        string;
  /** "status" groups by workflow bucket; "doctor" groups by doctor */
  view?:       "status" | "doctor";
  ownDoctorId: string | null; // DoctorProfile.id of the signed-in doctor, or null
  /** Existing monthly statements keyed by DoctorProfile.id */
  stmtByDoctor?: Record<string, { id: string; status: string }>;
}

// ─── Workflow buckets (status view) ──────────────────────────────────────────

const BUCKETS: { key: string; label: string; hint: string; badge: string }[] = [
  { key: "pending_verification", label: "Pending Verification",    hint: "Counter / doctor verification not done yet",             badge: "badge-slate"  },
  { key: "pending_lab",          label: "Pending Lab Invoice",     hint: "Waiting for the physical lab invoice to be logged",      badge: "badge-amber"  },
  { key: "pending_completion",   label: "Pending Completion",      hint: "Case stages not finished — funds stay locked",           badge: "badge-amber"  },
  { key: "pending_payment",      label: "Pending Patient Payment", hint: "Patient hasn't reached the payment threshold",           badge: "badge-purple" },
  { key: "ready_to_release",     label: "Ready to Release",        hint: "Conditions met — run Check Release",                     badge: "badge-blue"   },
  { key: "ready_to_pay",         label: "Ready to Pay",            hint: "Released — finance can mark as paid",                    badge: "badge-blue"   },
  { key: "paid",                 label: "Paid",                    hint: "Payout completed",                                       badge: "badge-green"  },
  { key: "voided",               label: "Voided",                  hint: "Cancelled lines",                                        badge: "badge-red"    },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  ONE_OFF:          "One-Off",
  MULTI_STAGE:      "Multi-Stage",
  ORTHO_BONDING:    "Ortho Bonding",
  ORTHO_DEBONDING:  "Ortho Debond",
  ALIGNER:          "Aligner",
};
const CATEGORY_BADGE: Record<string, string> = {
  ONE_OFF:         "badge-green",
  MULTI_STAGE:     "badge-blue",
  ORTHO_BONDING:   "badge-purple",
  ORTHO_DEBONDING: "badge-purple",
  ALIGNER:         "badge-cyan",
};
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

// ─── Step progress dots ───────────────────────────────────────────────────────

function StepDots({ line }: { line: LocumLine }) {
  const needsLab = !!line.treatment.labJobId;
  const steps = [
    { label: "Counter", done: !!line.counterVerifiedAt },
    { label: "Doctor",  done: !!line.doctorVerifiedAt },
    { label: "Lab",     done: !needsLab || !!line.labFeeLoggedAt, skip: !needsLab },
    { label: "Done",    done: !!line.completionMarkedAt },
    { label: "Release", done: !!line.pendingReleaseAt },
    { label: "Paid",    done: !!line.paidAt },
  ];
  return (
    <div className="flex items-center gap-0.5">
      {steps.map((s, i) => (
        <div key={i} title={s.label} className="flex flex-col items-center gap-0.5">
          {s.done ? (
            <CheckCircle2 size={13} className="text-green-500" />
          ) : s.skip ? (
            <span className="w-3 h-3 rounded-full bg-slate-100 flex items-center justify-center">
              <span className="w-1 h-1 rounded-full bg-slate-300" />
            </span>
          ) : (
            <Circle size={13} className="text-slate-300" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Next-action button ───────────────────────────────────────────────────────

function nextAction(line: LocumLine, role: string, ownDoctorId: string | null) {
  if (line.status === "PAID" || line.status === "VOIDED") return null;

  const isOwnLine = ownDoctorId !== null; // for doctor role, page already filters to own lines
  const canCounter  = ["SUPER_ADMIN", "CLINIC_MANAGER", "FINANCE", "RECEPTIONIST", "NURSE"].includes(role);
  const canDoctor   = role === "DOCTOR" || ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);
  const canManager  = ["SUPER_ADMIN", "CLINIC_MANAGER", "FINANCE"].includes(role);
  const canFinance  = ["SUPER_ADMIN", "FINANCE"].includes(role);

  if (!line.counterVerifiedAt  && canCounter)  return { action: "counter_verify",  label: "Verify Cash",       style: "btn-outline" };
  if (!line.doctorVerifiedAt   && canDoctor)   return { action: "doctor_verify",   label: "Verify Payment",    style: "btn-outline" };
  if (line.treatment.labJobId && !line.labFeeConfirmed && canCounter)
                                               return { action: "log_lab_fee",     label: "Log Lab Fee",       style: "btn-outline text-amber-700 border-amber-300" };
  if (!line.completionMarkedAt && canDoctor)   return { action: "mark_complete",   label: "Mark Complete",     style: "btn-outline" };
  if (!line.pendingReleaseAt   && canManager)  return { action: "check_release",   label: "Check Release",     style: "btn-outline text-blue-700 border-blue-300" };
  if (line.status === "PENDING_RELEASE" && canFinance)
                                               return { action: "mark_paid",       label: "Mark Paid",         style: "btn-primary bg-green-600 hover:bg-green-700 focus:ring-green-500" };
  return null;
}

// ─── Force-release modal ──────────────────────────────────────────────────────

function ForceReleaseModal({
  lineId, onDone, onCancel,
}: { lineId: string; onDone: () => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState("");

  async function submit() {
    if (!reason.trim()) { setError("A reason is required"); return; }
    setBusy(true);
    const res = await fetch(`/api/locum-payout/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "force_release", reason }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed");
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertCircle size={20} className="text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Force-Release Override</h3>
            <p className="text-sm text-slate-500 mt-1">
              This bypasses the normal multi-stage completion requirement. A written reason is mandatory for audit purposes.
            </p>
          </div>
        </div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Reason for early release…"
          className="form-input h-24 resize-none"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onCancel} disabled={busy} className="btn-secondary text-sm">Cancel</button>
          <button onClick={submit} disabled={busy || !reason.trim()}
            className="btn-primary bg-amber-600 hover:bg-amber-700 text-sm focus:ring-amber-500">
            {busy ? "Releasing…" : "Force Release"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lab fee prompt ───────────────────────────────────────────────────────────

function LabFeeModal({
  lineId, estimatedFee, onDone, onCancel,
}: { lineId: string; estimatedFee: number; onDone: () => void; onCancel: () => void }) {
  const [fee,   setFee]   = useState(estimatedFee > 0 ? String(estimatedFee) : "");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const labFee = parseFloat(fee);
    if (!isFinite(labFee) || labFee < 0) { setError("Enter a valid amount (0 or above)"); return; }
    setBusy(true);
    const res = await fetch(`/api/locum-payout/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "log_lab_fee", labFee }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed"); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <FlaskConical size={20} className="text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Log Lab Invoice Amount</h3>
            <p className="text-sm text-slate-500 mt-1">Enter the exact amount from the physical lab invoice. This updates the net commission calculation.</p>
          </div>
        </div>
        <div>
          <label className="form-label">Confirmed Lab Fee (MYR)</label>
          <input
            type="number" min="0" step="0.01"
            value={fee} onChange={e => setFee(e.target.value)}
            className="form-input" placeholder="0.00"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onCancel} disabled={busy} className="btn-secondary text-sm">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="btn-primary text-sm">
            {busy ? "Saving…" : "Confirm Lab Fee"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-type / tooth details modal ──────────────────────────────────────────

function DetailsModal({
  line, onDone, onCancel,
}: { line: LocumLine; onDone: () => void; onCancel: () => void }) {
  const [subType, setSubType]       = useState(line.subType ?? "");
  const [toothCodes, setToothCodes] = useState(line.toothCodes ?? "");
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState("");

  async function submit() {
    setBusy(true); setError("");
    const res = await fetch(`/api/locum-payout/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_details", subType, toothCodes }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed"); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900">Treatment Details</h3>
          <p className="text-sm text-slate-500 mt-1">{line.treatment.treatmentType.name} — {line.treatment.visit.patient.name}</p>
        </div>
        <div>
          <label className="form-label">Sub-type / material</label>
          <input value={subType} onChange={e => setSubType(e.target.value)}
            className="form-input" placeholder="e.g. PFM, Zirconia, Valplast" list={`subtypes-${line.id}`} />
        </div>
        <div>
          <label className="form-label">Tooth number(s)</label>
          <input value={toothCodes} onChange={e => setToothCodes(e.target.value)}
            className="form-input" placeholder="e.g. 16 or 11,12" />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onCancel} disabled={busy} className="btn-secondary text-sm">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-primary text-sm">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Single line row ──────────────────────────────────────────────────────────

function LineRow({
  line, role, ownDoctorId, onRefresh, doctorName,
}: { line: LocumLine; role: string; ownDoctorId: string | null; onRefresh: () => void; doctorName?: string }) {
  const [busy,        setBusy]        = useState(false);
  const [errMsg,      setErrMsg]      = useState("");
  const [showForce,   setShowForce]   = useState(false);
  const [showLabFee,  setShowLabFee]  = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const canEditDetails = ["SUPER_ADMIN", "CLINIC_MANAGER", "FINANCE", "RECEPTIONIST", "NURSE"].includes(role);

  const next = nextAction(line, role, ownDoctorId);
  const canForce = ["SUPER_ADMIN", "CLINIC_MANAGER", "FINANCE"].includes(role)
    && (line.status === "LOCKED_PENDING_COMPLETION" || line.status === "ENTITLED")
    && !!line.counterVerifiedAt && !!line.doctorVerifiedAt
    && (!line.treatment.labJobId || line.labFeeConfirmed);

  async function doAction(action: string) {
    if (action === "log_lab_fee") { setShowLabFee(true); return; }
    setBusy(true); setErrMsg("");
    const res = await fetch(`/api/locum-payout/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      setErrMsg(d.error ?? "Action failed");
      return;
    }
    onRefresh();
  }

  return (
    <>
      <tr className="table-row">
        {/* Doctor (status view only) */}
        {doctorName !== undefined && (
          <td className="px-4 py-3">
            <p className="text-sm text-slate-700 whitespace-nowrap">{doctorName}</p>
          </td>
        )}

        {/* Patient */}
        <td className="px-4 py-3">
          <p className="font-medium text-slate-900 text-sm">{line.treatment.visit.patient.name}</p>
          <p className="text-xs text-slate-400 font-mono">{line.treatment.visit.patient.patientRef}</p>
        </td>

        {/* Treatment */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <p className="text-sm text-slate-700">{line.treatment.treatmentType.name}</p>
            {canEditDetails && (
              <button onClick={() => setShowDetails(true)} title="Edit sub-type / tooth"
                className="text-slate-300 hover:text-blue-500 transition-colors text-xs leading-none">✎</button>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {line.subType && <span className="badge-slate text-[10px]">{line.subType}</span>}
            {line.toothCodes && <span className="text-[10px] text-slate-500 font-mono">🦷 {line.toothCodes}</span>}
            {line.treatmentPlan && <span className="text-xs text-slate-400">{line.treatmentPlan.planRef}</span>}
          </div>
        </td>

        {/* Category */}
        <td className="px-4 py-3">
          <span className={`${CATEGORY_BADGE[line.category] ?? "badge-slate"} text-[10px]`}>
            {CATEGORY_LABEL[line.category] ?? line.category}
          </span>
          {line.forceReleasedAt && (
            <span className="badge-amber text-[10px] ml-1">Force-released</span>
          )}
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <span className={`${STATUS_BADGE[line.status] ?? "badge-slate"} text-[10px]`}>
            {STATUS_LABEL[line.status] ?? line.status}
          </span>
        </td>

        {/* Step progress */}
        <td className="px-4 py-3">
          <StepDots line={line} />
        </td>

        {/* Net Pool — billed − lab − SST */}
        <td className="px-4 py-3 tabular-nums text-sm text-slate-700 text-right">
          {RM(line.netPool)}
          <p className="text-[10px] text-slate-400 whitespace-nowrap">
            {RM(line.billedAmount)}
            {line.labFee > 0 && <> − lab {RM(line.labFee)}{!line.labFeeConfirmed ? " (est.)" : ""}</>}
            {line.sst > 0 && <> − SST {RM(line.sst)}</>}
          </p>
        </td>

        {/* Entitled — netPool × split% */}
        <td className="px-4 py-3 tabular-nums text-sm text-slate-700 text-right">
          {RM(line.entitledAmount)}
          <p className="text-[10px] text-slate-400">× {line.doctorSplit}%</p>
        </td>

        {/* Released — with % of case entitlement */}
        <td className="px-4 py-3 tabular-nums text-sm text-right">
          {line.releasedAmount > 0 ? (
            <>
              <span className="font-semibold text-green-700">{RM(line.releasedAmount)}</span>
              {line.entitledAmount > 0 && line.releasedAmount < line.entitledAmount && (
                <p className="text-[10px] text-slate-400">
                  {Math.round((line.releasedAmount / line.entitledAmount) * 100)}% of case
                </p>
              )}
            </>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {next && (
              <button
                onClick={() => doAction(next.action)}
                disabled={busy}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors disabled:opacity-40 ${next.style}`}
              >
                {busy ? "…" : next.label}
              </button>
            )}
            {canForce && (
              <button
                onClick={() => setShowForce(true)}
                className="text-xs px-2 py-1 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 font-medium transition-colors"
              >
                Force
              </button>
            )}
            {errMsg && <p className="text-xs text-red-600 mt-1 w-full">{errMsg}</p>}
          </div>
        </td>
      </tr>

      {showForce && (
        <ForceReleaseModal
          lineId={line.id}
          onDone={() => { setShowForce(false); onRefresh(); }}
          onCancel={() => setShowForce(false)}
        />
      )}
      {showLabFee && (
        <LabFeeModal
          lineId={line.id}
          estimatedFee={line.labFee}
          onDone={() => { setShowLabFee(false); onRefresh(); }}
          onCancel={() => setShowLabFee(false)}
        />
      )}
      {showDetails && (
        <DetailsModal
          line={line}
          onDone={() => { setShowDetails(false); onRefresh(); }}
          onCancel={() => setShowDetails(false)}
        />
      )}
    </>
  );
}

// ─── Doctor group card ────────────────────────────────────────────────────────

function DoctorGroupCard({
  group, month, role, ownDoctorId, onRefresh, stmt,
}: {
  group: LocumDoctorGroup; month: string; role: string; ownDoctorId: string | null; onRefresh: () => void;
  stmt?: { id: string; status: string };
}) {
  const [open, setOpen] = useState(true);
  const [stmtBusy, setStmtBusy] = useState(false);
  const [stmtErr,  setStmtErr]  = useState("");
  const router = useRouter();
  const canManage = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);

  async function generateStatement(e: React.MouseEvent) {
    e.stopPropagation();
    setStmtBusy(true); setStmtErr("");
    const res = await fetch("/api/commission/locum-statement", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctorId: group.doctorProfileId, month }),
    });
    setStmtBusy(false);
    const d = await res.json();
    if (!res.ok) { setStmtErr(d.error ?? "Failed"); return; }
    router.push(`/commission/${d.statementId}`);
  }

  const commissionWins = group.totalReleased >= group.basicPayFloor;
  const paidCount      = group.lines.filter(l => l.status === "PAID").length;
  const pendingCount   = group.lines.filter(l => l.status === "PENDING_RELEASE").length;
  const lockedCount    = group.lines.filter(l => l.status === "LOCKED_PENDING_COMPLETION").length;

  return (
    <div className="card overflow-hidden">
      {/* Doctor header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer select-none hover:bg-slate-50/60 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="icon-box-sm bg-indigo-100 text-indigo-600 flex-shrink-0">
            <Stethoscope size={15} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm">{group.doctorName}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {group.sessionsWorked > 0 && (
                <span className="text-xs text-slate-400">{group.sessionsWorked} sessions · {RM(group.basicPayFloor)} floor</span>
              )}
              {lockedCount > 0 && <span className="badge-amber text-[10px]">{lockedCount} locked</span>}
              {pendingCount > 0 && <span className="badge-blue text-[10px]">{pendingCount} pending release</span>}
              {paidCount > 0    && <span className="badge-green text-[10px]">{paidCount} paid</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Floor vs earned comparison */}
          <div className="hidden sm:flex items-center gap-3 text-right">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Net Pool</p>
              <p className="text-sm font-semibold text-slate-600 tabular-nums">{RM(group.totalNetPool)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Entitled</p>
              <p className="text-sm font-semibold text-slate-800 tabular-nums">{RM(group.totalEntitled)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Released</p>
              <p className="text-sm font-semibold text-green-700 tabular-nums">{RM(group.totalReleased)}</p>
            </div>
            {group.basicPayFloor > 0 && (
              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
                commissionWins ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
              }`}>
                {commissionWins
                  ? <><TrendingUp size={12} /> Commission wins</>
                  : <><Lock size={12} /> Floor applies</>}
              </div>
            )}
            {canManage && (
              stmt ? (
                <button
                  onClick={e => { e.stopPropagation(); router.push(`/commission/${stmt.id}`); }}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors whitespace-nowrap"
                >
                  View Statement{stmt.status === "LOCKED" ? " 🔒" : ""}
                </button>
              ) : (
                <button
                  onClick={generateStatement}
                  disabled={stmtBusy}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 font-medium transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  {stmtBusy ? "Generating…" : "Generate Statement"}
                </button>
              )
            )}
            {stmtErr && <span className="text-xs text-red-600">{stmtErr}</span>}
          </div>
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>

      {/* Lines table */}
      {open && (
        <div className="overflow-x-auto border-t border-slate-100">
          {group.lines.length === 0 ? (
            <div className="px-5 py-8 text-center text-slate-400 text-sm">No payout lines for this doctor this month</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  {["Patient", "Treatment", "Category", "Status", "Steps ①②③④⑤⑥", "Net Pool", "Entitled", "Released", "Action"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.lines.map(line => (
                  <LineRow
                    key={line.id}
                    line={line}
                    role={role}
                    ownDoctorId={ownDoctorId}
                    onRefresh={onRefresh}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Totals</td>
                  <td className="px-4 py-2.5 tabular-nums text-sm font-semibold text-slate-700 text-right">{RM(group.totalNetPool)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-sm font-semibold text-slate-800 text-right">{RM(group.totalEntitled)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-sm font-bold text-green-700 text-right">{RM(group.totalReleased)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Status group card (status view) ─────────────────────────────────────────

function StatusGroupCard({
  bucket, lines, role, ownDoctorId, onRefresh,
}: {
  bucket: typeof BUCKETS[number];
  lines: (LocumLine & { doctorName: string })[];
  role: string; ownDoctorId: string | null; onRefresh: () => void;
}) {
  const [open, setOpen] = useState(bucket.key !== "paid" && bucket.key !== "voided");
  const totalEntitled = lines.reduce((s, l) => s + l.entitledAmount, 0);
  const totalReleased = lines.reduce((s, l) => s + l.releasedAmount, 0);

  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer select-none hover:bg-slate-50/60 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`${bucket.badge} text-[11px]`}>{lines.length}</span>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm">{bucket.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{bucket.hint}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-3 text-right">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Entitled</p>
              <p className="text-sm font-semibold text-slate-800 tabular-nums">{RM(totalEntitled)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Released</p>
              <p className="text-sm font-semibold text-green-700 tabular-nums">{RM(totalReleased)}</p>
            </div>
          </div>
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>

      {open && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Doctor", "Patient", "Treatment", "Category", "Status", "Steps ①②③④⑤⑥", "Net Pool", "Entitled", "Released", "Action"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map(line => (
                <LineRow
                  key={line.id}
                  line={line}
                  role={role}
                  ownDoctorId={ownDoctorId}
                  onRefresh={onRefresh}
                  doctorName={line.doctorName}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Doctor earnings summary ──────────────────────────────────────────────────
// Shown to the signed-in doctor: a month-to-date statement of their earnings
// with the full calculation chain (billed → net pool → share → released).

function EarningsSummary({ group }: { group: LocumDoctorGroup }) {
  const pending  = group.totalEntitled - group.totalReleased;
  const floorWin = group.basicPayFloor > group.totalReleased;
  const cards = [
    { label: "Billed",          value: RM(group.totalBilled),   sub: `${group.lines.length} treatments`,          cls: "text-slate-800" },
    { label: "Net Pool",        value: RM(group.totalNetPool),  sub: "after lab fees & SST",                      cls: "text-slate-800" },
    { label: "My Entitlement",  value: RM(group.totalEntitled), sub: "net pool × my split",                       cls: "text-blue-700" },
    { label: "Released",        value: RM(group.totalReleased), sub: pending > 0 ? `${RM(pending)} pending` : "all released", cls: "text-green-700" },
  ];
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">My earnings so far this month</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.cls}`}>{c.value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>
      {group.basicPayFloor > 0 && (
        <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
          {floorWin
            ? <><Lock size={12} className="text-amber-500" /> Guaranteed floor {RM(group.basicPayFloor)} ({group.sessionsWorked} sessions × {RM(group.dayRate)}) currently applies — released commission is below it.</>
            : <><TrendingUp size={12} className="text-green-500" /> Released commission exceeds your guaranteed floor of {RM(group.basicPayFloor)} ({group.sessionsWorked} sessions × {RM(group.dayRate)}).</>}
        </p>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function LocumPayoutTable({ groups, month, role, view = "status", ownDoctorId, stmtByDoctor = {} }: Props) {
  const router = useRouter();
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg,  setSyncMsg]  = useState("");
  const canManage = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);

  function refresh() { router.refresh(); }

  async function syncLines() {
    setSyncBusy(true); setSyncMsg("");
    const res = await fetch("/api/locum-payout/sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    const d = await res.json();
    setSyncBusy(false);
    if (!res.ok) { setSyncMsg(d.error ?? "Sync failed"); return; }
    setSyncMsg(d.created > 0 ? `${d.created} new line${d.created === 1 ? "" : "s"} created` : "Already up to date");
    if (d.created > 0) refresh();
  }

  const syncButton = canManage && (
    <div className="flex items-center gap-2">
      <button onClick={syncLines} disabled={syncBusy} className="btn-secondary text-xs">
        {syncBusy ? "Syncing…" : "Sync treatment lines"}
      </button>
      {syncMsg && <span className="text-xs text-slate-500">{syncMsg}</span>}
    </div>
  );

  if (groups.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon"><BadgeCheck size={24} /></div>
          <p className="font-medium text-slate-700">No payout lines for {month}</p>
          <p className="text-sm text-slate-400 mb-3">Lines track each doctor&apos;s earnings per treatment</p>
          {syncButton}
        </div>
      </div>
    );
  }

  const grandNetPool  = groups.reduce((s, g) => s + g.totalNetPool, 0);
  const grandEntitled = groups.reduce((s, g) => s + g.totalEntitled, 0);
  const grandReleased = groups.reduce((s, g) => s + g.totalReleased, 0);

  // A doctor viewing their own payouts gets a personal earnings statement
  const ownGroup = role === "DOCTOR"
    ? groups.find(g => g.doctorProfileId === ownDoctorId) ?? groups[0]
    : null;

  // Flatten lines (with doctor name) and bucket them for the status view
  const flatLines = groups.flatMap(g => g.lines.map(l => ({ ...l, doctorName: g.doctorName })));
  const bucketed  = BUCKETS
    .map(b => ({ bucket: b, lines: flatLines.filter(l => l.bucket === b.key) }))
    .filter(b => b.lines.length > 0);

  return (
    <div className="space-y-4">
      {ownGroup && <EarningsSummary group={ownGroup} />}

      {/* Summary bar */}
      <div className="flex items-center gap-4 px-1 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <Zap size={13} className="text-green-500" />
          <span>Net pool: <strong className="text-slate-800">{RM(grandNetPool)}</strong></span>
        </div>
        <div className="w-px h-4 bg-slate-200" />
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <span>Total entitled: <strong className="text-slate-800">{RM(grandEntitled)}</strong></span>
        </div>
        <div className="w-px h-4 bg-slate-200" />
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <BadgeCheck size={13} className="text-blue-500" />
          <span>Total released: <strong className="text-green-700">{RM(grandReleased)}</strong></span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            <a href={`?month=${month}&tab=locum&view=status`}
              className={`px-3 py-1.5 transition-colors ${view === "status" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
              By Status
            </a>
            <a href={`?month=${month}&tab=locum&view=doctor`}
              className={`px-3 py-1.5 transition-colors ${view === "doctor" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
              By Doctor
            </a>
          </div>
          {syncButton}
          <span className="text-xs text-slate-400 hidden xl:inline">
            Steps: ① Counter ② Doctor ③ Lab ④ Complete ⑤ Release ⑥ Paid
          </span>
        </div>
      </div>

      {view === "status"
        ? bucketed.map(({ bucket, lines }) => (
            <StatusGroupCard
              key={bucket.key}
              bucket={bucket}
              lines={lines}
              role={role}
              ownDoctorId={ownDoctorId}
              onRefresh={refresh}
            />
          ))
        : groups.map(g => (
            <DoctorGroupCard
              key={g.doctorProfileId}
              group={g}
              month={month}
              role={role}
              ownDoctorId={ownDoctorId}
              onRefresh={refresh}
              stmt={stmtByDoctor[g.doctorProfileId]}
            />
          ))}
    </div>
  );
}
