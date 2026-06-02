"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

type Clinic = { id: string; name: string };
const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Bars({ data }: { data: { label: string; gross: number; net: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.gross));
  return (
    <div className="flex items-end gap-1.5 h-44">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5">
          <div className="w-full flex gap-0.5 items-end" style={{ height: "100%" }}>
            <div className="flex-1 bg-blue-400 rounded-t" style={{ height: `${(d.gross / max) * 100}%` }} title={`Gross ${RM(d.gross)}`} />
            <div className="flex-1 bg-green-400 rounded-t" style={{ height: `${(d.net / max) * 100}%` }} title={`Net ${RM(d.net)}`} />
          </div>
          <span className="text-[10px] text-slate-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function PayrollReportClient({ clinics }: { clinics: Clinic[] }) {
  const [clinicId, setClinicId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    const q = new URLSearchParams({ year: String(year) }); if (clinicId) q.set("clinicId", clinicId);
    fetch(`/api/reports/payroll/summary?${q}`).then((r) => r.json()).then((d) => Array.isArray(d) && setRows(d));
  }, [clinicId, year]);

  const chart = rows.map((r, i) => ({ label: MONTHS[i], gross: r.totalGross, net: r.totalNet }));
  const totals = rows.reduce((a, r) => ({ gross: a.gross + r.totalGross, net: a.net + r.totalNet, epf: a.epf + r.totalEpf, socso: a.socso + r.totalSocso, eis: a.eis + r.totalEis, tax: a.tax + r.totalTax }), { gross: 0, net: 0, epf: 0, socso: 0, eis: 0, tax: 0 });

  function exportXlsx() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map((r) => ({
      Month: r.month, Gross: r.totalGross, Net: r.totalNet, EPF: r.totalEpf, SOCSO: r.totalSocso, EIS: r.totalEis, Tax: r.totalTax, Staff: r.staffCount,
    }))), "Payroll Summary");
    XLSX.writeFile(wb, `Payroll-Summary-${year}.xlsx`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">Payroll Report</h1>
        <div className="flex gap-2">
          <select className="form-input w-40 text-sm" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            <option value="">All Clinics</option>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="form-input w-28 text-sm" value={year} onChange={(e) => setYear(+e.target.value)}>
            {[year + 1, year, year - 1, year - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportXlsx} className="btn-primary text-sm">Export Excel</button>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[["Gross", totals.gross], ["Net", totals.net], ["EPF", totals.epf], ["SOCSO", totals.socso], ["EIS", totals.eis], ["Tax", totals.tax]].map(([l, v]) => (
          <div key={l as string} className="card p-3"><p className="text-xs uppercase text-slate-500">{l}</p><p className="text-sm font-bold text-slate-800">{RM(v as number)}</p></div>
        ))}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-700">Monthly Gross vs Net</h2>
          <div className="flex gap-3 text-xs"><span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-400 rounded-sm" />Gross</span><span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded-sm" />Net</span></div>
        </div>
        <Bars data={chart} />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Month", "Gross", "Net", "EPF", "SOCSO", "EIS", "Tax", "Staff"].map((h) => <th key={h} className="px-4 py-2.5 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="table-row">
                <td className="px-4 py-2">{r.month}</td>
                <td className="px-4 py-2">{RM(r.totalGross)}</td>
                <td className="px-4 py-2 font-medium">{RM(r.totalNet)}</td>
                <td className="px-4 py-2">{RM(r.totalEpf)}</td>
                <td className="px-4 py-2">{RM(r.totalSocso)}</td>
                <td className="px-4 py-2">{RM(r.totalEis)}</td>
                <td className="px-4 py-2">{RM(r.totalTax)}</td>
                <td className="px-4 py-2 text-center">{r.staffCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
