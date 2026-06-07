import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import { notDeleted } from "@/lib/soft-delete";
import { PendingActions } from "./PendingActions";
import { UserPlus, Search, Users, Clock } from "lucide-react";

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

  const [patients, sources, pendingCount, totalCount] = await Promise.all([
    prisma.patient.findMany({
      where: notDeleted(baseWhere),
      include: { homeClinic: { select: { name: true } }, source: { select: { name: true } }, visits: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.patientSource.findMany({ where: { isActive: true }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    prisma.patient.count({ where: notDeleted({ ...(clinicId ? { homeClinicId: clinicId } : {}), status: "PENDING" }) }),
    prisma.patient.count({ where: notDeleted({ ...(clinicId ? { homeClinicId: clinicId } : {}), status: { not: "PENDING" } }) }),
  ]);

  return (
    <div>
      <div className="page-header">
        <div className="flex items-start gap-3">
          <div className="icon-box-blue mt-0.5"><Users size={20} /></div>
          <div>
            <h1 className="page-title">Patients</h1>
            <p className="text-sm text-slate-500 mt-0.5">{totalCount.toLocaleString()} total · {pendingCount} pending</p>
          </div>
        </div>
        <Link href="/patients/new" className="btn-primary">
          <UserPlus size={15} />
          Register Patient
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        <Link
          href="/patients"
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === "active" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          <Users size={14} />
          All Patients
        </Link>
        <Link
          href="/patients?tab=pending"
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === "pending" ? "border-amber-500 text-amber-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          <Clock size={14} />
          Pending Registration
          {pendingCount > 0 && (
            <span className="badge-amber text-[10px] px-1.5 py-0">{pendingCount}</span>
          )}
        </Link>
      </div>

      {/* Search + filter */}
      <form className="mb-5 flex flex-col sm:flex-row gap-2">
        {tab === "pending" && <input type="hidden" name="tab" value="pending" />}
        <div className="relative sm:max-w-sm w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, IC, passport or ref…"
            className="form-input pl-8 w-full"
          />
        </div>
        <select name="source" defaultValue={source ?? ""} className="form-input sm:w-44">
          <option value="">All sources</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="btn-outline">Filter</button>
      </form>

      <div className="card overflow-x-auto">
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
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-state-icon"><Users size={24} /></div>
                    <p className="font-medium text-slate-700">No patients found</p>
                    <p className="text-sm text-slate-400">{q ? "Try a different search term" : "No records match your filters"}</p>
                  </div>
                </td>
              </tr>
            )}
            {patients.map((p) => (
              <tr key={p.id} className="table-row">
                <td className="px-5 py-3 font-mono text-xs text-slate-400">{p.patientRef}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 uppercase">
                      {p.name.charAt(0)}
                    </div>
                    <div>
                      <Link href={`/patients/${p.id}`} className="font-medium text-slate-900 hover:text-blue-600">{p.name}</Link>
                      {p.isForeigner && <span className="ml-2 badge-amber text-[10px]">Foreign</span>}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-600 font-mono text-xs">{p.icNumber ?? p.passportNo ?? "—"}</td>
                <td className="px-5 py-3 text-slate-600">{p.homeClinic.name}</td>
                <td className="px-5 py-3">
                  {p.source
                    ? <span className="badge-slate">{p.source.name}</span>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-5 py-3 text-slate-600">{p.visits.length}</td>
                <td className="px-5 py-3 text-slate-500 text-xs">
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
