import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import Link from "next/link";

function fmt(n: number | string) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
}

const STATUS_STEPS = ["ORDERED","SENT_TO_LAB","RECEIVED","FITTED"] as const;
const STATUS_LABEL: Record<string, string> = {
  ORDERED: "Ordered", SENT_TO_LAB: "Sent to Lab",
  RECEIVED: "Received", FITTED: "Fitted",
};
const STATUS_CLASS: Record<string, string> = {
  ORDERED: "badge-slate", SENT_TO_LAB: "badge-blue",
  RECEIVED: "badge-amber", FITTED: "badge-green",
};

export default async function LabPage({
  searchParams,
}: {
  searchParams: { status?: string; month?: string };
}) {
  const session  = await getServerSession(authOptions);
  const clinicId = getSelectedClinicId();
  const month    = searchParams.month ?? new Date().toISOString().slice(0, 7);
  const status   = searchParams.status;
  const [y, m]   = month.split("-").map(Number);
  const from     = new Date(y, m - 1, 1);
  const to       = new Date(y, m, 1);

  const jobs = await prisma.labJob.findMany({
    where: {
      ...(clinicId ? { clinicId } : {}),
      ...(status ? { status: status as import("@prisma/client").LabJobStatus } : {}),
      createdAt: { gte: from, lt: to },
    },
    include: {
      vendor:  { select: { name: true } },
      clinic:  { select: { name: true } },
      visit:   { include: { patient: { select: { id: true, name: true, patientRef: true } } } },
      treatments: { include: { treatmentType: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Stats
  const totalEstimated = jobs.reduce((s, j) => s + Number(j.estimatedFee), 0);
  const totalInvoiced  = jobs.filter(j => j.invoiceAmount).reduce((s, j) => s + Number(j.invoiceAmount), 0);
  const totalPaid      = jobs.filter(j => j.paidToVendor).reduce((s, j) => s + Number(j.invoiceAmount ?? 0), 0);
  const pending        = jobs.filter(j => j.status !== "FITTED").length;
  const invoicePending = jobs.filter(j => j.status === "RECEIVED" && !j.invoiceAmount).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Lab Work</h1>
          <p className="text-sm text-slate-500 mt-0.5">{month}</p>
        </div>
        <div className="flex items-center gap-2">
          <form className="flex items-center gap-2">
            <input type="month" name="month" defaultValue={month} className="form-input w-auto" />
            <select name="status" defaultValue={status ?? ""} className="form-input w-auto">
              <option value="">All Status</option>
              {STATUS_STEPS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button type="submit" className="btn-primary">Filter</button>
          </form>
          <Link href="/lab/reconcile" className="btn-outline">Reconcile →</Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {[
          { label: "Total Jobs",        value: jobs.length.toString() },
          { label: "In Progress",       value: pending.toString(), warn: pending > 0 },
          { label: "Awaiting Invoice",  value: invoicePending.toString(), warn: invoicePending > 0 },
          { label: "Total Estimated",   value: fmt(totalEstimated) },
          { label: "Invoiced (Actual)", value: fmt(totalInvoiced) },
        ].map((c) => (
          <div key={c.label} className="stat-card">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-xl font-semibold mt-1 ${c.warn ? "text-amber-600" : "text-slate-900"}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Ref","Patient","Work","Vendor","Clinic","Est. Fee","Invoice","Status","Progress","Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr><td colSpan={10} className="px-5 py-8 text-center text-slate-400">No lab jobs found</td></tr>
            )}
            {jobs.map((j) => {
              const step = STATUS_STEPS.indexOf(j.status as any);
              return (
                <tr key={j.id} className="table-row">
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{j.labJobRef}</td>
                  <td className="px-4 py-3">
                    <Link href={`/patients/${j.visit.patient.id}`} className="font-medium text-blue-600 hover:underline">
                      {j.visit.patient.name}
                    </Link>
                    <p className="text-xs text-slate-400">{j.visit.patient.patientRef}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {j.workDescription ?? j.treatments.map(t => t.treatmentType.name).join(", ")}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{j.vendor.name}</td>
                  <td className="px-4 py-3 text-slate-500">{j.clinic.name}</td>
                  <td className="px-4 py-3 font-mono">{fmt(Number(j.estimatedFee))}</td>
                  <td className="px-4 py-3">
                    {j.invoiceAmount ? (
                      <div>
                        <span className="font-mono font-semibold text-slate-900">{fmt(Number(j.invoiceAmount))}</span>
                        {j.paidToVendor && <span className="ml-1 badge-green text-xs">Paid</span>}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_CLASS[j.status] ?? "badge-slate"}>{STATUS_LABEL[j.status]}</span>
                  </td>
                  <td className="px-4 py-3">
                    {/* Progress dots */}
                    <div className="flex items-center gap-1">
                      {STATUS_STEPS.map((s, i) => (
                        <div key={s} className={`w-2 h-2 rounded-full ${i <= step ? "bg-blue-500" : "bg-slate-200"}`} title={STATUS_LABEL[s]} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/lab/${j.id}`} className="btn-ghost text-xs py-1 px-2">Manage →</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
