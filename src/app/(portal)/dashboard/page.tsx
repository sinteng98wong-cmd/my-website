import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSelectedClinicId } from "@/lib/selected-clinic";
import Link from "next/link";
import { notDeleted } from "@/lib/soft-delete";
import { TodayStaffingWidget } from "@/components/TodayStaffingWidget";
import {
  Users, CalendarCheck, Banknote, UserPlus, FileText,
  ClipboardList, AlertCircle, AlertTriangle, ArrowRight,
  Stethoscope, type LucideIcon,
} from "lucide-react";

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

  const stats: { label: string; value: string; sub: string; Icon: LucideIcon; iconClass: string }[] = [
    { label: "Total Patients",     value: patientCount.toLocaleString(),                       sub: "registered",         Icon: Users,         iconClass: "icon-box-blue"  },
    { label: "Today's Visits",     value: todayVisits.toLocaleString(),                         sub: "appointments today", Icon: CalendarCheck, iconClass: "icon-box-green" },
    { label: "Pending Commission", value: fmt(Number(pendingComm._sum.finalPayout ?? 0)),       sub: "awaiting approval",  Icon: Banknote,      iconClass: "icon-box-amber" },
  ];

  type QuickLink = { label: string; href: string; Icon: LucideIcon };
  const quickLinks: Record<string, QuickLink[]> = {
    RECEPTIONIST:   [
      { label: "Register Patient", href: "/patients/new",      Icon: UserPlus },
      { label: "Today's Schedule", href: "/schedule",          Icon: CalendarCheck },
      { label: "New Invoice",      href: "/invoices",          Icon: FileText },
    ],
    CLINIC_MANAGER: [
      { label: "Register Patient", href: "/patients/new",      Icon: UserPlus },
      { label: "Schedule",         href: "/schedule",          Icon: CalendarCheck },
      { label: "Commission",       href: "/commission",        Icon: Banknote },
    ],
    SUPER_ADMIN:    [
      { label: "Register Patient", href: "/patients/new",      Icon: UserPlus },
      { label: "Daily Ledger",     href: "/ledger",            Icon: ClipboardList },
      { label: "Commission",       href: "/commission",        Icon: Banknote },
    ],
    DOCTOR:         [
      { label: "My Schedule",    href: "/schedule",            Icon: CalendarCheck },
      { label: "My Commission",  href: "/commission",          Icon: Banknote },
      { label: "Daily Sign-off", href: "/commission/daily",    Icon: Stethoscope },
    ],
    FINANCE:        [
      { label: "Daily Ledger",   href: "/ledger",              Icon: ClipboardList },
      { label: "Commission",     href: "/commission",          Icon: Banknote },
    ],
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

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {stats.map(({ label, value, sub, Icon, iconClass }) => (
          <div key={label} className="stat-card flex items-start gap-4">
            <div className={iconClass}><Icon size={20} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5 tabular-nums">{value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* License alerts */}
      {(licenseAlerts as any[]).length > 0 && (
        <div className="mb-5 space-y-2">
          {(licenseAlerts as any[]).find((g: any) => g.status === "EXPIRED") && (
            <Link href="/licenses" className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{(licenseAlerts as any[]).find((g: any) => g.status === "EXPIRED")._count} license(s) expired — click to review</span>
              <ArrowRight size={14} className="ml-auto flex-shrink-0" />
            </Link>
          )}
          {(licenseAlerts as any[]).find((g: any) => g.status === "EXPIRING_SOON") && (
            <Link href="/licenses" className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors">
              <AlertTriangle size={16} className="flex-shrink-0" />
              <span>{(licenseAlerts as any[]).find((g: any) => g.status === "EXPIRING_SOON")._count} license(s) expiring within 90 days</span>
              <ArrowRight size={14} className="ml-auto flex-shrink-0" />
            </Link>
          )}
        </div>
      )}

      {/* Quick actions */}
      {links.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick actions</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {links.map(({ label, href, Icon }) => (
              <Link key={href} href={href} className="card p-4 flex items-center gap-3 hover:shadow-md hover:ring-blue-200/60 transition-all group">
                <div className="icon-box-sm bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                  <Icon size={16} />
                </div>
                <span className="text-sm font-medium text-slate-700 group-hover:text-blue-700 leading-tight">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {clinicId && (
        <div className="mb-6">
          <TodayStaffingWidget clinicId={clinicId} />
        </div>
      )}

      {/* Recent patients */}
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Recent Patients</h2>
          <Link href="/patients" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
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
              <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">No patients yet</td></tr>
            )}
            {recentPatients.map((p) => (
              <tr key={p.id} className="table-row">
                <td className="px-5 py-3 font-mono text-xs text-slate-400">{p.patientRef}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 uppercase">
                      {p.name.charAt(0)}
                    </div>
                    <Link href={`/patients/${p.id}`} className="font-medium text-slate-900 hover:text-blue-600">{p.name}</Link>
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-600">{p.homeClinic.name}</td>
                <td className="px-5 py-3">
                  <span className={p.isForeigner ? "badge-amber" : "badge-green"}>{p.isForeigner ? "Foreign" : "Local"}</span>
                </td>
                <td className="px-5 py-3 text-slate-500 text-xs">
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
