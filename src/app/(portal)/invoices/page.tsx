import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";

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

  const invoices = await prisma.invoice.findMany({
    where: notDeleted({ createdAt: { gte: date, lt: nextDay } }),
    include: {
      visit:    { include: { patient: { select: { name: true, patientRef: true } } } },
      payments: { include: { panelProvider: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="text-sm text-slate-500 mt-0.5">{invoices.length} invoices on {dateStr}</p>
        </div>
        <form className="flex items-center gap-2">
          <input type="date" name="date" defaultValue={dateStr} className="form-input w-auto" />
          <button type="submit" className="btn-outline">Filter</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Ref","Patient","Subtotal","SST","Total","Payment","Collected"].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">No records found</td></tr>
            )}
            {invoices.map(inv => (
              <tr key={inv.id} className="table-row">
                <td className="px-5 py-3 font-mono text-xs">
                  <Link href={`/invoices/${inv.id}`} className="text-blue-600 hover:underline">{inv.invoiceRef}</Link>
                </td>
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-900">{inv.visit.patient.name}</p>
                  <p className="text-xs text-slate-400">{inv.visit.patient.patientRef}</p>
                </td>
                <td className="px-5 py-3">{fmt(Number(inv.subtotal))}</td>
                <td className="px-5 py-3 text-slate-500">{fmt(Number(inv.sst))}</td>
                <td className="px-5 py-3 font-semibold">{fmt(Number(inv.total))}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {inv.payments.map((p, i) => (
                      <span key={i} className={`${METHOD_CLASS[p.method] ?? "badge-slate"} text-xs`}>
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
