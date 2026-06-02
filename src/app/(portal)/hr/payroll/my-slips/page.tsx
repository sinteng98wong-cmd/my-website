"use client";

import { useEffect, useState } from "react";

const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

export default function MySlipsPage() {
  const [slips, setSlips] = useState<any[]>([]);
  useEffect(() => { fetch("/api/hr/payroll/my-slips").then((r) => r.json()).then((d) => Array.isArray(d) && setSlips(d)); }, []);

  return (
    <div className="max-w-3xl">
      <h1 className="page-title mb-6">My Payslips</h1>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Month", "Gross", "Net", "Status", ""].map((h) => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {slips.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No payslips available yet.</td></tr>}
            {slips.map((s) => (
              <tr key={s.id} className="table-row">
                <td className="px-4 py-3 font-medium">{s.month}</td>
                <td className="px-4 py-3">{RM(s.grossSalary)}</td>
                <td className="px-4 py-3 font-semibold">{RM(s.netSalary)}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${s.status === "PAID" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{s.status}</span></td>
                <td className="px-4 py-3"><a href={s.downloadUrl} target="_blank" className="text-blue-600 hover:underline text-xs">Download PDF</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
