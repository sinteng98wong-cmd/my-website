"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdjustCommissionModal } from "./AdjustCommissionModal";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

type CommRow = {
  id: string; treatmentId: string; month: string;
  status: string; txAmount: number; labFee: number;
  doctorSplit: number; doctorRate: number; finalPayout: number; isTopUp: boolean;
  patientId: string;
  treatment: { treatmentType: { name: string }; visit: { patient: { id: string; name: string } } };
};
type DoctorGroup = {
  doctorId: string; doctorName: string; rows: CommRow[];
  total: number; allLockable: boolean;
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT:        "badge-slate",
  PENDING_LOCK: "badge-amber",
  LOCKED:       "badge-green",
  REVERSED:     "badge-red",
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", PENDING_LOCK: "Pending", LOCKED: "Locked", REVERSED: "Reversed",
};

// ── Shared micro-components ───────────────────────────────────────────────────

function Toast({ message, type, onClose }: {
  message: string; type: "success" | "error"; onClose: () => void;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm font-medium shadow-sm ${
      type === "success"
        ? "bg-green-50 border border-green-200 text-green-800"
        : "bg-red-50 border border-red-200 text-red-800"
    }`}>
      <div className="flex items-center gap-2">
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
          type === "success" ? "bg-green-500" : "bg-red-500"
        }`}>{type === "success" ? "✓" : "✕"}</span>
        {message}
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600 leading-none">✕</button>
    </div>
  );
}

