import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import { FileText, CheckCircle, Clock, ChevronRight } from "lucide-react";

function fmt(n: number | string) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
}

const METHOD_LABELS: Record<string, string> = {
  CASH_CURRENT: "Cash", CASH_NEXT: "Cash (Next)", CREDIT_CARD: "Card",
  FPX: "FPX", EWALLET: "eWallet", ATOME: "Atome", PANEL: "Panel",
};
const METHOD_CLASS: Record<string, string> = {
  CASH_CURRENT: "badge-green", CASH_NEXT: "badge-green",
  CREDIT_CARD: "badge-blue", FPX: "badge-blue",
  EWALLET: "badge-blue", ATOME: "badge-amber", PANEL: "badge-slate",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  await requirePermission("invoice:manage");

  const dateStr  = searchParams.date ?? new Date().toISOString().slice(0, 10);
  const date     = new Date(dateStr);
  const nextDay  = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  const clinicId = getSelectedClinicId();

  const invoices = await prisma.invoice.findMany({
    where: notDeleted({ createdAt: { gte: date, lt: nextDay }, ...(clinicId ? { visit: { clinicId } } : {}) }),
    include: {
      visit:    { include: { patient: { select: { name: true, patientRef: true } } } },
      payments: { include: { panelProvider: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const totalCollected = invoices.filter(i => i.collectedAt).reduce((s, i) => s + Number(i.total), 0);
  const totalPending   = invoices.filter(i => !i.collectedAt).reduce((s, i) => s + Number(i.total), 0);
  const collectedCount = invoices.filter(i => i.collectedAt).length;

  return (
    <div>
      <div className="page-header">
        <div className="flex items-start gap-3">
          <div className="icon-box-indigo mt-0.5"><FileText size={20} /></div>
          <div>
            <h1 className="page-title">Invoices</h1>
            <p className="text-sm text-slate-500 mt-0.5">{invoices.length} invoices on {dateStr}</p>
          </div>
        </div>
        <form className="flex items-center gap-2">
          <input type="date" name="date" defaultValue={dateStr} className="form-input w-auto" />
          <button type="submit" className="btn-outline">View</button>
        </form>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="stat-card flex items-start gap-3">
            <div className="icon-box-green"><CheckCircle size={20} /></div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Collected</p>
              <p className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums">{fmt(totalCollected)}</p>
              <p className="text-xs text-slate-400">{collectedCount} invoices</p>
            </div>
          </div>
          <div className="stat-card flex items-start gap-3">
            <div className="icon-box-amber"><Clock size={20} /></div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Pending</p>
              <p className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums">{fmt(totalPending)}</p>
              <p className="text-xs text-slate-400">{invoices.length - collectedCount} invoices</p>
            </div>
          </div>
          <div className="stat-card flex items-start gap-3">
            <div className="icon-box-blue"><FileText size={20} /></div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Revenue</p>
              <p className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums">
                {fmt(invoices.reduce((s, i) => s + Number(i.total), 0))}
              </p>
              <p className="text-xs text-slate-400">{invoices.length} invoices</p>
            </div>
          </div>
        </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Ref","Patient","Subtotal","SST","Total","Payment","Status"].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-state-icon"><FileText size={24} /></div>
                    <p className="font-medium text-slate-700">No invoices on this date</p>
                    <p className="text-sm text-slate-400">Try selecting a different date</p>
                  </div>
                </td>
              </tr>
            )}
            {invoices.map(inv => (
              <tr key={inv.id} className="table-row">
                <td className="px-5 py-3">
                  <Link href={`/invoices/${inv.id}`} className="font-mono text-xs text-blue-600 hover:underline flex items-center gap-1">
                    {inv.invoiceRef}
                    <ChevronRight size={12} />
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-900">{inv.visit.patient.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{inv.visit.patient.patientRef}</p>
                </td>
                <td className="px-5 py-3 text-slate-600 tabular-nums">{fmt(Number(inv.subtotal))}</td>
                <td className="px-5 py-3 text-slate-500 tabular-nums">{fmt(Number(inv.sst))}</td>
                <td className="px-5 py-3 font-semibold text-slate-900 tabular-nums">{fmt(Number(inv.total))}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {inv.payments.map((p, i) => (
                      <span key={i} className={`${METHOD_CLASS[p.method] ?? "badge-slate"}`}>
                        {p.method === "PANEL" && p.panelProvider
                          ? p.panelProvider.name
                          : METHOD_LABELS[p.method] ?? p.method}
                        {inv.payments.length > 1 && ` ${fmt(Number(p.amount))}`}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3">
                  {inv.collectedAt
                    ? <span className="badge-green">Collected</span>
                    : <span className="badge-amber">Pending</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
