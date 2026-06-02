"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const RM = (n: number | string) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));

interface Props {
  patientId:       string;
  patientName:     string;
  clinicId:        string;
  invoiceId:       string;
  invoiceRef:      string;
  invoiceTotal:    number;
  invoiceDate:     string;   // ISO string
}

export function TreatmentFailureRefundButton({
  patientId, patientName, clinicId,
  invoiceId, invoiceRef, invoiceTotal, invoiceDate,
}: Props) {
  const router = useRouter();
  const [open,   setOpen]   = useState(false);
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState("");
  const [done,   setDone]   = useState<string | null>(null); // salesReturnRef

  const [form, setForm] = useState({
    amount: String(invoiceTotal.toFixed(2)),
    reason: "",
    notes:  "",
  });

  async function submit() {
    if (!form.reason.trim()) { setError("Please describe the treatment failure"); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { setError("Enter a valid amount"); return; }

    setBusy(true); setError("");
    const res = await fetch(`/api/patients/${patientId}/deposits`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type:              "REFUND",
        refundCategory:    "TREATMENT_FAILURE",
        amount,
        clinicId,
        originalInvoiceId: invoiceId,
        reason:            form.reason,
        notes:             form.notes || undefined,
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }

    // Show the RTN reference, then redirect to patient deposit tab
    const sr = d.salesReturnId ?? "created";
    setDone(sr);
    setTimeout(() => {
      router.push(`/patients/${patientId}?tab=deposit`);
    }, 2500);
  }

  if (done) {
    return (
      <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 space-y-1">
        <p className="font-semibold">✓ Treatment Failure Refund processed</p>
        <p>Sales Return reference recorded in accounts.</p>
        <p className="text-xs text-green-600">Redirecting to patient deposit history…</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {!open ? (
        <button
          onClick={() => { setOpen(true); setError(""); }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
        >
          <span>↩</span>
          Treatment Failure Refund
        </button>
      ) : (
        <div className="border-2 border-red-200 rounded-lg bg-red-50/30 p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Treatment Failure Refund</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Patient: <strong>{patientName}</strong> · Original invoice: <strong>{invoiceRef}</strong>
              {" "}({new Date(invoiceDate).toLocaleDateString("en-MY", { dateStyle: "medium" })})
            </p>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 space-y-1">
            <p className="font-medium">What this does:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Creates a <strong>Sales Return (RTN-XXXXXX)</strong> against {invoiceRef} — posted to this period's ledger as a revenue reversal</li>
              <li>Records a deposit credit for {patientName} — patient can use it for future visits or request cash payout</li>
              <li>Does <em>not</em> require an existing deposit balance</li>
            </ul>
          </div>

          {/* Amount */}
          <div>
            <label className="form-label">
              Refund Amount (RM)
              <span className="text-slate-400 font-normal ml-1">— original invoice: {RM(invoiceTotal)}</span>
            </label>
            <input
              type="number" step="0.01" min="0.01" max={invoiceTotal}
              className="form-input"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            />
            {parseFloat(form.amount) < invoiceTotal && form.amount !== "" && (
              <p className="text-xs text-amber-600 mt-1">
                Partial refund — {RM(invoiceTotal - parseFloat(form.amount || "0"))} remaining on invoice
              </p>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="form-label">
              Treatment Failure Description <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              className="form-input"
              placeholder="e.g. Crown debonded after 3 weeks — failed cementation. Patient requesting full refund and remake at another clinic."
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">Internal Notes (optional)</label>
            <input
              className="form-input"
              placeholder="e.g. Approved by Dr Tan"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={busy}
              className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {busy ? "Processing…" : "Confirm Refund & Create Sales Return"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
