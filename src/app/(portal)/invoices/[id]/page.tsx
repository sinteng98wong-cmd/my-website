import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { notDeleted } from "@/lib/soft-delete";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { TreatmentFailureRefundButton } from "@/components/TreatmentFailureRefundButton";

function fmt(n: number | string) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
}

const METHOD_LABELS: Record<string, string> = {
  CASH_CURRENT: "Cash", CASH_NEXT: "Cash (Next Month)",
  CREDIT_CARD: "Credit Card", FPX: "FPX",
  EWALLET: "e-Wallet", ATOME: "Atome", PANEL: "Panel",
};
const METHOD_CLASS: Record<string, string> = {
  CASH_CURRENT: "badge-green", CASH_NEXT: "badge-green",
  CREDIT_CARD: "badge-blue", FPX: "badge-blue",
  EWALLET: "badge-blue", ATOME: "badge-amber", PANEL: "badge-slate",
};

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  await requirePermission("invoice:manage");
  const session  = await getServerSession(authOptions);
  const userRole = (session?.user as any)?.role as string ?? "";
  const canRefund = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(userRole);

  const invoice = await prisma.invoice.findUnique({
    where: notDeleted({ id: params.id }),
    include: {
      payments: { include: { panelProvider: { select: { name: true } } } },
      visit: {
        include: {
          patient: { include: { homeClinic: true } },
          treatments: {
            include: {
              treatmentType: true,
              doctor: { include: { user: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  if (!invoice) notFound();

  const { visit }  = invoice;
  const patient    = visit.patient;

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <Link href={`/patients/${patient.id}?tab=visits`} className="text-sm text-slate-500 hover:text-slate-700">
          ← {patient.name}
        </Link>
        <Link href="/invoices" className="text-sm text-slate-500 hover:text-slate-700">All Invoices</Link>
      </div>

      <div className="card p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center">
                <span className="text-white font-bold text-xs">D</span>
              </div>
              <span className="font-semibold text-slate-900">DentalOS</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">{patient.homeClinic.name}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-slate-900">{invoice.invoiceRef}</p>
            <p className="text-xs text-slate-500 mt-1">
              {new Date(invoice.createdAt).toLocaleDateString("en-MY", { dateStyle: "long" })}
            </p>
            <span className={`mt-2 inline-block ${invoice.collectedAt ? "badge-green" : "badge-amber"}`}>
              {invoice.collectedAt ? "Paid" : "Pending Payment"}
            </span>
          </div>
        </div>

        {/* Patient info */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Bill To</p>
            <p className="text-sm font-semibold text-slate-900">{patient.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{patient.patientRef}</p>
            {(patient.icNumber ?? patient.passportNo) && (
              <p className="text-xs text-slate-500">{patient.icNumber ?? patient.passportNo}</p>
            )}
            {patient.phone && <p className="text-xs text-slate-500">{patient.phone}</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Visit</p>
            <p className="text-sm text-slate-900">
              {new Date(visit.visitDate).toLocaleDateString("en-MY", { dateStyle: "long" })}
            </p>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{visit.visitRef}</p>
            <p className="text-xs text-slate-500 mt-0.5">{patient.homeClinic.name}</p>
          </div>
        </div>

        {/* Treatments */}
        <div className="mb-6">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Items</p>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Treatment</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Doctor</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visit.treatments.map(t => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-900">{t.treatmentType.name}</td>
                    <td className="px-4 py-3 text-slate-500">{t.doctor?.user.name ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(Number(t.billedAmount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-56 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-mono text-slate-900">{fmt(Number(invoice.subtotal))}</span>
            </div>
            {Number(invoice.sst) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">SST (6%)</span>
                <span className="font-mono text-slate-900">{fmt(Number(invoice.sst))}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold pt-2 border-t border-slate-200">
              <span className="text-slate-900">Total</span>
              <span className="font-mono text-slate-900">{fmt(Number(invoice.total))}</span>
            </div>
          </div>
        </div>

        {/* Payment lines */}
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Payment</p>
          <div className="space-y-2">
            {invoice.payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`${METHOD_CLASS[p.method] ?? "badge-slate"}`}>
                    {p.method === "PANEL" && p.panelProvider
                      ? `Panel — ${p.panelProvider.name}`
                      : METHOD_LABELS[p.method] ?? p.method}
                  </span>
                  {p.collectedAt && (
                    <span className="text-xs text-slate-400">
                      {new Date(p.collectedAt).toLocaleDateString("en-MY", { dateStyle: "medium" })}
                    </span>
                  )}
                </div>
                <span className="font-mono font-semibold">{fmt(Number(p.amount))}</span>
              </div>
            ))}
          </div>
          {invoice.collectedAt && (
            <p className="text-xs text-slate-400 mt-3">
              Settled: {new Date(invoice.collectedAt).toLocaleDateString("en-MY", { dateStyle: "medium" })}
            </p>
          )}
        </div>

        <p className="text-xs text-slate-400 text-center mt-6">
          Thank you for choosing {patient.homeClinic.name}
        </p>

        {/* Treatment failure refund — only for paid invoices, managers only */}
        {canRefund && invoice.collectedAt && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
              Actions
            </p>
            <TreatmentFailureRefundButton
              patientId={patient.id}
              patientName={patient.name}
              clinicId={patient.homeClinicId}
              invoiceId={invoice.id}
              invoiceRef={invoice.invoiceRef}
              invoiceTotal={Number(invoice.total)}
              invoiceDate={invoice.createdAt.toISOString()}
            />
          </div>
        )}
      </div>
    </div>
  );
}
