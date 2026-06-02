import { requirePermission } from "@/lib/rbac";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import { generateJournal } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ExportButtons } from "./ExportButtons";

function fmt(n: number) {
  return n === 0 ? "—" : n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: { month?: string; clinicId?: string };
}) {
  await requirePermission("ledger:view");

  const month    = searchParams.month    ?? new Date().toISOString().slice(0, 7);
  const clinicId = searchParams.clinicId ?? getSelectedClinicId();

  const [rows, clinics] = await Promise.all([
    generateJournal(month, clinicId),
    prisma.clinic.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const salesRows   = rows.filter(r => r.module === "Sales");
  const receiptRows = rows.filter(r => r.module === "Sales-Receipt");
  const salesTotal   = salesRows.reduce((s, r) => s + r.amount, 0);
  const receiptTotal = receiptRows.reduce((s, r) => s + r.amount, 0);

  const COL_HEADERS = ["Code","Branch","Amount","Description","Month","YA Year","Perd","Module","Code","Sub-Code"];

  function TableSection({ title, data, total }: { title: string; data: typeof rows; total: number }) {
    if (data.length === 0) return null;
    return (
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide underline">{title}</h2>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                {COL_HEADERS.map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap border-r border-slate-200 last:border-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i} className={`border-b border-slate-100 hover:bg-blue-50 ${
                  r.entryType === "SHORTAGE" ? "bg-red-50" :
                  r.entryType === "PETTY_CASH" ? "bg-yellow-50" : ""
                }`}>
                  <td className="px-3 py-1.5 text-blue-700 font-semibold border-r border-slate-100">{r.code}</td>
                  <td className="px-3 py-1.5 text-slate-700 border-r border-slate-100">{r.branch}</td>
                  <td className="px-3 py-1.5 text-right text-slate-900 border-r border-slate-100">{fmt(r.amount)}</td>
                  <td className="px-3 py-1.5 text-slate-800 border-r border-slate-100">{r.description}</td>
                  <td className="px-3 py-1.5 text-slate-600 border-r border-slate-100 whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-1.5 text-slate-500 border-r border-slate-100">{r.yaYear}</td>
                  <td className="px-3 py-1.5 text-center text-slate-500 border-r border-slate-100">{r.period}</td>
                  <td className="px-3 py-1.5 text-slate-600 border-r border-slate-100">{r.module}</td>
                  <td className="px-3 py-1.5 text-slate-500 border-r border-slate-100">{r.accountCode}</td>
                  <td className="px-3 py-1.5 text-slate-400">{r.subCode}</td>
                </tr>
              ))}
              {/* Total row */}
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                <td className="px-3 py-2" colSpan={2}>{data.length} entries</td>
                <td className="px-3 py-2 text-right text-slate-900">{fmt(total)}</td>
                <td colSpan={7} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/ledger" className="text-sm text-slate-500 hover:text-slate-700">← Ledger</Link>
          </div>
          <h1 className="page-title">Sales Journal</h1>
          <p className="text-sm text-slate-500 mt-0.5">{month} · {rows.length} entries</p>
        </div>
        <div className="flex items-center gap-2">
          <form className="flex items-center gap-2">
            <select name="clinicId" defaultValue={clinicId ?? ""} className="form-input w-auto text-sm">
              <option value="">All Branches</option>
              {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="month" name="month" defaultValue={month} className="form-input w-auto" />
            <button type="submit" className="btn-outline">Apply</button>
          </form>
          <ExportButtons month={month} clinicId={clinicId} />
          <Link href="/config/account-codes" className="btn-ghost text-xs">⚙ Account Codes</Link>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block" /> Shortage / variance</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-200 inline-block" /> Petty cash</span>
      </div>

      {rows.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          No ledger entries for {month}. Make sure daily ledger data exists.
        </div>
      ) : (
        <>
          <TableSection title="SALES" data={salesRows} total={salesTotal} />
          <TableSection title="RECEIPTS (SALES-RECEIPT)" data={receiptRows} total={receiptTotal} />

          {/* Grand summary */}
          <div className="card p-4 bg-blue-50 border-blue-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-blue-900">Grand Total</span>
              <div className="flex gap-8 text-sm">
                <div><span className="text-blue-600 mr-2">Sales:</span><span className="font-mono font-bold text-blue-900">MYR {salesTotal.toFixed(2)}</span></div>
                <div><span className="text-blue-600 mr-2">Receipts:</span><span className="font-mono font-bold text-blue-900">MYR {receiptTotal.toFixed(2)}</span></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
