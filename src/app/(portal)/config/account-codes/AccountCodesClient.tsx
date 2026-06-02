"use client";

import { useState } from "react";
import Link from "next/link";

type Row = { entryType: string; accountCode: string; subCode: string; description: string; module: string; sortOrder: number; isOverridden: boolean };
type Clinic = { id: string; name: string };

const MODULE_LABELS: Record<string, string> = { "Sales": "Sales", "Sales-Receipt": "Sales-Receipt" };

export function AccountCodesClient({
  rows, clinics, clinicOverrides,
}: {
  rows: Row[];
  clinics: Clinic[];
  clinicOverrides: any[];
}) {
  const [data, setData]   = useState<Row[]>(rows);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved]   = useState<string | null>(null);
  const [error, setError]   = useState("");

  async function saveRow(row: Row) {
    setSaving(row.entryType); setError("");
    const res = await fetch("/api/config/account-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...row, clinicId: null }),
    });
    setSaving(null);
    if (!res.ok) { setError("Save failed"); return; }
    setSaved(row.entryType);
    setTimeout(() => setSaved(null), 1500);
    setData(prev => prev.map(r => r.entryType === row.entryType ? { ...row, isOverridden: true } : r));
  }

  function update(entryType: string, field: keyof Row, value: string) {
    setData(prev => prev.map(r => r.entryType === entryType ? { ...r, [field]: value } : r));
  }

  const salesRows   = data.filter(r => r.module === "Sales");
  const receiptRows = data.filter(r => r.module === "Sales-Receipt");

  function CodeTable({ title, rows }: { title: string; rows: Row[] }) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-2 uppercase tracking-wide text-blue-700">{title}</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Entry Type","Account Code","Sub-Code","Description","Module","Status",""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.entryType} className="table-row">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{row.entryType}</td>
                  <td className="px-4 py-2.5">
                    <input
                      value={row.accountCode}
                      onChange={e => update(row.entryType, "accountCode", e.target.value)}
                      className="form-input font-mono text-sm w-24"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      value={row.subCode}
                      onChange={e => update(row.entryType, "subCode", e.target.value)}
                      placeholder="—"
                      className="form-input font-mono text-sm w-20"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      value={row.description}
                      onChange={e => update(row.entryType, "description", e.target.value)}
                      className="form-input text-sm w-64"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={row.module}
                      onChange={e => update(row.entryType, "module", e.target.value)}
                      className="form-input text-sm w-36"
                    >
                      <option value="Sales">Sales</option>
                      <option value="Sales-Receipt">Sales-Receipt</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    {row.isOverridden
                      ? <span className="badge-blue">Custom</span>
                      : <span className="badge-slate">Default</span>
                    }
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => saveRow(row)}
                      disabled={saving === row.entryType}
                      className="btn-primary text-xs py-1 px-3"
                    >
                      {saving === row.entryType ? "…" : saved === row.entryType ? "✓ Saved" : "Save"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/config" className="text-sm text-slate-500 hover:text-slate-700">← Config</Link>
          <h1 className="page-title mt-2">Account Code Configuration</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Customise account codes for the sales journal export. Changes apply globally (all branches).
          </p>
        </div>
        <Link href="/ledger/journal" className="btn-outline">View Journal →</Link>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}

      <CodeTable title="Sales Lines" rows={salesRows} />
      <CodeTable title="Receipt Lines (Sales-Receipt)" rows={receiptRows} />

      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
        <strong>Tip:</strong> The full account code shown in the journal is <code>AccountCode-SubCode</code> (e.g. 3010-100).
        Leave Sub-Code blank to show just the account code (e.g. 5001).
        These codes match your accounting software's chart of accounts.
      </div>
    </div>
  );
}
