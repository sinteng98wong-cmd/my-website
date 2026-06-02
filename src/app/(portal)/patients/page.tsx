import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import { notDeleted } from "@/lib/soft-delete";
import { PendingActions } from "./PendingActions";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: { q?: string; tab?: string; source?: string };
}) {
  await requirePermission("patient:manage");
  const clinicId = getSelectedClinicId();
  const { q, source } = searchParams;
  const tab = searchParams.tab === "pending" ? "pending" : "active";

  const baseWhere: any = {
    ...(clinicId ? { homeClinicId: clinicId } : {}),
    ...(source ? { sourceId: source } : {}),
    status: tab === "pending" ? "PENDING" : { not: "PENDING" },
    ...(q ? {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { patientRef: { contains: q } },
        { icNumber: { contains: q } },
        { passportNo: { contains: q } },
      ],
    } : {}),
  };

  const [patients, sources, pendingCount] = await Promise.all([
    prisma.patient.findMany({
      where: notDeleted(baseWhere),
      include: { homeClinic: { select: { name: true } }, source: { select: { name: true } }, visits: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.patientSource.findMany({ where: { isActive: true }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    prisma.patient.count({ where: notDeleted({ ...(clinicId ? { homeClinicId: clinicId } : {}), status: "PENDING" }) }),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Patients</h1>
          <p className="text-sm text-slate-500 mt-0.5">{patients.length} records</p>
        </div>
        <Link href="/patients/new" className="btn-primary">Register Patient</Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        <Link href="/patients" className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "active" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500"}`}>All Patients</Link>
        <Link href="/patients?tab=pending" className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${tab === "pending" ? "border-amber-500 text-amber-600" : "border-transparent text-slate-500"}`}>
          Pending Registration
          {pendingCount > 0 && <span className="bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
        </Link>
      </div>

      <form className="mb-4 flex gap-2">
        {tab === "pending" && <input type="hidden" name="tab" value="pending" />}
        <input name="q" defaultValue={q} placeholder="Search name, IC, passport or ref…" className="form-input max-w-sm" />
        <select name="source" defaultValue={source ?? ""} className="form-input w-44">
          <option value="">All sources</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="btn-outline">Filter</button>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Ref", "Name", "IC / Passport", "Clinic", "Source", "Visits", tab === "pending" ? "Actions" : "Registered"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">No records found</td></tr>
            )}
            {patients.map((p) => (
              <tr key={p.id} className="table-row">
                <td className="px-5 py-3 font-mono text-xs text-slate-400">{p.patientRef}</td>
                <td className="px-5 py-3">
                  <Link href={`/patients/${p.id}`} className="font-medium text-blue-600 hover:underline">{p.name}</Link>
                </td>
                <td className="px-5 py-3 text-slate-600">{p.icNumber ?? p.passportNo ?? "—"}</td>
                <td className="px-5 py-3 text-slate-600">{p.homeClinic.name}</td>
                <td className="px-5 py-3">
                  {p.source ? <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{p.source.name}</span> : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-5 py-3 text-slate-600">{p.visits.length}</td>
                <td className="px-5 py-3 text-slate-500">
                  {tab === "pending"
                    ? <PendingActions patientId={p.id} />
                    : new Date(p.createdAt).toLocaleDateString("en-MY", { dateStyle: "medium" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
