"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    DRAFT:            "badge-slate",
    PENDING_DIRECTOR: "badge-amber",
    PENDING_PIC:      "bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full",
    APPROVED:         "badge-green",
    PAID:             "bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full",
    REJECTED:         "badge-red",
  };
  return <span className={map[status] ?? "badge-slate"}>{status.replace(/_/g, " ")}</span>;
}

function typeBadge(type: string) {
  const map: Record<string, string> = {
    GENERAL:     "bg-slate-100 text-slate-600",
    LAB:         "bg-purple-100 text-purple-700",
    MATERIALS:   "bg-blue-100 text-blue-700",
    INTERBRANCH: "bg-orange-100 text-orange-700",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[type] ?? "bg-slate-100 text-slate-600"}`}>{type}</span>;
}

const STEPS = [
  { label: "Prepared",        status: "DRAFT" },
  { label: "Director Review", status: "PENDING_DIRECTOR" },
  { label: "PIC Approval",    status: "PENDING_PIC" },
  { label: "Approved",        status: "APPROVED" },
];

function getStepState(pv: any, stepStatus: string) {
  const order = ["DRAFT", "PENDING_DIRECTOR", "PENDING_PIC", "APPROVED", "PAID"];
  const pvIdx   = order.indexOf(pv.status === "REJECTED" ? "DRAFT" : pv.status === "PAID" ? "PAID" : pv.status);
  const stepIdx = order.indexOf(stepStatus);
  if (pv.status === "PAID" || (pv.status === "APPROVED" && stepStatus === "APPROVED")) return "done";
  if (pv.status === "REJECTED" && stepStatus === "DRAFT") return "done";
  if (pvIdx > stepIdx) return "done";
  if (pvIdx === stepIdx) return "current";
  return "future";
}

export function PVDetailClient({ pv, role, userId }: { pv: any; role: string; userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Modal states
  const [showApproveDirector, setShowApproveDirector] = useState(false);
  const [showApprovePic, setShowApprovePic] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [directorNote, setDirectorNote] = useState("");
  const [picNote, setPicNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));

  const isDirector   = pv.directorId === userId;
  const isPic        = pv.picId === userId;
  const isFinance    = ["SUPER_ADMIN", "FINANCE"].includes(role);
  const isSuperAdmin = role === "SUPER_ADMIN";
  const isPreparer   = pv.preparedById === userId;

  async function action(url: string, body: any) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Action failed");
      } else {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/payment-vouchers" className="text-slate-400 hover:text-slate-600 text-sm">← Payment Vouchers</Link>
      </div>

      {/* Header */}
      <div className="card mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold font-mono text-slate-900">{pv.pvRef}</h1>
              {statusBadge(pv.status)}
            </div>
            <p className="text-slate-500 text-sm">{pv.clinic.name}</p>
            {pv.supplier && <p className="text-slate-600 text-sm mt-1">Payable to: <span className="font-medium">{pv.supplier.name}</span></p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Total Amount</p>
            <p className="text-2xl font-bold text-slate-900">RM {Number(pv.totalAmount).toFixed(2)}</p>
          </div>
        </div>

        {pv.bankName && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-slate-400">Bank:</span> <span className="font-medium">{pv.bankName}</span></div>
            <div><span className="text-slate-400">Account No:</span> <span className="font-medium">{pv.accountNo}</span></div>
            <div><span className="text-slate-400">Account Name:</span> <span className="font-medium">{pv.accountName}</span></div>
          </div>
        )}

        {pv.status === "PAID" && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-slate-400">Payment Ref:</span> <span className="font-medium">{pv.paymentRef}</span></div>
            <div><span className="text-slate-400">Payment Date:</span> <span className="font-medium">{pv.paymentDate ? new Date(pv.paymentDate).toLocaleDateString() : "—"}</span></div>
            <div><span className="text-slate-400">Paid By:</span> <span className="font-medium">{pv.paidBy?.name}</span></div>
          </div>
        )}

        {pv.status === "REJECTED" && (
          <div className="mt-4 p-3 bg-red-50 rounded-md text-sm text-red-700">
            <strong>Rejected:</strong> {pv.rejectionReason}
            <span className="text-red-400 ml-2">by {pv.rejectedBy?.name}</span>
          </div>
        )}

        {pv.notes && <p className="mt-3 text-sm text-slate-500 italic">{pv.notes}</p>}
      </div>

      {/* Approval Timeline */}
      <div className="card mb-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Approval Timeline</h2>
        <div className="flex items-center gap-0">
          {STEPS.map((step, idx) => {
            const state = getStepState(pv, step.status);
            return (
              <div key={step.status} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    state === "done"    ? "bg-green-500 text-white" :
                    state === "current" ? "bg-amber-400 text-white" :
                    "bg-slate-200 text-slate-400"
                  }`}>
                    {state === "done" ? "✓" : idx + 1}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 text-center w-20">{step.label}</p>
                  {step.status === "PENDING_DIRECTOR" && pv.directorApprovedBy && (
                    <p className="text-xs text-green-600 text-center">{pv.directorApprovedBy.name}</p>
                  )}
                  {step.status === "PENDING_PIC" && pv.picApprovedBy && (
                    <p className="text-xs text-green-600 text-center">{pv.picApprovedBy.name}</p>
                  )}
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${state === "done" ? "bg-green-400" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{error}</div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {pv.status === "DRAFT" && isFinance && (
          <>
            <Link href={`/payment-vouchers/${pv.id}/edit`} className="btn-outline text-sm">Edit</Link>
            <button
              onClick={() => action(`/api/payment-vouchers/${pv.id}/submit`, {})}
              disabled={loading}
              className="btn-primary text-sm"
            >
              Submit for Approval
            </button>
          </>
        )}

        {pv.status === "PENDING_DIRECTOR" && (isFinance || isPreparer) && (
          <button
            onClick={() => action(`/api/payment-vouchers/${pv.id}/withdraw`, {})}
            disabled={loading}
            className="btn-outline text-sm"
          >
            Withdraw
          </button>
        )}

        {pv.status === "PENDING_DIRECTOR" && (isDirector || isSuperAdmin) && (
          <>
            <button onClick={() => setShowApproveDirector(true)} className="btn-primary text-sm">Approve</button>
            <button onClick={() => setShowReject(true)} className="bg-red-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-red-700">Reject</button>
          </>
        )}

        {pv.status === "PENDING_PIC" && (isPic || isSuperAdmin) && (
          <>
            <button onClick={() => setShowApprovePic(true)} className="btn-primary text-sm">Approve Bank Transfer</button>
            <button onClick={() => setShowReject(true)} className="bg-red-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-red-700">Reject</button>
          </>
        )}

        {pv.status === "APPROVED" && isFinance && (
          <button onClick={() => setShowMarkPaid(true)} className="btn-primary text-sm">Mark as Paid</button>
        )}

        {pv.status === "REJECTED" && isFinance && (
          <button
            onClick={() => action(`/api/payment-vouchers/${pv.id}/submit`, {})}
            disabled={loading}
            className="btn-primary text-sm"
          >
            Resubmit
          </button>
        )}
      </div>

      {/* Invoices Table */}
      <div className="card overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Supplier Invoices ({pv.invoices.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">Type</th>
              <th className="table-header">Invoice No</th>
              <th className="table-header">Date</th>
              <th className="table-header">Description</th>
              <th className="table-header">Category</th>
              <th className="table-header text-right">Amount (RM)</th>
            </tr>
          </thead>
          <tbody>
            {pv.invoices.map((inv: any) => (
              <tr key={inv.id} className="table-row">
                <td className="px-4 py-2">{typeBadge(inv.invoiceType)}</td>
                <td className="px-4 py-2 font-mono text-xs">{inv.invoiceNo}</td>
                <td className="px-4 py-2 text-slate-500">{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                <td className="px-4 py-2">{inv.description}</td>
                <td className="px-4 py-2 text-slate-500">{inv.category?.name ?? "—"}</td>
                <td className="px-4 py-2 text-right font-medium">{Number(inv.amount).toFixed(2)}</td>
              </tr>
            ))}
            <tr className="bg-slate-50">
              <td colSpan={5} className="px-4 py-2 text-right text-sm font-semibold text-slate-700">Total</td>
              <td className="px-4 py-2 text-right font-bold text-slate-900">RM {Number(pv.totalAmount).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showApproveDirector && (
        <Modal title="Approve (Director)" onClose={() => setShowApproveDirector(false)}>
          <p className="text-sm text-slate-600 mb-3">You are approving <strong>{pv.pvRef}</strong> for RM {Number(pv.totalAmount).toFixed(2)}.</p>
          <label className="form-label">Note (optional)</label>
          <textarea className="form-input mb-4" rows={2} value={directorNote} onChange={(e) => setDirectorNote(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowApproveDirector(false)} className="btn-outline text-sm">Cancel</button>
            <button
              disabled={loading}
              onClick={() => { action(`/api/payment-vouchers/${pv.id}/approve-director`, { directorNote }); setShowApproveDirector(false); }}
              className="btn-primary text-sm"
            >
              Confirm Approval
            </button>
          </div>
        </Modal>
      )}

      {showApprovePic && (
        <Modal title="Approve Bank Transfer (PIC)" onClose={() => setShowApprovePic(false)}>
          <p className="text-sm text-slate-600 mb-3">Confirm bank transfer of RM {Number(pv.totalAmount).toFixed(2)} to <strong>{pv.supplier?.name ?? "payee"}</strong>.</p>
          {pv.bankName && (
            <div className="mb-4 p-3 bg-slate-50 rounded-md text-sm">
              <p><strong>Bank:</strong> {pv.bankName}</p>
              <p><strong>Account:</strong> {pv.accountNo}</p>
              <p><strong>Name:</strong> {pv.accountName}</p>
            </div>
          )}
          <label className="form-label">Note (optional)</label>
          <textarea className="form-input mb-4" rows={2} value={picNote} onChange={(e) => setPicNote(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowApprovePic(false)} className="btn-outline text-sm">Cancel</button>
            <button
              disabled={loading}
              onClick={() => { action(`/api/payment-vouchers/${pv.id}/approve-pic`, { picNote }); setShowApprovePic(false); }}
              className="btn-primary text-sm"
            >
              Confirm
            </button>
          </div>
        </Modal>
      )}

      {showReject && (
        <Modal title="Reject Payment Voucher" onClose={() => setShowReject(false)}>
          <label className="form-label">Rejection Reason *</label>
          <textarea className="form-input mb-4" rows={3} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Required" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowReject(false)} className="btn-outline text-sm">Cancel</button>
            <button
              disabled={loading || !rejectionReason}
              onClick={() => { action(`/api/payment-vouchers/${pv.id}/reject`, { rejectionReason }); setShowReject(false); }}
              className="bg-red-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-red-700 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </Modal>
      )}

      {showMarkPaid && (
        <Modal title="Mark as Paid" onClose={() => setShowMarkPaid(false)}>
          <label className="form-label">Payment Reference *</label>
          <input className="form-input mb-3" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="e.g. TXN123456" />
          <label className="form-label">Payment Date</label>
          <input type="date" className="form-input mb-4" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowMarkPaid(false)} className="btn-outline text-sm">Cancel</button>
            <button
              disabled={loading || !paymentRef}
              onClick={() => { action(`/api/payment-vouchers/${pv.id}/mark-paid`, { paymentRef, paymentDate }); setShowMarkPaid(false); }}
              className="btn-primary text-sm"
            >
              Confirm Payment
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
