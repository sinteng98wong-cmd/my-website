import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { format } from "date-fns";

const RM = (n: number) => new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
const TYPE_LABEL: Record<string, string> = { PATIENT: "Patient Referral", INTERNAL_DOCTOR: "Doctor Referral", INTERNAL_CLINIC: "Clinic Referral", EXTERNAL: "External Referral" };

export default async function CommissionDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!["SUPER_ADMIN", "FINANCE"].includes((session?.user as any)?.role)) redirect("/dashboard");

  const c = await prisma.referralCommission.findUnique({
    where: { id: params.id },
    include: {
      patient: { select: { id: true, name: true, patientRef: true, source: { select: { name: true } } } },
      doctor:  { select: { name: true } },
      clinic:  { select: { name: true } },
      basedOnInvoice: { select: { id: true, invoiceRef: true, total: true } },
      approvedBy: { select: { name: true } },
      paidBy: { select: { name: true } },
    },
  });
  if (!c) notFound();

  const referrer = c.doctor?.name ?? c.clinic?.name ?? c.externalName ?? "—";
  const steps = ["PENDING", "APPROVED", "PAID"];
  const stepIdx = c.status === "VOIDED" ? -1 : steps.indexOf(c.status);

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/reports/referral-commissions" className="text-sm text-slate-500 hover:text-slate-700">← Referral Commissions</Link>

      <div className="card p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{RM(Number(c.calculatedAmount))}</h1>
            <p className="text-sm text-slate-500">{TYPE_LABEL[c.referralType]}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded ${c.status === "VOIDED" ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-700"}`}>{c.status}</span>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-5 text-sm">
          <div>
            <p className="text-xs text-slate-400 uppercase">Patient</p>
            <Link href={`/patients/${c.patient.id}`} className="text-blue-600 hover:underline">{c.patient.name}</Link>
            <p className="text-xs text-slate-400">{c.patient.patientRef} · Source: {c.patient.source?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase">Referrer</p>
            <p className="text-slate-700">{referrer}</p>
            {c.externalPhone && <p className="text-xs text-slate-400">{c.externalPhone}</p>}
          </div>
        </div>
      </div>

      {/* Calculation */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-800 mb-3">Calculation</h2>
        {c.commissionType === "PERCENTAGE" ? (
          <p className="text-sm text-slate-600">
            Invoice {c.basedOnInvoice?.invoiceRef} total {RM(Number(c.basedOnInvoice?.total ?? 0))} × {Number(c.rate)}% =
            <span className="font-semibold"> {RM(Number(c.calculatedAmount))}</span>
          </p>
        ) : (
          <p className="text-sm text-slate-600">Flat rate: <span className="font-semibold">{RM(Number(c.rate))}</span></p>
        )}
      </div>

      {/* Timeline */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-800 mb-4">Status</h2>
        {c.status === "VOIDED" ? (
          <p className="text-sm text-red-600">Voided. Reason: {c.notes ?? "—"}</p>
        ) : (
          <div className="flex items-center">
            {steps.map((s, i) => (
              <div key={s} className={`flex items-center ${i < steps.length - 1 ? "flex-1" : ""}`}>
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${i <= stepIdx ? "bg-blue-600" : "bg-slate-300"}`} />
                  <span className={`text-xs mt-1 ${i <= stepIdx ? "text-blue-700" : "text-slate-400"}`}>{s}</span>
                </div>
                {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < stepIdx ? "bg-blue-500" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 text-xs text-slate-500 space-y-1">
          {c.approvedBy && <p>Approved by {c.approvedBy.name} {c.approvedAt && `on ${format(new Date(c.approvedAt), "d MMM yyyy")}`}</p>}
          {c.paidBy && <p>Paid by {c.paidBy.name} {c.paidAt && `on ${format(new Date(c.paidAt), "d MMM yyyy")}`}{c.paymentRef && ` · Ref: ${c.paymentRef}`}</p>}
        </div>
      </div>
    </div>
  );
}
