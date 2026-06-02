import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import Link from "next/link";

function fmt(n: number | string) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(Number(n));
}

export default async function LabReconcilePage({
  searchParams,
}: {
  searchParams: { month?: string; vendorId?: string };
}) {
  await requirePermission("ledger:view");
  const clinicId = getSelectedClinicId();

  const month  = searchParams.month ?? new Date().toISOString().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const from   = new Date(y, m - 1, 1);
  const to     = new Date(y, m, 1);

  const [jobs, vendors] = await Promise.all([
    prisma.labJob.findMany({
      where: {
        ...(clinicId  ? { clinicId }              : {}),
        ...(searchParams.vendorId ? { vendorId: searchParams.vendorId } : {}),
        createdAt: { gte: from, lt: to },
      },
      include: {
        vendor:  true,
        clinic:  { select: { name: true } },
        visit:   { include: { patient: { select: { name: true, patientRef: true } } } },
        treatments: { include: { treatmentType: { select: { name: true } } } },
      },
      orderBy: [{ vendorId: "asc" }, { createdAt: "asc" }],
    }),
    prisma.labVendor.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  // Group by vendor
  const byVendor: Record<string, { vendor: any; jobs: typeof jobs }> = {};
  for (const j of jobs) {
    if (!byVendor[j.vendorId]) byVendor[j.vendorId] = { vendor: j.vendor, jobs: [] };
    byVendor[j.vendorId].jobs.push(j);
  }

  // Totals
  const totalEstimated = jobs.reduce((s, j) => s + Number(j.estimatedFee), 0);
  const totalInvoiced  = jobs.reduce((s, j) => s + Number(j.invoiceAmount ?? 0), 0);
  const totalPaid      = jobs.filter(j => j.paidToVendor).reduce((s, j) => s + Number(j.invoiceAmount ?? 0), 0);
  const totalUnpaid    = totalInvoiced - totalPaid;
  const variance       = totalInvoiced - totalEstimated;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/lab" className="text-sm text-slate-500 hover:text-slate-700">← Lab Work</Link>
          <h1 className="page-title mt-2">Lab Fee Reconciliation</h1>
          <p className="text-sm text-slate-500 mt-0.5">{month}</p>
        </div>
        <form className="flex items-center gap-2">
          <input type="month" name="month" defaultValue={month} className="form-input w-auto" />
          <select name="vendorId" defaultValue={searchParams.vendorId ?? ""} className="form-input w-auto">
            <option value="">All Vendors</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button type="submit" className="btn-primary">Filter</button>
        </form>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Estimated",  value: fmt(totalEstimated), sub: `${jobs.length} jobs` },
          { label: "Total Invoiced",   value: fmt(totalInvoiced),  sub: jobs.filter(j => j.invoiceAmount).length + " with invoice" },
          { label: "Paid to Vendors",  value: fmt(totalPaid),      sub: jobs.filter(j => j.paidToVendor).length + " paid" },
          { label: "Outstanding",      value: fmt(totalUnpaid),    sub: variance > 0 ? `+${fmt(variance)} over est.` : `${fmt(variance)} under est.`, warn: totalUnpaid > 0 },
        ].map((c) => (
          <div key={c.label} className="stat-card">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-xl font-semibold mt-1 ${c.warn ? "text-amber-600" : "text-slate-900"}`}>{c.value}</p>
            <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Per-vendor reconciliation */}
      {Object.values(byVendor).map(({ vendor, jobs: vjobs }) => {
        const vEstimated = vjobs.reduce((s, j) => s + Number(j.estimatedFee), 0);
        const vInvoiced  = vjobs.reduce((s, j) => s + Number(j.invoiceAmount ?? 0), 0);
        const vPaid      = vjobs.filter(j => j.paidToVendor).reduce((s, j) => s + Number(j.invoiceAmount ?? 0), 0);
        const vUnpaid    = vInvoiced - vPaid;
        const vVariance  = vInvoiced - vEstimated;

        return (
          <div key={vendor.id} className="card mb-4">
            {/* Vendor header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200 bg-slate-50 rounded-t-lg">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{vendor.name}</h2>
                <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                  {vendor.contactName && <span>{vendor.contactName}</span>}
                  {vendor.phone && <span>{vendor.phone}</span>}
                  {vendor.email && <span>{vendor.email}</span>}
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <p className="text-xs text-slate-500">Estimated</p>
                  <p className="font-medium text-slate-900">{fmt(vEstimated)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Invoiced</p>
                  <p className="font-medium text-slate-900">{fmt(vInvoiced)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Variance</p>
                  <p className={`font-medium ${vVariance > 0 ? "text-red-600" : vVariance < 0 ? "text-green-600" : "text-slate-900"}`}>
                    {vVariance >= 0 ? "+" : ""}{fmt(vVariance)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Unpaid</p>
                  <p className={`font-semibold ${vUnpaid > 0 ? "text-amber-600" : "text-slate-900"}`}>{fmt(vUnpaid)}</p>
                </div>
              </div>
            </div>

            {/* Jobs table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Ref","Patient","Work","Clinic","Est. Fee","Inv. No.","Inv. Date","Actual Fee","Variance","Payment"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vjobs.map((j) => {
                  const diff = j.invoiceAmount ? Number(j.invoiceAmount) - Number(j.estimatedFee) : null;
                  return (
                    <tr key={j.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-blue-600">
                        <Link href={`/lab/${j.id}`}>{j.labJobRef}</Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-slate-900">{j.visit.patient.name}</p>
                        <p className="text-xs text-slate-400">{j.visit.patient.patientRef}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {j.workDescription ?? j.treatments.map((t: any) => t.treatmentType.name).join(", ")}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{j.clinic.name}</td>
                      <td className="px-4 py-2.5 font-mono">{fmt(Number(j.estimatedFee))}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{j.invoiceNumber ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {j.invoiceDate ? new Date(j.invoiceDate).toLocaleDateString("en-MY",{dateStyle:"short"}) : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold">
                        {j.invoiceAmount ? fmt(Number(j.invoiceAmount)) : <span className="text-slate-400 font-normal text-xs">Pending</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {diff !== null ? (
                          <span className={diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : "text-slate-400"}>
                            {diff >= 0 ? "+" : ""}{fmt(diff)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {j.paidToVendor ? (
                          <span className="badge-green">
                            Paid {j.paidDate ? new Date(j.paidDate).toLocaleDateString("en-MY",{dateStyle:"short"}) : ""}
                          </span>
                        ) : j.invoiceAmount ? (
                          <span className="badge-amber">Unpaid</span>
                        ) : (
                          <span className="badge-slate">No invoice</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Vendor subtotal */}
              <tfoot>
                <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                  <td className="px-4 py-2.5 text-slate-700" colSpan={4}>Subtotal — {vjobs.length} jobs</td>
                  <td className="px-4 py-2.5 font-mono">{fmt(vEstimated)}</td>
                  <td colSpan={2} />
                  <td className="px-4 py-2.5 font-mono text-blue-700">{fmt(vInvoiced)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    <span className={vVariance > 0 ? "text-red-600" : vVariance < 0 ? "text-green-600" : "text-slate-400"}>
                      {vVariance >= 0 ? "+" : ""}{fmt(vVariance)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={vUnpaid > 0 ? "text-amber-600 font-medium" : "text-green-600"}>
                      {vUnpaid > 0 ? `${fmt(vUnpaid)} unpaid` : "All paid"}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}

      {Object.keys(byVendor).length === 0 && (
        <div className="card p-12 text-center text-slate-400">No lab jobs found for {month}</div>
      )}
    </div>
  );
}
