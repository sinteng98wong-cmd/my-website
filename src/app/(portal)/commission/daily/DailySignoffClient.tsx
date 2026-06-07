"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, Stethoscope } from "lucide-react";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

interface Treatment {
  id:            string;
  patientName:   string;
  patientRef:    string;
  clinicName:    string;
  treatmentName: string;
  billedAmount:  number;
  labFee:        number;
  sst:           number;
  doctorSplit:   number;
  commission:    string;
}

interface Props {
  date:       string;
  treatments: Treatment[];
  total:      number;
  signoff:    { signedAt: string } | null;
}

export function DailySignoffClient({ date, treatments, total, signoff }: Props) {
  const router = useRouter();
  const [busy,    setBusy]    = useState(false);
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null);
  const [confirm, setConfirm] = useState(false);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function sign() {
    setBusy(true);
    setConfirm(false);
    const res = await fetch("/api/commission/daily-signoff", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ date }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json();
      showToast(d.error ?? "Failed to sign off", false);
      return;
    }
    showToast(`Signed off for ${date}`, true);
    router.refresh();
  }

  if (treatments.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon"><Stethoscope size={24} /></div>
          <p className="font-medium text-slate-700">No treatments on {date}</p>
          <p className="text-sm text-slate-400">Select a different date to view treatments</p>
        </div>
      </div>
    );
  }

  const totalCommission = treatments.reduce((s, t) => s + parseFloat(t.commission), 0);

  return (
    <div className="space-y-4">
      {/* Treatments table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Patient", "Clinic", "Treatment", "Billed", "Lab Fee", "My Commission"].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {treatments.map(t => (
              <tr key={t.id} className="table-row">
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-900">{t.patientName}</p>
                  <p className="text-xs text-slate-400">{t.patientRef}</p>
                </td>
                <td className="px-5 py-3 text-slate-600 text-xs">{t.clinicName}</td>
                <td className="px-5 py-3 text-slate-700">{t.treatmentName}</td>
                <td className="px-5 py-3 tabular-nums">{RM(t.billedAmount)}</td>
                <td className="px-5 py-3 tabular-nums text-slate-400">
                  {t.labFee > 0 ? RM(t.labFee) : "—"}
                </td>
                <td className="px-5 py-3 tabular-nums font-semibold text-green-700">
                  {RM(parseFloat(t.commission))}
                  <span className="text-xs font-normal text-slate-400 ml-1">({t.doctorSplit}%)</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <td colSpan={3} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Total</td>
              <td className="px-5 py-3 tabular-nums font-semibold">{RM(total)}</td>
              <td />
              <td className="px-5 py-3 tabular-nums font-bold text-green-700">{RM(totalCommission)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Sign-off status + action */}
      <div className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {signoff ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 size={32} className="text-green-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-700">Signed off</p>
              <p className="text-xs text-slate-400">
                {new Date(signoff.signedAt).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <AlertCircle size={32} className="text-amber-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-amber-700">Pending your sign-off</p>
              <p className="text-xs text-slate-400">Review the {treatments.length} treatment{treatments.length !== 1 ? "s" : ""} above and confirm they are correct.</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {toast && (
            <span className={`text-xs font-medium px-3 py-1.5 rounded-lg ${toast.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {toast.msg}
            </span>
          )}
          {!signoff ? (
            <button
              onClick={() => setConfirm(true)}
              disabled={busy}
              className="btn-primary disabled:opacity-50"
            >
              {busy ? "Signing…" : "Sign & Confirm"}
            </button>
          ) : (
            <button
              onClick={() => setConfirm(true)}
              disabled={busy}
              className="btn-outline text-sm"
            >
              Re-sign
            </button>
          )}
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-semibold text-slate-900">Confirm sign-off for {date}?</h3>
            <p className="text-sm text-slate-500">
              You are confirming that the {treatments.length} treatment{treatments.length !== 1 ? "s" : ""} listed above
              ({RM(total)} billed, {RM(totalCommission)} commission) are correct.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setConfirm(false)} disabled={busy} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={sign} disabled={busy} className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50">
                {busy ? "Signing…" : "Confirm & Sign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
