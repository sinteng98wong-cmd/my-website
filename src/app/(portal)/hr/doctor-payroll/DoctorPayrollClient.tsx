"use client";

import { useState } from "react";

const RM = (n: number) =>
  new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);

const CONTRACT_BADGE: Record<string, string> = {
  PURE_SALARIED:    "bg-blue-100 text-blue-700",
  LOCUM_WITH_FLOOR: "bg-amber-100 text-amber-700",
  PURE_PROF_FEES:   "bg-purple-100 text-purple-700",
  DUAL_SLIP_HYBRID: "bg-green-100 text-green-700",
};

const CONTRACT_LABEL: Record<string, string> = {
  PURE_SALARIED:    "Type 1 — Pure Salaried",
  LOCUM_WITH_FLOOR: "Type 2 — Locum with Guaranteed Floor",
  PURE_PROF_FEES:   "Type 3 — Pure Professional Fees",
  DUAL_SLIP_HYBRID: "Type 4 — Dual-Slip Hybrid",
};

type Doctor = { profileId: string; name: string; type: string };

interface SlipBreakdown {
  basic: number; performanceIncentive: number;
  epfEmployee: number; epfEmployer: number;
  socsoEmployee: number; socsoEmployer: number;
  eisEmployee: number; eisEmployer: number;
  netSalary: number;
}

interface Result {
  doctorId: string;
  contractType: string;
  grossCalculatedTarget: number;
  disbursement: {
    salarySlip: SlipBreakdown;
    serviceVoucher: { professionalFees: number };
  };
  opsCount: number;
  committed: boolean;
  error?: string;
}

function StatRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-1.5 border-b border-slate-50 text-sm ${highlight ? "font-semibold" : ""}`}>
      <span className="text-slate-600">{label}</span>
      <span className={highlight ? "text-slate-900" : "text-slate-700"}>{RM(value)}</span>
    </div>
  );
}

export function DoctorPayrollClient({ doctors }: { doctors: Doctor[] }) {
  const [doctorId, setDoctorId] = useState(doctors[0]?.profileId ?? "");
  const [month,    setMonth]    = useState(() => new Date().toISOString().slice(0, 7));
  const [result,   setResult]   = useState<Result | null>(null);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");
  const [committing, setCommitting] = useState(false);

  async function calculate(commit = false) {
    if (commit) setCommitting(true); else setBusy(true);
    setError("");

    const res = await fetch("/api/hr/doctor-payroll/calculate", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ doctorId, month, commit }),
    });
    const d: Result = await res.json();

    if (commit) setCommitting(false); else setBusy(false);

    if (!res.ok || d.error) { setError(d.error ?? "Calculation failed"); return; }
    setResult(d);
  }

  const slip    = result?.disbursement.salarySlip;
  const voucher = result?.disbursement.serviceVoucher;

  const hasSalarySlip   = slip && (slip.basic > 0 || slip.performanceIncentive > 0);
  const hasVoucher      = voucher && voucher.professionalFees > 0;
  const totalStatutoryEmployee = slip ? slip.epfEmployee + slip.socsoEmployee + slip.eisEmployee : 0;
  const totalStatutoryEmployer = slip ? slip.epfEmployer + slip.socsoEmployer + slip.eisEmployer : 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="page-title">Doctor Payroll Calculator</h1>

      {/* Inputs */}
      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="form-label">Doctor</label>
            <select
              className="form-input"
              value={doctorId}
              onChange={e => setDoctorId(e.target.value)}
            >
              {doctors.map(d => (
                <option key={d.profileId} value={d.profileId}>
                  {d.name} ({d.type})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Month</label>
            <input
              type="month"
              className="form-input"
              value={month}
              onChange={e => setMonth(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => calculate(false)}
            disabled={busy || !doctorId}
            className="btn-primary text-sm"
          >
            {busy ? "Calculating…" : "Preview Calculation"}
          </button>
          {result && !result.committed && result.opsCount > 0 && (
            <button
              onClick={() => calculate(true)}
              disabled={committing}
              className="btn-secondary text-sm text-green-700 border-green-200 hover:bg-green-50"
            >
              {committing ? "Committing…" : `Commit to DB (${result.opsCount} row${result.opsCount !== 1 ? "s" : ""})`}
            </button>
          )}
          {result?.committed && (
            <span className="text-sm text-green-600 self-center">✓ Committed to database</span>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
        )}
      </div>

      {/* Results */}
      {result && !error && (
        <div className="space-y-4">

          {/* Header */}
          <div className="card p-5 flex items-center justify-between flex-wrap gap-3">
            <div>
              <span className={`text-xs px-2 py-1 rounded font-medium ${CONTRACT_BADGE[result.contractType] ?? "bg-slate-100 text-slate-600"}`}>
                {CONTRACT_LABEL[result.contractType] ?? result.contractType}
              </span>
              <p className="text-xs text-slate-400 mt-1">{month}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase tracking-wider">Gross Target</p>
              <p className="text-3xl font-bold text-slate-900">{RM(result.grossCalculatedTarget)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Salary Slip */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-semibold text-slate-800 text-sm">Salary Slip</h2>
                {!hasSalarySlip && <span className="text-xs text-slate-400">(not applicable)</span>}
              </div>
              {hasSalarySlip && slip ? (
                <div className="space-y-0">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Earnings</p>
                  <StatRow label="Basic Salary"          value={slip.basic} />
                  <StatRow label="Performance Incentive" value={slip.performanceIncentive} />
                  <StatRow label="Gross"                 value={slip.basic + slip.performanceIncentive} highlight />

                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-4 mb-2">Employee Deductions</p>
                  <StatRow label="EPF (11%)"             value={slip.epfEmployee} />
                  <StatRow label="SOCSO (0.5%)"          value={slip.socsoEmployee} />
                  <StatRow label="EIS (0.2%)"            value={slip.eisEmployee} />
                  <StatRow label="Total Deductions"      value={totalStatutoryEmployee} highlight />

                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-4 mb-2">Employer Contributions (additional cost)</p>
                  <StatRow label="EPF Employer"          value={slip.epfEmployer} />
                  <StatRow label="SOCSO Employer"        value={slip.socsoEmployer} />
                  <StatRow label="EIS Employer"          value={slip.eisEmployer} />
                  <StatRow label="Total Employer Cost"   value={totalStatutoryEmployer} highlight />

                  <div className="mt-4 pt-3 border-t-2 border-slate-200 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-800">Net Take-Home</span>
                    <span className="text-xl font-bold text-green-700">{RM(slip.netSalary)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">This archetype does not generate a salary slip.</p>
              )}
            </div>

            {/* Service Voucher */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-semibold text-slate-800 text-sm">Professional Service Voucher</h2>
                {!hasVoucher && <span className="text-xs text-slate-400">(not applicable)</span>}
              </div>
              {hasVoucher && voucher ? (
                <div className="space-y-4">
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg text-center">
                    <p className="text-xs text-purple-500 uppercase tracking-wider mb-1">Professional Fees</p>
                    <p className="text-4xl font-bold text-purple-700">{RM(voucher.professionalFees)}</p>
                    <p className="text-xs text-purple-400 mt-1">No statutory deductions apply</p>
                  </div>
                  <p className="text-xs text-slate-400">
                    Disbursed as a service voucher / professional invoice. EPF, SOCSO, and EIS are not applicable to this portion.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-400">This archetype does not generate a service voucher.</p>
              )}
            </div>
          </div>

          {/* Type 4 combined statutory breakdown */}
          {result.contractType === "DUAL_SLIP_HYBRID" && slip && (
            <div className="card p-5 bg-amber-50 border border-amber-200">
              <h2 className="font-semibold text-slate-800 text-sm mb-3">
                Type 4 — Combined Statutory Burden Summary
              </h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "EPF (Employee + Employer)", value: slip.epfEmployee + slip.epfEmployer },
                  { label: "SOCSO (Employee + Employer)", value: slip.socsoEmployee + slip.socsoEmployer },
                  { label: "EIS (Employee + Employer)", value: slip.eisEmployee + slip.eisEmployer },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white rounded-lg p-3 border border-amber-200">
                    <p className="text-xs text-slate-500 mb-1">{label}</p>
                    <p className="font-bold text-slate-800">{RM(value)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between items-center text-sm font-semibold text-amber-800">
                <span>Total Statutory Burden (all parties)</span>
                <span>{RM(totalStatutoryEmployee + totalStatutoryEmployer)}</span>
              </div>
            </div>
          )}

          {/* Conservation check */}
          <div className="card p-4 bg-slate-50 text-xs text-slate-500 flex justify-between">
            <span>Conservation check: salary slip gross + voucher</span>
            <span className="font-mono">
              {hasSalarySlip && slip ? RM(slip.basic + slip.performanceIncentive) : "RM 0.00"}
              {" + "}
              {hasVoucher && voucher ? RM(voucher.professionalFees) : "RM 0.00"}
              {" = "}
              <strong className="text-slate-700">
                {RM((hasSalarySlip && slip ? slip.basic + slip.performanceIncentive : 0) + (hasVoucher && voucher ? voucher.professionalFees : 0))}
              </strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
