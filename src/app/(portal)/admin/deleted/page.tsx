import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { RestoreButtons } from "./RestoreButtons";

const DELETED = { deletedAt: { not: null } } as any;

function fmt(n: number | string) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
}
function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-MY", { dateStyle: "medium" });
}

export default async function DeletedRecordsPage() {
  await requirePermission("admin:manage");

  const [patients, visits, invoices] = await Promise.all([
    prisma.patient.findMany({
      where:   DELETED,
      select:  { id: true, name: true, patientRef: true, deletedAt: true },
      orderBy: { deletedAt: "desc" },
      take:    200,
    }),
    prisma.visit.findMany({
      where:   DELETED,
      select:  { id: true, visitRef: true, visitDate: true, deletedAt: true, patient: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
      take:    200,
    }),
    prisma.invoice.findMany({
      where:   DELETED,
      select:  { id: true, invoiceRef: true, total: true, deletedAt: true, visit: { select: { visitRef: true, patient: { select: { name: true } } } } },
      orderBy: { deletedAt: "desc" },
      take:    200,
    }),
  ]);

  const total = patients.length + visits.length + invoices.length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Deleted Records</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {total} soft-deleted record{total !== 1 ? "s" : ""} — Super Admin only
        </p>
      </div>

      {total === 0 && (
        <div className="card p-12 text-center text-slate-400">No deleted records</div>
      )}

      {/* Patients */}
      {patients.length > 0 && (
        <div className="card mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-red-50">
            <h2 className="text-sm font-semibold text-red-800">Deleted Patients ({patients.length})</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Ref","Name","Deleted On",""].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patients.map(p => (
                <tr key={p.id} className="table-row">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{p.patientRef}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(p.deletedAt!)}</td>
                  <td className="px-5 py-3 text-right">
                    <RestoreButtons type="patient" id={p.id} label={p.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Visits */}
      {visits.length > 0 && (
        <div className="card mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-amber-50">
            <h2 className="text-sm font-semibold text-amber-800">Deleted Visits ({visits.length})</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Visit Ref","Patient","Visit Date","Deleted On",""].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visits.map(v => (
                <tr key={v.id} className="table-row">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{v.visitRef}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">{v.patient.name}</td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(v.visitDate)}</td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(v.deletedAt!)}</td>
                  <td className="px-5 py-3 text-right">
                    <RestoreButtons type="visit" id={v.id} label={v.visitRef} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-700">Deleted Invoices ({invoices.length})</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                {["Invoice Ref","Patient","Total","Deleted On",""].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(i => (
                <tr key={i.id} className="table-row">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{i.invoiceRef}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">{i.visit.patient.name}</td>
                  <td className="px-5 py-3 font-semibold">{fmt(Number(i.total))}</td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(i.deletedAt!)}</td>
                  <td className="px-5 py-3 text-right">
                    <RestoreButtons type="invoice" id={i.id} label={i.invoiceRef} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
