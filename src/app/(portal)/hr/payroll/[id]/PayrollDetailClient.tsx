"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";

const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
const STATUS: Record<string, string> = { DRAFT: "bg-slate-100 text-slate-600", PROCESSING: "bg-amber-100 text-amber-700", LOCKED: "bg-blue-100 text-blue-700", PAID: "bg-green-100 text-green-700" };
const SLIP_STATUS: Record<string, string> = { PENDING: "bg-slate-100 text-slate-600", APPROVED: "bg-blue-100 text-blue-700", PAID: "bg-emerald-100 text-emerald-700", RELEASED: "bg-green-100 text-green-700" };
const BP_STATUS: Record<string, string> = { PENDING_APPROVAL: "bg-amber-100 text-amber-700", PAID: "bg-green-100 text-green-700", REJECTED: "bg-red-100 text-red-700", DRAFT: "bg-slate-100 text-slate-600" };

export function PayrollDetailClient({ id, canManage, canPrepare }: { id: string; canManage: boolean; canPrepare: boolean }) {
  const [run, setRun] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [prepOpen, setPrepOpen] = useState(false);
  const [prep, setPrep] = useState({ bankName: "", accountNo: "", paymentDate: "", fileName: "", fileUrl: "", notes: "" });

  async function load() {
    const [r, p] = await Promise.all([
      fetch(`/api/hr/payroll/${id}`).then((r) => r.json()),
      fetch(`/api/hr/payroll/${id}/bank-payments`).then((r) => r.json()).catch(() => []),
    ]);
    setRun(r);
    setPayments(Array.isArray(p) ? p : []);
  }
  useEffect(() => { load(); }, [id]);

  async function call(url: string, method = "PATCH", body?: any) {
    setBusy(true); setMsg(""); setError("");
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "Request failed"); return null; }
    if (d.generated !== undefined) setMsg(`Generated ${d.generated} PDF link(s).`);
    await load();
    return d;
  }

  async function prepareBankPayment() {
    const d = await call(`/api/hr/payroll/${id}/bank-payments`, "POST", prep);
    if (d) { setPrepOpen(false); setMsg(`Bank payment ${d.paymentRef} prepared for ${d.slipCount} payslip(s) — awaiting 2nd approver.`); }
  }

  async function rejectPayment(paymentId: string) {
    const reason = prompt("Reason for rejecting this bank payment?");
    if (!reason) return;
    await call(`/api/hr/payroll/bank-payments/${paymentId}/reject`, "PATCH", { reason });
  }

  function exportXlsx() {
    if (!run) return;
    const rows = run.slips.map((s: any) => ({
      Employee: s.staffProfile.user.name, "Employee ID": s.staffProfile.employeeId ?? "",
      Basic: Number(s.basicSalary), Allowances: Number(s.allowances), Overtime: Number(s.overtime),
      Commission: Number(s.commission), Claims: Number(s.claims), Gross: Number(s.grossSalary),
      "EPF (Emp)": Number(s.epfEmployee), "SOCSO (Emp)": Number(s.socsoEmployee), "EIS (Emp)": Number(s.eisEmployee),
      Tax: Number(s.incomeTax), "Unpaid Leave": Number(s.unpaidLeaveDeduction), Net: Number(s.netSalary),
      "Days Worked": s.daysWorked, Absent: s.daysAbsent, Leave: s.daysLeave, Status: s.status,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Payroll");
    XLSX.writeFile(wb, `Payroll-${run.clinic.name}-${run.month}.xlsx`);
  }

  if (!run) return <div className="p-8 text-slate-400">Loading…</div>;
  if (run.error) return <div className="p-8 text-red-600">{run.error}</div>;

  const ded = (s: any) => Number(s.epfEmployee) + Number(s.socsoEmployee) + Number(s.eisEmployee) + Number(s.incomeTax) + Number(s.unpaidLeaveDeduction) + Number(s.otherDeductions);
  const cfg = run.payrollConfig ?? {};
  const viewer = run.viewer ?? {};
  const locked = run.status === "LOCKED" || run.status === "PAID";
  const approvedUnpaid = run.slips.filter((s: any) => s.status === "APPROVED" && !s.bankPaymentId).length;

  return (
    <div className="space-y-5">
      <Link href="/hr/payroll" className="text-sm text-slate-500 hover:text-slate-700">← Payroll</Link>

      <div className="card p-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{run.clinic.name} — {run.month}</h1>
            <span className={`text-xs px-2 py-0.5 rounded ${STATUS[run.status] ?? "bg-slate-100 text-slate-600"}`}>{run.status}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {run.runBy && `Run by ${run.runBy.name}`}{run.lockedBy && ` · Locked by ${run.lockedBy.name}`}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            1st approver: {cfg.firstApproverName ?? <span className="text-red-500">not configured</span>}
            {" · "}2nd approver: {cfg.secondApproverName ?? <span className="text-red-500">not configured</span>}
            {" · "}<Link href="/config/payroll" className="text-blue-600 hover:underline">Payroll Settings</Link>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-right">
          <span className="text-slate-400">Gross</span><span className="font-semibold">{RM(run.totalGross)}</span>
          <span className="text-slate-400">Net</span><span className="font-semibold text-green-700">{RM(run.totalNet)}</span>
          <span className="text-slate-400">EPF</span><span>{RM(run.totalEpf)}</span>
          <span className="text-slate-400">SOCSO</span><span>{RM(run.totalSocso)}</span>
        </div>
      </div>

      {msg && <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">{msg}</div>}
      {error && <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => call(`/api/hr/payroll/${id}/generate-pdfs`, "POST")} disabled={busy} className="btn-outline text-sm">Generate All PDFs</button>
        <button onClick={exportXlsx} className="btn-outline text-sm">Export Excel</button>
        {canManage && run.status === "DRAFT" && (
          <button onClick={() => call(`/api/hr/payroll/${id}/lock`)} disabled={busy} className="btn-primary bg-blue-600 text-sm">Lock Payroll (HR)</button>
        )}
        {canPrepare && locked && approvedUnpaid > 0 && (
          <button onClick={() => setPrepOpen(!prepOpen)} className="btn-primary bg-slate-700 text-sm">
            Prepare Bank Payment ({approvedUnpaid})
          </button>
        )}
      </div>

      {prepOpen && (
        <div className="card p-4 space-y-3">
          <p className="text-sm font-semibold">Prepare bank payment — {approvedUnpaid} approved payslip(s)</p>
          <p className="text-xs text-slate-500">Accounts prepares and uploads the payment. It only becomes PAID once the clinic&apos;s 2nd approver signs it — you cannot approve your own payment.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <input className="form-input" placeholder="Bank name" value={prep.bankName} onChange={(e) => setPrep({ ...prep, bankName: e.target.value })} />
            <input className="form-input" placeholder="Account no." value={prep.accountNo} onChange={(e) => setPrep({ ...prep, accountNo: e.target.value })} />
            <input className="form-input" type="date" value={prep.paymentDate} onChange={(e) => setPrep({ ...prep, paymentDate: e.target.value })} />
            <input className="form-input" placeholder="Payment file name" value={prep.fileName} onChange={(e) => setPrep({ ...prep, fileName: e.target.value })} />
            <input className="form-input" placeholder="Payment file URL" value={prep.fileUrl} onChange={(e) => setPrep({ ...prep, fileUrl: e.target.value })} />
            <input className="form-input" placeholder="Notes" value={prep.notes} onChange={(e) => setPrep({ ...prep, notes: e.target.value })} />
          </div>
          <button onClick={prepareBankPayment} disabled={busy} className="btn-primary text-sm">Submit for 2nd Approval</button>
        </div>
      )}

      {payments.length > 0 && (
        <div className="card overflow-x-auto">
          <p className="px-4 pt-4 text-sm font-semibold">Bank Payments</p>
          <table className="w-full text-sm">
            <thead className="table-header"><tr>{["Ref", "Amount", "Slips", "Prepared by", "Status", "Approved by", ""].map((h) => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="table-row">
                  <td className="px-4 py-3 font-medium">{p.paymentRef}<span className="block text-xs text-slate-400">{p.bankName} {p.accountNo}</span></td>
                  <td className="px-4 py-3">{RM(p.totalAmount)}</td>
                  <td className="px-4 py-3 text-center">{p._count?.slips ?? 0}</td>
                  <td className="px-4 py-3 text-slate-600">{p.preparedBy?.name}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${BP_STATUS[p.status]}`}>{p.status}</span></td>
                  <td className="px-4 py-3 text-slate-600">{p.approvedBy?.name ?? (p.rejectedBy ? `Rejected by ${p.rejectedBy.name}` : "—")}</td>
                  <td className="px-4 py-3">
                    {p.status === "PENDING_APPROVAL" && viewer.isSecondApprover && (
                      <div className="flex gap-2">
                        <button onClick={() => call(`/api/hr/payroll/bank-payments/${p.id}/approve`)} disabled={busy} className="text-xs text-green-700 hover:underline">Approve (2nd)</button>
                        <button onClick={() => rejectPayment(p.id)} disabled={busy} className="text-xs text-red-600 hover:underline">Reject</button>
                      </div>
                    )}
                    {p.status === "PENDING_APPROVAL" && !viewer.isSecondApprover && <span className="text-xs text-slate-400">Awaiting 2nd approver</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Employee", "Basic", "Gross", "Deductions", "Net", "Status", "PDF", "Action"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {run.slips.map((s: any) => (
              <tr key={s.id} className="table-row">
                <td className="px-4 py-3 font-medium">{s.staffProfile.user.name}<span className="block text-xs text-slate-400">{s.staffProfile.employeeId}</span></td>
                <td className="px-4 py-3">{RM(s.basicSalary)}</td>
                <td className="px-4 py-3">{RM(s.grossSalary)}</td>
                <td className="px-4 py-3 text-red-500">{RM(ded(s))}</td>
                <td className="px-4 py-3 font-semibold">{RM(s.netSalary)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${SLIP_STATUS[s.status] ?? "bg-slate-100"}`}>{s.status}</span>
                  {s.bankPayment && <span className="block text-xs text-slate-400 mt-0.5">{s.bankPayment.paymentRef}</span>}
                </td>
                <td className="px-4 py-3"><a href={`/api/hr/payroll/${id}/slip/${s.staffProfileId}/pdf`} target="_blank" className="text-blue-600 hover:underline text-xs">Download</a></td>
                <td className="px-4 py-3">
                  {locked && s.status === "PENDING" && viewer.isFirstApprover && (
                    <button onClick={() => call(`/api/hr/payroll/${id}/slip/${s.staffProfileId}/approve`)} disabled={busy} className="text-xs text-blue-600 hover:underline">Approve (1st)</button>
                  )}
                  {locked && s.status === "PENDING" && !viewer.isFirstApprover && <span className="text-xs text-slate-400">Awaiting 1st approver</span>}
                  {s.status === "APPROVED" && <span className="text-xs text-slate-400">{s.bankPaymentId ? "In bank payment" : "Awaiting payment"}</span>}
                  {s.status === "PAID" && canManage && (
                    <button onClick={() => call(`/api/hr/payroll/${id}/slip/${s.staffProfileId}/release`)} disabled={busy} className="text-xs text-green-700 hover:underline">Release to staff</button>
                  )}
                  {s.status === "RELEASED" && <span className="text-xs text-slate-400">Released{s.releasedBy ? ` by ${s.releasedBy.name}` : ""}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
