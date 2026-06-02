"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";

const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
const STATUS: Record<string, string> = { DRAFT: "bg-slate-100 text-slate-600", PROCESSING: "bg-amber-100 text-amber-700", APPROVED: "bg-blue-100 text-blue-700", PAID: "bg-green-100 text-green-700" };

export function PayrollDetailClient({ id, canApprove }: { id: string; canApprove: boolean }) {
  const [run, setRun] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() { setRun(await fetch(`/api/hr/payroll/${id}`).then((r) => r.json())); }
  useEffect(() => { load(); }, [id]);

  async function act(path: string, method = "PATCH") {
    setBusy(true); setMsg("");
    const res = await fetch(`/api/hr/payroll/${id}/${path}`, { method });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg(d.error); return; }
    if (d.generated !== undefined) setMsg(`Generated ${d.generated} PDF link(s).`);
    load();
  }

  function exportXlsx() {
    if (!run) return;
    const rows = run.slips.map((s: any) => ({
      Employee: s.staffProfile.user.name, "Employee ID": s.staffProfile.employeeId ?? "",
      Basic: Number(s.basicSalary), Allowances: Number(s.allowances), Overtime: Number(s.overtime),
      Commission: Number(s.commission), Claims: Number(s.claims), Gross: Number(s.grossSalary),
      "EPF (Emp)": Number(s.epfEmployee), "SOCSO (Emp)": Number(s.socsoEmployee), "EIS (Emp)": Number(s.eisEmployee),
      Tax: Number(s.incomeTax), "Unpaid Leave": Number(s.unpaidLeaveDeduction), Net: Number(s.netSalary),
      "Days Worked": s.daysWorked, Absent: s.daysAbsent, Leave: s.daysLeave,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Payroll");
    XLSX.writeFile(wb, `Payroll-${run.clinic.name}-${run.month}.xlsx`);
  }

  if (!run) return <div className="p-8 text-slate-400">Loading…</div>;
  if (run.error) return <div className="p-8 text-red-600">{run.error}</div>;

  const ded = (s: any) => Number(s.epfEmployee) + Number(s.socsoEmployee) + Number(s.eisEmployee) + Number(s.incomeTax) + Number(s.unpaidLeaveDeduction) + Number(s.otherDeductions);

  return (
    <div className="space-y-5">
      <Link href="/hr/payroll" className="text-sm text-slate-500 hover:text-slate-700">← Payroll</Link>

      <div className="card p-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{run.clinic.name} — {run.month}</h1>
            <span className={`text-xs px-2 py-0.5 rounded ${STATUS[run.status]}`}>{run.status}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {run.runBy && `Run by ${run.runBy.name}`}{run.approvedBy && ` · Approved by ${run.approvedBy.name}`}
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

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => act("generate-pdfs", "POST")} disabled={busy} className="btn-outline text-sm">Generate All PDFs</button>
        <button onClick={exportXlsx} className="btn-outline text-sm">Export Excel</button>
        {canApprove && run.status === "DRAFT" && <button onClick={() => act("approve")} disabled={busy} className="btn-primary bg-blue-600 text-sm">Approve Payroll</button>}
        {canApprove && run.status === "APPROVED" && <button onClick={() => act("mark-paid")} disabled={busy} className="btn-primary bg-green-600 text-sm">Mark as Paid</button>}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Employee", "Basic", "Gross", "Deductions", "Net", "Worked", "PDF"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {run.slips.map((s: any) => (
              <tr key={s.id} className="table-row">
                <td className="px-4 py-3 font-medium">{s.staffProfile.user.name}<span className="block text-xs text-slate-400">{s.staffProfile.employeeId}</span></td>
                <td className="px-4 py-3">{RM(s.basicSalary)}</td>
                <td className="px-4 py-3">{RM(s.grossSalary)}</td>
                <td className="px-4 py-3 text-red-500">{RM(ded(s))}</td>
                <td className="px-4 py-3 font-semibold">{RM(s.netSalary)}</td>
                <td className="px-4 py-3 text-center">{s.daysWorked}</td>
                <td className="px-4 py-3"><a href={`/api/hr/payroll/${id}/slip/${s.staffProfileId}/pdf`} target="_blank" className="text-blue-600 hover:underline text-xs">Download</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