function ConfirmDialog({ title, message, onConfirm, onCancel, busy }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void; busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-green-600 text-lg">🔒</span>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onCancel} disabled={busy} className="btn-secondary text-sm">Cancel</button>
          <button onClick={onConfirm} disabled={busy}
            className="btn-primary bg-green-600 hover:bg-green-700 text-sm focus:ring-green-500">
            {busy ? "Locking…" : "Lock all"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const STMT_BADGE: Record<string, string> = {
  DRAFT:    "badge-slate",
  APPROVED: "badge-blue",
  LOCKED:   "badge-green",
  REVERSED: "badge-red",
};

function StatementButton({ doctorId, month, stmt }: {
  doctorId: string; month: string;
  stmt?: { id: string; status: string; finalPayout: number } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");

  const RM = (n: number) =>
    new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

  async function generate() {
    setBusy(true); setErr("");
    const res = await fetch("/api/commission/locum-statement", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctorId, month }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(d.error ?? "Failed"); return; }
    router.push(`/commission/${d.statementId}`);
  }

  if (stmt) {
    return (
      <div className="flex items-center gap-2">
        <span className={STMT_BADGE[stmt.status] ?? "badge-slate"}>{stmt.status}</span>
        <span className="text-xs text-slate-500 tabular-nums">{RM(stmt.finalPayout)}</span>
        <Link
          href={`/commission/${stmt.id}`}
          className="text-xs text-blue-600 hover:underline font-medium"
        >
          View statement →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={generate}
        disabled={busy}
        className="text-xs px-3 py-1.5 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors font-medium"
      >
        {busy ? "Generating…" : "📄 Generate Statement"}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}

export function DoctorCommissionTable({ groups, month, canLock, canFlag, canViewPatient = false, initialAdjustTreatmentId = null, stmtByDoctor = {} }: {
  groups: DoctorGroup[]; month: string; canLock: boolean; canFlag: boolean; canViewPatient?: boolean;
  initialAdjustTreatmentId?: string | null;
  stmtByDoctor?: Record<string, { id: string; status: string; finalPayout: number }>;
}) {
  const router = useRouter();
  const [busy,          setBusy]          = useState<string | null>(null);
  const [toast,         setToast]         = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [confirmLockId, setConfirmLockId] = useState<string | null>(null);
  const [adjustingRow,  setAdjustingRow]  = useState<CommRow | null>(null);

  // Auto-open the adjust modal when a treatmentId is passed via URL
  useEffect(() => {
    if (!initialAdjustTreatmentId || !canFlag) return;
    const allRows = groups.flatMap(g => g.rows);
    const match = allRows.find(r => r.treatmentId === initialAdjustTreatmentId);
    if (match) setAdjustingRow(match);
  }, [initialAdjustTreatmentId]);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function bulkLock(doctorId: string) {
    setBusy(`bulk-${doctorId}`);
    setConfirmLockId(null);
    const res = await fetch("/api/commission/doctor/lock", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctorId, month }),
    });
    setBusy(null);
    const d = await res.json();
    if (!res.ok) { showToast(d.error ?? "Failed to lock", "error"); return; }
    showToast(`${d.locked} row${d.locked !== 1 ? "s" : ""} locked successfully.`, "success");
    router.refresh();
  }

  async function rowAction(id: string, action: "lock" | "pending_lock" | "reverse") {
    setBusy(id);
    const res = await fetch(`/api/commission/doctor/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    const d = await res.json();
    if (!res.ok) { showToast(d.error ?? "Action failed", "error"); return; }
    showToast({ lock: "Row locked.", pending_lock: "Flagged for Finance review.", reverse: "Row reversed." }[action], "success");
    router.refresh();
  }

  if (groups.length === 0) {
    return (
      <div className="card p-12 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-2xl">🩺</div>
        <div>
          <p className="font-semibold text-slate-700">No commission records</p>
          <p className="text-sm text-slate-400 mt-1">Run the Payroll Calculator to generate commission rows.</p>
        </div>
      </div>
    );
  }

  const confirmGroup = confirmLockId ? groups.find(g => g.doctorId === confirmLockId) : null;
  const lockableCount = confirmGroup?.rows.filter(r => r.status === "DRAFT" || r.status === "PENDING_LOCK").length ?? 0;

  return (
    <div className="space-y-4">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
      {adjustingRow && (
        <AdjustCommissionModal
          row={adjustingRow}
          onClose={() => setAdjustingRow(null)}
          onSaved={() => {
            setAdjustingRow(null);
            showToast("Commission adjusted successfully.", "success");
            router.refresh();
          }}
        />
      )}

      {confirmGroup && (
        <ConfirmDialog
          title={`Lock all for ${confirmGroup.doctorName}?`}
          message={`${lockableCount} commission row${lockableCount !== 1 ? "s" : ""} will be locked. Once locked, a reversal is required to make any changes.`}
          onConfirm={() => bulkLock(confirmLockId!)}
          onCancel={() => setConfirmLockId(null)}
          busy={busy === `bulk-${confirmLockId}`}
        />
      )}

      {groups.map(g => (
        <div key={g.doctorId} className="card overflow-hidden">
          {/* Doctor header */}
          <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              {/* Left — doctor identity */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold text-sm flex-shrink-0">
                  {g.doctorName.split(" ").map(w => w[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{g.doctorName}</p>
                  <p className="text-xs text-slate-400">
                    {g.rows.length} treatment{g.rows.length !== 1 ? "s" : ""} ·{" "}
                    Total: <span className="font-medium text-slate-600">{RM(g.total)}</span>
                  </p>
                </div>
              </div>
              {/* Right — row status chips + lock */}
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {(["DRAFT", "PENDING_LOCK", "LOCKED", "REVERSED"] as const).map(s => {
                  const count = g.rows.filter(r => r.status === s).length;
                  if (!count) return null;
                  return <span key={s} className={STATUS_BADGE[s]}>{count} {STATUS_LABEL[s]}</span>;
                })}
                {canLock && g.allLockable && g.rows.length > 0 && (
                  <button
                    onClick={() => setConfirmLockId(g.doctorId)}
                    disabled={!!busy}
                    className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
                  >
                    🔒 Lock all
                  </button>
                )}
              </div>
            </div>

            {/* Monthly statement row */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">Monthly Statement</p>
              <StatementButton
                doctorId={g.doctorId}
                month={month}
                stmt={stmtByDoctor[g.doctorId] ?? null}
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Treatment</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Tx Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Lab Fee</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Split</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Rate</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Payout</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {g.rows.map(c => (
                  <tr key={c.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-3.5 font-medium text-slate-900">
                      {canViewPatient ? (
                        <Link
                          href={`/patients/${c.patientId || c.treatment.visit.patient.id}`}
                          className="text-blue-700 hover:underline"
                        >
                          {c.treatment.visit.patient.name}
                        </Link>
                      ) : (
                        c.treatment.visit.patient.name
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-slate-600">
                      {c.treatment.treatmentType.name}
                      {c.isTopUp && (
                        <span className="ml-2 badge-amber text-[10px]">top-up</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right tabular-nums text-slate-700">{RM(c.txAmount)}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums text-slate-400">{RM(c.labFee)}</td>
                    <td className="px-6 py-3.5 text-center text-slate-600">{c.doctorSplit}%</td>
                    <td className="px-6 py-3.5 text-center text-slate-600">{c.doctorRate}%</td>
                    <td className="px-6 py-3.5 text-right tabular-nums font-semibold text-slate-900">{RM(c.finalPayout)}</td>
                    <td className="px-6 py-3.5 text-center">
                      <span className={STATUS_BADGE[c.status] ?? "badge-slate"}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canFlag && (c.status === "DRAFT" || c.status === "PENDING_LOCK") && (
                          <button
                            onClick={() => setAdjustingRow(c)}
                            disabled={!!busy}
                            title="Manually adjust split, rate, or lab fee"
                            className="px-2.5 py-1 text-xs border border-blue-300 text-blue-700 rounded-md hover:bg-blue-50 disabled:opacity-50 transition-colors"
                          >
                            ✏️ Edit
                          </button>
                        )}
                        {canFlag && c.status === "DRAFT" && (
                          <button onClick={() => rowAction(c.id, "pending_lock")} disabled={!!busy}
                            className="px-2.5 py-1 text-xs border border-amber-300 text-amber-700 rounded-md hover:bg-amber-50 disabled:opacity-50 transition-colors">
                            Flag
                          </button>
                        )}
                        {canLock && (c.status === "DRAFT" || c.status === "PENDING_LOCK") && (
                          <button onClick={() => rowAction(c.id, "lock")} disabled={!!busy}
                            className="px-2.5 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors">
                            Lock
                          </button>
                        )}
                        {canLock && c.status === "LOCKED" && (
                          <button onClick={() => rowAction(c.id, "reverse")} disabled={!!busy}
                            className="px-2.5 py-1 text-xs border border-red-300 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors">
                            ↩ Reverse
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Footer total */}
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/60">
                  <td colSpan={6} className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</td>
                  <td className="px-6 py-3 text-right font-bold text-slate-900 tabular-nums">{RM(g.total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
