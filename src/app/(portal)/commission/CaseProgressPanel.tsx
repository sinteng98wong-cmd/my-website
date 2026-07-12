"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";
import {
  type LocumLine, BUCKETS, STATUS_BADGE, STATUS_LABEL,
  StepDots, nextAction, ForceReleaseModal, LabFeeModal, DetailsModal,
} from "./LocumPayoutTable";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

const gainedOf = (l: LocumLine) => Math.round(l.netPool * (l.accruedPct ?? 100)) / 100;

interface Props {
  month:           string;
  doctorName:      string | null;
  doctorRate:      number; // %
  role:            string;
  ownDoctorId:     string | null;
  doctorProfileId: string;
  lines:           LocumLine[];
  stmt?:           { id: string; status: string };
}

// ─── Single case row (weightage columns + workflow action) ────────────────────

function CaseLineRow({
  line, role, ownDoctorId, onRefresh,
}: { line: LocumLine; role: string; ownDoctorId: string | null; onRefresh: () => void }) {
  const [busy, setBusy]           = useState(false);
  const [errMsg, setErrMsg]       = useState("");
  const [showForce, setShowForce] = useState(false);
  const [showLabFee, setShowLabFee] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const canEditDetails = ["SUPER_ADMIN", "CLINIC_MANAGER", "FINANCE", "RECEPTIONIST", "NURSE"].includes(role);

  const next = nextAction(line, role, ownDoctorId);
  const canForce = ["SUPER_ADMIN", "CLINIC_MANAGER", "FINANCE"].includes(role)
    && (line.status === "LOCKED_PENDING_COMPLETION" || line.status === "ENTITLED")
    && !!line.counterVerifiedAt && !!line.doctorVerifiedAt
    && (!line.treatment.labJobId || line.labFeeConfirmed);
  const wt = line.accruedPct ?? 100;

  async function doAction(action: string) {
    if (action === "log_lab_fee") { setShowLabFee(true); return; }
    setBusy(true); setErrMsg("");
    const res = await fetch(`/api/locum-payout/${line.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json(); setErrMsg(d.error ?? "Action failed"); return; }
    onRefresh();
  }

  return (
    <>
      <tr className="table-row">
        <td className="px-4 py-2.5">
          <p className="font-medium text-slate-900 text-sm">{line.treatment.visit.patient.name}</p>
          <p className="text-xs text-slate-400 font-mono">{line.treatment.visit.patient.patientRef}</p>
        </td>
        <td className="px-4 py-2.5">
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
            <span className={`${STATUS_BADGE[line.status] ?? "badge-slate"} text-[10px]`}>{STATUS_LABEL[line.status] ?? line.status}</span>
          </div>
        </td>
        <td className="px-4 py-2.5"><StepDots line={line} /></td>
        <td className="px-4 py-2.5 tabular-nums text-sm">{RM(line.billedAmount)}</td>
        <td className="px-4 py-2.5 tabular-nums text-sm">
          {line.labFee > 0
            ? <>{RM(line.labFee)}{line.labFeeConfirmed ? <span className="text-[10px] text-green-600 block">✓ Confirmed</span> : <span className="text-[10px] text-amber-600 block">(est.)</span>}</>
            : <span className="text-slate-300">—</span>}
        </td>
        <td className="px-4 py-2.5 tabular-nums text-sm">{RM(line.netPool)}</td>
        <td className="px-4 py-2.5 tabular-nums text-sm font-medium text-blue-700">{wt}%</td>
        <td className="px-4 py-2.5 tabular-nums text-sm font-medium">{RM(gainedOf(line))}</td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {next && (
              <button onClick={() => doAction(next.action)} disabled={busy}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors disabled:opacity-40 ${next.style}`}>
                {busy ? "…" : next.label}
              </button>
            )}
            {canForce && (
              <button onClick={() => setShowForce(true)}
                className="text-xs px-2 py-1 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 font-medium transition-colors">
                Force
              </button>
            )}
            {errMsg && <p className="text-xs text-red-600 mt-1 w-full">{errMsg}</p>}
          </div>
        </td>
      </tr>

      {showForce && <ForceReleaseModal lineId={line.id} onDone={() => { setShowForce(false); onRefresh(); }} onCancel={() => setShowForce(false)} />}
      {showLabFee && <LabFeeModal lineId={line.id} estimatedFee={line.labFee} onDone={() => { setShowLabFee(false); onRefresh(); }} onCancel={() => setShowLabFee(false)} />}
      {showDetails && <DetailsModal line={line} onDone={() => { setShowDetails(false); onRefresh(); }} onCancel={() => setShowDetails(false)} />}
    </>
  );
}

// ─── Bucket group ─────────────────────────────────────────────────────────────

