"use client";

import { useState } from "react";

interface EInvoiceStatusWidgetProps {
  invoiceId: string;
  eInvoiceStatus: string | null;
  eInvoiceUUID: string | null;
  eInvoiceQrUrl: string | null;
  eInvoiceSubmittedAt: string | null;
  canSubmit: boolean;
  canCancel: boolean;
}

type StatusConfig = {
  label: string;
  className: string;
};

const STATUS_CONFIG: Record<string, StatusConfig> = {
  NOT_SUBMITTED: { label: "Not Submitted",  className: "bg-slate-100 text-slate-600" },
  PENDING:       { label: "Pending",         className: "bg-amber-100 text-amber-700" },
  SUBMITTED:     { label: "Submitted",       className: "bg-amber-100 text-amber-700" },
  VALID:         { label: "Valid",           className: "bg-green-100 text-green-700" },
  INVALID:       { label: "Invalid",         className: "bg-red-100 text-red-700" },
  CANCELLED:     { label: "Cancelled",       className: "bg-red-100 text-red-700 line-through" },
  CONSOLIDATED:  { label: "Consolidated",    className: "bg-blue-100 text-blue-700" },
};

export function EInvoiceStatusWidget({
  invoiceId,
  eInvoiceStatus,
  eInvoiceUUID,
  eInvoiceQrUrl,
  eInvoiceSubmittedAt,
  canSubmit,
  canCancel,
}: EInvoiceStatusWidgetProps) {
  const [status, setStatus] = useState(eInvoiceStatus ?? "NOT_SUBMITTED");
  const [uuid, setUuid] = useState(eInvoiceUUID);
  const [qrUrl, setQrUrl] = useState(eInvoiceQrUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  // Credit note modal state
  const [showCnModal, setShowCnModal] = useState(false);
  const [cnReason, setCnReason] = useState("");
  const [cnAmount, setCnAmount] = useState("");
  const [cnLoading, setCnLoading] = useState(false);

  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["NOT_SUBMITTED"];

  const hoursSinceSubmit = eInvoiceSubmittedAt
    ? (Date.now() - new Date(eInvoiceSubmittedAt).getTime()) / 3600000
    : Infinity;
  const within72hrs = hoursSinceSubmit <= 72;

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/einvoice/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("VALID");
        setUuid(data.uuid ?? null);
        setQrUrl(data.qrUrl ?? null);
      } else {
        setError(data.error ?? "Submission failed");
        setStatus("INVALID");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    setCancelLoading(true);
    try {
      const res = await fetch("/api/einvoice/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, reason: cancelReason }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("CANCELLED");
        setShowCancelModal(false);
        setCancelReason("");
      } else {
        setError(data.error ?? "Cancel failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleCreditNote() {
    if (!cnReason.trim() || !cnAmount) return;
    setCnLoading(true);
    try {
      const res = await fetch("/api/einvoice/credit-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, reason: cnReason, amount: parseFloat(cnAmount) }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCnModal(false);
        setCnReason("");
        setCnAmount("");
      } else {
        setError(data.error ?? "Credit note failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setCnLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => undefined);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">e-Invoice (MyInvois)</span>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.className}`}>
          {statusCfg.label}
        </span>
      </div>

      {/* UUID */}
      {uuid && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono truncate max-w-[200px]" title={uuid}>
            {uuid.slice(0, 8)}...{uuid.slice(-6)}
          </span>
          <button
            onClick={() => copyToClipboard(uuid)}
            className="text-xs text-blue-600 hover:underline"
          >
            Copy UUID
          </button>
        </div>
      )}

      {/* QR URL */}
      {qrUrl && status === "VALID" && (
        <div className="flex items-center gap-2">
          <a
            href={qrUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            View on MyInvois
          </a>
          <button
            onClick={() => copyToClipboard(qrUrl)}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            (copy link)
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{error}</p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        {/* Submit button */}
        {status === "NOT_SUBMITTED" && canSubmit && (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Submit e-Invoice"}
          </button>
        )}

        {/* Re-submit if INVALID */}
        {status === "INVALID" && canSubmit && (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? "Resubmitting..." : "Retry Submission"}
          </button>
        )}

        {/* Cancel button (within 72hrs) */}
        {status === "VALID" && canCancel && within72hrs && (
          <button
            onClick={() => setShowCancelModal(true)}
            className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            Cancel
          </button>
        )}

        {/* Credit note button (after 72hrs) */}
        {status === "VALID" && canCancel && !within72hrs && (
          <button
            onClick={() => setShowCnModal(true)}
            className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700"
          >
            Issue Credit Note
          </button>
        )}
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900 mb-4">Cancel e-Invoice</h3>
            <p className="text-sm text-slate-600 mb-4">
              This cancels the MyInvois document within the 72-hour window. Provide a reason.
            </p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation..."
              rows={3}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setShowCancelModal(false); setCancelReason(""); }}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelLoading || !cancelReason.trim()}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelLoading ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Note Modal */}
      {showCnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900 mb-4">Issue Credit Note</h3>
            <p className="text-sm text-slate-600 mb-4">
              Past the 72-hour window. A credit note will be submitted to MyInvois.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Amount (MYR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cnAmount}
                  onChange={e => setCnAmount(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Reason
                </label>
                <textarea
                  value={cnReason}
                  onChange={e => setCnReason(e.target.value)}
                  placeholder="Reason for credit note..."
                  rows={3}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setShowCnModal(false); setCnReason(""); setCnAmount(""); }}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={handleCreditNote}
                disabled={cnLoading || !cnReason.trim() || !cnAmount}
                className="rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {cnLoading ? "Submitting..." : "Submit Credit Note"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
