"use client";

import { useState, useEffect } from "react";

type Clinic = { id: string; name: string };

type ReportData = {
  totalPaid: number;
  totalPending: number;
  byCategory: { category: string; totalAmount: number; pvCount: number }[];
  bySupplier: { supplierName: string; totalAmount: number; pvCount: number }[];
  byStatus: { status: string; count: number; totalAmount: number }[];
};

export function ExpensesClient({ clinics }: { clinics: Clinic[] }) {
  const now = new Date();
  const [clinicId, setClinicId] = useState("");
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData]   = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, [clinicId, year, month]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (clinicId) params.set("clinicId", clinicId);
      const res = await fetch(`/api/reports/payment-vouchers?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div>
      <h1 className="page-title mb-6">Expense Report</h1>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="form-label">Clinic</label>
            <select className="form-input" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
              <option value="">All Clinics</option>
              {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Year</label>
            <select className="form-input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Month</label>
            <select className="form-input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading && <p className="text-slate-400 text-sm">Loading...</p>}

      {data && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="stat-card">
              <p className="text-slate-500 text-sm">Total Paid</p>
              <p className="text-2xl font-bold text-emerald-700">RM {data.totalPaid.toFixed(2)}</p>
            </div>
            <div className="stat-card">
              <p className="text-slate-500 text-sm">Total Pending</p>
              <p className="text-2xl font-bold text-amber-700">RM {data.totalPending.toFixed(2)}</p>
            </div>
          </div>

          {/* By Status */}
          <div className="card mb-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">By Status</h2>
            <div className="grid grid-cols-3 gap-3">
              {data.byStatus.filter(s => s.count > 0).map((s) => (
                <div key={s.status} className="p-3 bg-slate-50 rounded-md">
                  <p className="text-xs text-slate-400">{s.status.replace(/_/g," ")}</p>
                  <p className="font-semibold text-slate-800">{s.count} PVs</p>
                  <p className="text-sm text-slate-600">RM {s.totalAmount.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* By Category */}
          <div className="card mb-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">By Category</h2>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">Category</th>
                  <th className="table-header text-right">Invoices</th>
                  <th className="table-header text-right">Total (RM)</th>
                </tr>
              </thead>
              <tbody>
                {data.byCategory.length === 0 && <tr><td colSpan={3} className="text-center py-4 text-slate-400">No data</td></tr>}
                {data.byCategory.map((c) => (
                  <tr key={c.category} className="table-row">
                    <td className="px-4 py-2">{c.category}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{c.pvCount}</td>
                    <td className="px-4 py-2 text-right font-medium">{c.totalAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* By Supplier */}
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">By Supplier</h2>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">Supplier</th>
                  <th className="table-header text-right">PVs</th>
                  <th className="table-header text-right">Total (RM)</th>
                </tr>
              </thead>
              <tbody>
                {data.bySupplier.length === 0 && <tr><td colSpan={3} className="text-center py-4 text-slate-400">No data</td></tr>}
                {data.bySupplier.map((s) => (
                  <tr key={s.supplierName} className="table-row">
                    <td className="px-4 py-2">{s.supplierName}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{s.pvCount}</td>
                    <td className="px-4 py-2 text-right font-medium">{s.totalAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
