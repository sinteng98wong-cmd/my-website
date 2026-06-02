"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ── Status stepper ────────────────────────────────────────────────────────────

const STEPS = ["DRAFT", "APPROVED", "LOCKED"] as const;

const STEP_LABEL: Record<string, string> = {
  DRAFT:    "Draft",
  APPROVED: "Approved",
  LOCKED:   "Locked",
  REVERSED: "Reversed",
};

function StatusStepper({ status }: { status: string }) {
  if (status === "REVERSED") {
    return (
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          Reversed
        </span>
        <span className="text-xs text-slate-400">This statement has been reversed and is no longer active.</span>
      </div>
    );
  }

  const currentIndex = STEPS.indexOf(status as typeof STEPS[number]);

  return (
    <div className="flex items-center gap-0 mb-4">
      {STEPS.map((step, i) => {
        const done    = i < currentIndex;
        const current = i === currentIndex;
        const pending = i > currentIndex;

        return (
          <div key={step} className="flex items-center">
            {/* Circle */}
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                done    ? "bg-green-500 border-green-500 text-white"
                : current ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-slate-300 text-slate-400"
              }`}>
                {done ? "✓" : i + 1}
              </div>
              <span className={`text-xs mt-1 font-medium ${
                done    ? "text-green-600"
                : current ? "text-blue-700"
                : "text-slate-400"
              }`}>
                {STEP_LABEL[step]}
              </span>
            </div>
            {/* Connector */}
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-12 mx-1 mb-4 transition-all ${
                done ? "bg-green-500" : "bg-slate-200"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium animate-fade-in ${
      type === "success"
        ? "bg-green-50 border border-green-200 text-green-700"
        : "bg-red-50 border border-red-200 text-red-700"
    }`}>
      <span>{type === "success" ? "✓" : "✕"}</span>
      {message}
    </div>
  );
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{message}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 ${confirmClass}`}
          >
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
}: {
  id: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [busy,    setBusy]    = useState(false);
  const [toast,   setToast]   = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [confirm, setConfirm] = useState<"lock" | "reverse" | null>(null);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function act(action: "approve" | "lock" | "reverse") {
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
      showToast(d.error ?? "Something went wrong", "error");
      return;
    }
    const labels: Record<string, string> = {
      approve: "Statement approved successfully.",
      lock:    "Statement locked. No further changes allowed.",
      reverse: "Statement reversed.",
    };
    showToast(labels[action], "success");
    router.refresh();
  }

  const CONFIRM_CONFIG = {
    lock: {
      title:        "Lock this monthly statement?",
      message:      "Once locked, no edits can be made. This action cannot be undone.",
      confirmLabel: "Lock statement",
      confirmClass: "bg-green-600 hover:bg-green-700",
    },
    reverse: {
      title:        "Reverse this statement?",
      message:      "This will void the current payout. A new statement must be generated to pay the doctor. Are you sure?",
      confirmLabel: "Yes, reverse",
      confirmClass: "bg-red-600 hover:bg-red-700",
    },
  };

  return (
    <div className="space-y-3">
      <StatusStepper status={currentStatus} />

      {toast && <Toast message={toast.message} type={toast.type} />}

      <div className="flex items-center gap-2 flex-wrap">
        {currentStatus === "DRAFT" && (
          <button
            onClick={() => act("approve")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {busy ? <Spinner /> : <span>👍</span>}
            Approve
          </button>
        )}

        {(currentStatus === "DRAFT" || currentStatus === "APPROVED") && (
          <button
            onClick={() => setConfirm("lock")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            <span>🔒</span>
            Lock
          </button>
        )}

        {currentStatus === "LOCKED" && (
          <button
            onClick={() => setConfirm("reverse")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            <span>↩</span>
            Reverse
          </button>
        )}

        {currentStatus === "REVERSED" && (
          <p className="text-xs text-slate-400 italic">This statement has been reversed.</p>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          {...CONFIRM_CONFIG[confirm]}
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
