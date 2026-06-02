"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Clinic = { id: string; name: string };
const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
const STATUS: Record<string, string> = { DRAFT: "bg-slate-100 text-slate-600", PROCESSING: "bg-amber-100 text-amber-700", APPROVED: "bg-blue-100 text-blue-700", PAID: "bg-green-100 text-green-700" };

export function PayrollListClient({ clinics }: { clinics: Clinic[] }) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [runs, setRuns] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const d = await fetch(`/api/hr/payroll${clinicId ? `?clinicId=${clinicId}` : ""}`).then((r) => r.json());
    setRuns(Array.isArray(d) ? d : []);
  }
  useEffect(() => { load(); }, [clinicId]);

  async function run() {
    const cn = clinics.find((c) => c.id === clinicId)?.name;
    if (!confirm(`Generate payroll for ${cn} for ${month}? This calculates salaries for all staff.`)) return;
    setBusy(true); setError("");
    const res = await fetch("/api/hr/payroll/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clinicId, month }) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error); return; }
    router.push(`/hr/payroll/${d.id}`);
  }

  const totals = runs.reduce((a, r) => ({ gross: a.gross + Number(r.totalGross), net: a.net + Number(r.totalNet), epf: a.epf + Number(r.totalEpf), socso: a.socso + Number(r.totalSocso) }), { gross: 0, net: 0, epf: 0, socso: 0 });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">Payroll Management</h1>
        <div className="flex items-center gap-2">
          <select className="form-input w-40 text-sm" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>{clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input type="month" className="form-input text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button onClick={run} disabled={busy} className="btn-primary text-sm">{busy ? "Running…" : "Run Payroll"}</button>
        </div>
      </div>
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4"><p className="text-xs uppercase text-slate-500">Total Gross</p><p className="text-xl font-bold text-slate-800">{RM(totals.gross)}</p></div>
        <div className="card p-4"><p className="text-xs uppercase text-slate-500">Total Net</p><p className="text-xl font-bold text-green-700">{RM(totals.net)}</p></div>
        <div className="card p-4"><p className="text-xs uppercase text-slate-500">Total EPF</p><p className="text-xl font-bold text-slate-800">{RM(totals.epf)}</p></div>
        <div className="card p-4"><p className="text-xs uppercase text-slate-500">Total SOCSO</p><p className="text-xl font-bold text-slate-800">{RM(totals.socso)}</p></div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header"><tr>{["Month", "Clinic", "Staff", "Gross", "Net", "Status", ""].map((h) => <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {runs.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No payroll runs.</td></tr>}
            {runs.map((r) => (
              <tr key={r.id} className="table-row cursor-pointer" onClick={() => router.push(`/hr/payroll/${r.id}`)}>
                <td className="px-4 py-3 font-medium">{r.month}</td>
                <td className="px-4 py-3 text-slate-600">{r.clinic.name}</td>
                <td className="px-4 py-3 text-center">{r._count.slips}</td>
                <td className="px-4 py-3">{RM(Number(r.totalGross))}</td>
                <td className="px-4 py-3 font-medium">{RM(Number(r.totalNet))}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${STATUS[r.status]}`}>{r.status}</span></td>
                <td className="px-4 py-3 text-blue-600 text-xs">View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
