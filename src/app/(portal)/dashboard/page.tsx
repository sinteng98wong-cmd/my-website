import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import Link from "next/link";
import { notDeleted } from "@/lib/soft-delete";
import { TodayStaffingWidget } from "@/components/TodayStaffingWidget";

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const clinicId = getSelectedClinicId();

  const clinicFilter = clinicId ? { homeClinicId: clinicId } : {};
  const visitClinicFilter = clinicId ? { clinicId } : {};

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [patientCount, todayVisits, recentPatients, pendingComm, licenseAlerts] = await Promise.all([
    prisma.patient.count({ where: notDeleted(clinicFilter) }),
    prisma.visit.count({ where: notDeleted({ visitDate: { gte: today }, ...visitClinicFilter }) }),
    prisma.patient.findMany({
      where: notDeleted(clinicFilter),
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { homeClinic: { select: { name: true } } },
    }),
    prisma.doctorCommission.aggregate({
      where: { status: "PENDING_LOCK" },
      _sum: { finalPayout: true },
    }),
    ["SUPER_ADMIN","CLINIC_MANAGER"].includes(role)
      ? prisma.license.groupBy({
          by: ["status"],
          where: { status: { in: ["EXPIRED","EXPIRING_SOON"] } },
          _count: true,
        })
      : Promise.resolve([]),
  ]);

  const stats = [
    { label: "Total Patients",     value: patientCount.toLocaleString() },
    { label: "Today's Visits",     value: todayVisits.toLocaleString() },
    { label: "Pending Commission", value: fmt(Number(pendingComm._sum.finalPayout ?? 0)) },
  ];

  const quickLinks: Record<string, { label: string; href: string }[]> = {
    RECEPTIONIST:   [{ label: "Register Patient", href: "/patients/new" }, { label: "Today's Schedule", href: "/schedule" }, { label: "New Invoice", href: "/invoices" }],
    CLINIC_MANAGER: [{ label: "Register Patient", href: "/patients/new" }, { label: "Schedule", href: "/schedule" }, { label: "Commission", href: "/commission" }],
    SUPER_ADMIN:    [{ label: "Register Patient", href: "/patients/new" }, { label: "Daily Ledger", href: "/ledger" }, { label: "Commission", href: "/commission" }],
    DOCTOR:         [{ label: "My Schedule", href: "/schedule" }, { label: "My Commission", href: "/commission" }],
    FINANCE:        [{ label: "Daily Ledger", href: "/ledger" }, { label: "Commission", href: "/commission" }],
  };
  const links = quickLinks[role] ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Welcome back, {session?.user?.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* License alerts */}
      {(licenseAlerts as any[]).length > 0 && (
        <div className="mb-5 space-y-2">
          {(licenseAlerts as any[]).find((g: any) => g.status === "EXPIRED") && (
            <Link href="/licenses" className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm font-medium hover:bg-red-100">
              🔴 {(licenseAlerts as any[]).find((g: any) => g.status === "EXPIRED")._count} license(s) expired — click to review
            </Link>
          )}
          {(licenseAlerts as any[]).find((g: any) => g.status === "EXPIRING_SOON") && (
            <Link href="/licenses" className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-700 text-sm font-medium hover:bg-amber-100">
              🟡 {(licenseAlerts as any[]).find((g: any) => g.status === "EXPIRING_SOON")._count} license(s) expiring within 90 days
            </Link>
          )}
        </div>
      )}

      {links.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Quick actions</p>
          <div className="flex flex-wrap gap-2">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="btn-outline">{l.label}</Link>
            ))}
          </div>
        </div>
      )}

      {clinicId && (
        <div className="mb-6">
          <TodayStaffingWidget clinicId={clinicId} />
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Recent Patients</h2>
          <Link href="/patients" className="text-xs text-blue-600 hover:underline">View all</Link>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              {["Ref", "Name", "Clinic", "Type", "Registered"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentPatients.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">No patients yet</td></tr>
            )}
            {recentPatients.map((p) => (
              <tr key={p.id} className="table-row">
                <td className="px-5 py-3 font-mono text-xs text-slate-400">{p.patientRef}</td>
                <td className="px-5 py-3">
                  <Link href={`/patients/${p.id}`} className="font-medium text-blue-600 hover:underline">{p.name}</Link>
                </td>
                <td className="px-5 py-3 text-slate-600">{p.homeClinic.name}</td>
                <td className="px-5 py-3">
                  <span className={p.isForeigner ? "badge-amber" : "badge-green"}>{p.isForeigner ? "Foreign" : "Local"}</span>
                </td>
                <td className="px-5 py-3 text-slate-500">
                  {new Date(p.createdAt).toLocaleDateString("en-MY", { dateStyle: "medium" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