function Group({
  bucket, lines, role, ownDoctorId, onRefresh,
}: { bucket: typeof BUCKETS[number]; lines: LocumLine[]; role: string; ownDoctorId: string | null; onRefresh: () => void }) {
  const [open, setOpen] = useState(bucket.key !== "paid" && bucket.key !== "voided");
  const gained = lines.reduce((s, l) => s + gainedOf(l), 0);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 cursor-pointer select-none hover:bg-slate-50/60 transition-colors"
        onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <span className={`${bucket.badge} text-[11px]`}>{lines.length}</span>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{bucket.label}</p>
            <p className="text-xs text-slate-400">{bucket.hint}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Gained</p>
            <p className="text-sm font-semibold text-slate-800 tabular-nums">{RM(gained)}</p>
          </div>
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>
      {open && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Patient", "Treatment", "Steps ①②③④⑤⑥", "Billed", "Lab Fee", "Net", "Weightage", "Net × Weightage", "Action"].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map(l => <CaseLineRow key={l.id} line={l} role={role} ownDoctorId={ownDoctorId} onRefresh={onRefresh} />)}
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={5} className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase text-right">Subtotal net</td>
                <td className="px-4 py-2 tabular-nums font-semibold text-slate-700">{RM(lines.reduce((s, l) => s + l.netPool, 0))}</td>
                <td />
                <td className="px-4 py-2 tabular-nums font-bold text-slate-800">{RM(gained)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Case Progress — the doctor's month cases grouped by workflow status, with
 * per-case weightage math AND the workflow action buttons (verify / check
 * release / mark paid / force / edit details). Managers can also sync lines
 * and generate the monthly statement.
 */
export function CaseProgressPanel({
  month, doctorName, doctorRate, role, ownDoctorId, doctorProfileId, lines, stmt,
}: Props) {
  const router = useRouter();
  const [syncBusy, setSyncBusy] = useState(false);
  const [stmtBusy, setStmtBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const canManage = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);

  function refresh() { router.refresh(); }

  async function syncLines() {
    setSyncBusy(true); setMsg(""); setErr("");
    const res = await fetch("/api/locum-payout/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month }),
    });
    const d = await res.json();
    setSyncBusy(false);
    if (!res.ok) { setErr(d.error ?? "Sync failed"); return; }
    setMsg(d.created > 0 ? `${d.created} new line(s) created` : "Already up to date");
    if (d.created > 0) refresh();
  }

  async function generateStatement() {
    setStmtBusy(true); setErr("");
    const res = await fetch("/api/commission/locum-statement", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctorId: doctorProfileId, month }),
    });
    const d = await res.json();
    setStmtBusy(false);
    if (!res.ok) { setErr(d.error ?? "Failed"); return; }
    router.push(`/commission/${d.statementId}`);
  }

  const grouped = BUCKETS.map(b => ({ bucket: b, lines: lines.filter(l => l.bucket === b.key) })).filter(g => g.lines.length > 0);
  const totalGained = lines.reduce((s, l) => s + gainedOf(l), 0);
  const entitled = Math.round(totalGained * doctorRate) / 100;

  return (
    <div className="space-y-4">
      {/* Manager controls */}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={syncLines} disabled={syncBusy} className="btn-secondary text-xs">
            {syncBusy ? "Syncing…" : "Sync treatment lines"}
          </button>
          {stmt
            ? <button onClick={() => router.push(`/commission/${stmt.id}`)} className="btn-secondary text-xs">
                View Statement{stmt.status === "LOCKED" ? " 🔒" : ""}
              </button>
            : <button onClick={generateStatement} disabled={stmtBusy} className="btn-secondary text-xs">
                {stmtBusy ? "Generating…" : "Generate Statement"}
              </button>}
          {msg && <span className="text-xs text-green-600">{msg}</span>}
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
      )}

      {lines.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Layers size={24} /></div>
            <p className="font-medium text-slate-700">No cases for {month}</p>
            <p className="text-sm text-slate-400">Cases appear here as treatments are recorded</p>
          </div>
        </div>
      ) : (
        <>
          {grouped.map(g => <Group key={g.bucket.key} bucket={g.bucket} lines={g.lines} role={role} ownDoctorId={ownDoctorId} onRefresh={refresh} />)}

          <div className="card p-4">
            <div className="space-y-1.5 text-sm max-w-md ml-auto">
              <div className="flex justify-between text-slate-600">
                <span>Total gained (Σ net × weightage){doctorName ? ` — ${doctorName}` : ""}</span>
                <span className="tabular-nums">{RM(totalGained)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>× Doctor&apos;s share ({doctorRate}%)</span>
                <span className="tabular-nums">{RM(entitled)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-300 font-bold text-slate-900">
                <span>Entitled Commission ({month})</span>
                <span className="tabular-nums text-blue-700">{RM(entitled)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
