"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ── Status stepper ────────────────────────────────────────────────────────────

const STEPS = [
  { key: "DRAFT",            label: "Draft"           },
  { key: "DOCTOR_SIGNED",    label: "Doctor Signed"   },
  { key: "CM_APPROVED",      label: "CM Approved"     },
  { key: "FINANCE_APPROVED", label: "Finance Approved"},
  { key: "LOCKED",           label: "Locked"          },
] as const;

function StatusStepper({ status }: { status: string }) {
  if (status === "REVERSED") {
    return (
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          Reversed
        </span>
        <span className="text-xs text-slate-400">This statement has been reversed.</span>
      </div>
    );
  }

  const currentIndex = STEPS.findIndex(s => s.key === status);

  return (
    <div className="flex items-center gap-0 mb-4 flex-wrap gap-y-3">
      {STEPS.map((step, i) => {
        const done    = i < currentIndex;
        const current = i === currentIndex;
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                done    ? "bg-green-500 border-green-500 text-white"
                : current ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-slate-300 text-slate-400"
              }`}>
                {done ? "✓" : i + 1}
              </div>
              <span className={`text-xs mt-1 font-medium whitespace-nowrap ${
                done    ? "text-green-600"
                : current ? "text-blue-700"
                : "text-slate-400"
              }`}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-8 sm:w-12 mx-1 mb-4 transition-all ${done ? "bg-green-500" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────

function ConfirmDialog({
  title, message, confirmLabel, confirmClass, onConfirm, onCancel, busy,
}: {
  title: string; message: string; confirmLabel: string; confirmClass: string;
  onConfirm: () => void; onCancel: () => void; busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{message}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} disabled={busy} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={busy} className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 ${confirmClass}`}>
            {busy ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LocumSlipActions({
  id,
  currentStatus,
  role,
  isOwnStatement,
}: {
  id:             string;
  currentStatus:  string;
  role:           string;
  isOwnStatement: boolean;
}) {
  const router = useRouter();
  const [busy,    setBusy]    = useState(false);
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function act(action: string) {
    setBusy(true);
    setConfirm(null);
    const res = await fetch(`/api/commission/locum-statement/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      showToast(d.error ?? "Something went wrong", false);
      return;
    }
    const labels: Record<string, string> = {
      "doctor-sign":     "Statement confirmed and signed.",
      "cm-approve":      "Approved as Clinic Manager.",
      "finance-approve": "Finance approval recorded.",
      "lock":            "Statement locked. Payroll can now be run.",
    };
    showToast(labels[action] ?? "Done", true);
    router.refresh();
  }

  const confirmConfigs: Record<string, { title: string; message: string; confirmLabel: string; confirmClass: string }> = {
    "doctor-sign": {
      title:        "Sign & confirm this statement?",
      message:      "You are confirming that all treatments and commission figures for this month are correct. The statement will be sent to Clinic Manager for review.",
      confirmLabel: "Yes, I confirm",
      confirmClass: "bg-blue-600 hover:bg-blue-700",
    },
    "cm-approve": {
      title:        "Approve as Clinic Manager?",
      message:      "You have reviewed this statement and confirm it is accurate. It will be forwarded to Finance for final approval.",
      confirmLabel: "Approve",
      confirmClass: "bg-indigo-600 hover:bg-indigo-700",
    },
    "finance-approve": {
      title:        "Finance approval?",
      message:      "You are giving final Finance approval. After this, the statement can be locked and payroll disbursed.",
      confirmLabel: "Approve",
      confirmClass: "bg-purple-600 hover:bg-purple-700",
    },
    "lock": {
      title:        "Lock this statement?",
      message:      "Once locked, no further changes are allowed. Payroll will use this figure.",
      confirmLabel: "Lock & Disburse",
      confirmClass: "bg-green-600 hover:bg-green-700",
    },
  };

  const isDoctor  = role === "DOCTOR";
  const isCM      = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);
  const isFinance = ["SUPER_ADMIN", "FINANCE"].includes(role);

  return (
    <div className="space-y-3">
      <StatusStepper status={currentStatus} />

      {toast && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${
          toast.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {/* Doctor: sign own DRAFT statement */}
        {isDoctor && isOwnStatement && currentStatus === "DRAFT" && (
          <button onClick={() => setConfirm("doctor-sign")} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            {busy ? <Spinner /> : "✍️"} Sign & Confirm
          </button>
        )}

        {/* CM: approve after doctor signs */}
        {isCM && currentStatus === "DOCTOR_SIGNED" && (
          <button onClick={() => setConfirm("cm-approve")} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            {busy ? <Spinner /> : "👍"} CM Approve
          </button>
        )}

        {/* Finance: approve after CM */}
        {isFinance && currentStatus === "CM_APPROVED" && (
          <button onClick={() => setConfirm("finance-approve")} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            {busy ? <Spinner /> : "✅"} Finance Approve
          </button>
        )}

        {/* Finance: lock after finance approval */}
        {isFinance && currentStatus === "FINANCE_APPROVED" && (
          <button onClick={() => setConfirm("lock")} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            <span>🔒</span> Lock & Disburse
          </button>
        )}

        {currentStatus === "LOCKED" && (
          <p className="text-xs text-slate-400 italic flex items-center gap-1.5">🔒 Locked — payroll can now be run</p>
        )}
      </div>

      {confirm && confirmConfigs[confirm] && (
        <ConfirmDialog
          {...confirmConfigs[confirm]}
          onConfirm={() => act(confirm)}
          onCancel={() => setConfirm(null)}
          busy={busy}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
    </svg>
  );
}
