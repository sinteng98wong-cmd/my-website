"use client";

import { useState } from "react";
import Link from "next/link";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface CompanyRow {
  id: string;
  legalName: string;
  name: string | null;
  tradingName: string | null;
  registrationNo: string | null;
  financialYearStartMonth: number;
  sstRegistered: boolean;
  eInvoiceEnabled: boolean;
  isActive: boolean;
  clinicCount: number;
}

interface Props {
  initial: CompanyRow[];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function getFYLabel(month: number): string {
  if (month === 1) return "Jan-Dec";
  const start = MONTH_NAMES[month - 1];
  const endMonth = month === 1 ? 12 : month - 1;
  const end = MONTH_NAMES[endMonth - 1];
  return `${start}-${end}`;
}

export function CompaniesClient({ initial }: Props) {
  const [showInactive, setShowInactive] = useState(false);

  const companies = initial.filter((c) => showInactive || c.isActive);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">Companies</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show inactive
          </label>
          <Link href="/admin/companies/new" className="btn-primary text-sm px-4 py-2">
            + Add Company
          </Link>
        </div>
      </div>

      {companies.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg font-medium">No companies found</p>
          <p className="text-sm mt-1">Add your first company to get started.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {companies.map((company) => (
          <div key={company.id} className={`card p-5 flex flex-col gap-3 ${!company.isActive ? "opacity-60" : ""}`}>
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {getInitials(company.name ?? company.legalName)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 text-sm truncate">{company.legalName}</p>
                {company.tradingName && (
                  <p className="text-xs text-slate-500 truncate">t/a {company.tradingName}</p>
                )}
              </div>
            </div>

            {/* Reg No */}
            {company.registrationNo && (
              <p className="text-xs text-slate-500">SSM: {company.registrationNo}</p>
            )}

            {/* Badges row 1 */}
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                {company.clinicCount} clinic{company.clinicCount !== 1 ? "s" : ""}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                FY: {getFYLabel(company.financialYearStartMonth)}
              </span>
            </div>

            {/* Badges row 2 */}
            <div className="flex flex-wrap gap-1.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                company.sstRegistered ? "badge-green" : "bg-slate-100 text-slate-400"
              }`}>
                SST {company.sstRegistered ? "Registered" : "N/A"}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                company.eInvoiceEnabled ? "badge-blue" : "bg-slate-100 text-slate-400"
              }`}>
                e-Invoice {company.eInvoiceEnabled ? "On" : "Off"}
              </span>
              {!company.isActive && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium badge-red">
                  Inactive
                </span>
              )}
            </div>

            {/* Action */}
            <div className="pt-1 border-t border-slate-100">
              <Link
                href={`/admin/companies/${company.id}`}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Manage &rarr;
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
