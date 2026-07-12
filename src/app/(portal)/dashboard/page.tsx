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
  Stethoscope, type LucideIcon, Clock,
} from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("ms-MY", { style: "currency", currency: "MYR" }).format(n);
}

const APPT_TYPE_CLASS: Record<string, string> = {
  TREATMENT:    "badge-blue",
  CHECKUP:      "badge-green",
  CONSULTATION: "badge-indigo",
  FOLLOWUP:     "badge-cyan",
  CLEANING:     "badge-teal",
  EXTRACTION:   "badge-amber",
  OTHER:        "badge-slate",
};

const APPT_STATUS_CLASS: Record<string, string> = {
  CONFIRMED:   "badge-green",
  CHECKED_IN:  "badge-blue",
  SCHEDULED:   "badge-slate",
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role   as string;
  const userId  = (session?.user as any)?.id     as string;
  const clinicId = getSelectedClinicId();

  const clinicFilter      = clinicId ? { homeClinicId: clinicId } : {};
  const visitClinicFilter = clinicId ? { clinicId } : {};

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sevenDaysOut = new Date(today); sevenDaysOut.setDate(sevenDaysOut.getDate() + 8);

  const showAppointments = !["FINANCE", "STOREKEEPER"].includes(role);

  const [patientCount, todayVisits, recentPatients, pendingComm, licenseAlerts, upcomingAppointments] = await Promise.all([
    prisma.patient.count({ where: notDeleted(clinicFilter) }),
    prisma.visit.count({ where: notDeleted({ visitDate: { gte: today }, ...visitClinicFilter }) }),
    prisma.patient.findMany({
      where: notDeleted(clinicFilter),
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { homeClinic: { select: { name: true } } },
    }),
    prisma.doctorCommission.aggregate({
      where: { status: "PENDING_LOCK", ...(clinicId ? { treatment: { visit: { clinicId } } } : {}) },
      _sum: { finalPayout: true },
    }),
    ["SUPER_ADMIN","CLINIC_MANAGER"].includes(role)
      ? prisma.license.groupBy({
          by: ["status"],
          where: { status: { in: ["EXPIRED","EXPIRING_SOON"] } },
          _count: true,
        })
      : Promise.resolve([]),

    showAppointments
      ? prisma.appointment.findMany({
          where: {
            startTime: { gte: today, lt: sevenDaysOut },
            status:    { in: ["SCHEDULED", "CONFIRMED", "CHECKED_IN"] },
            ...(clinicId ? { clinicId } : {}),
            ...(role === "DOCTOR" ? { doctorId: userId } : {}),
          },
          include: {
            patient: { select: { name: true, patientRef: true } },
            doctor:  { select: { name: true } },
            clinic:  { select: { name: true } },
          },
          orderBy: { startTime: "asc" },
          take: 10,
        })
      : Promise.resolve([] as Array<{
          id: string; startTime: Date; type: string; status: string;
          duration: number; chiefComplaint: string | null;
          patient: { name: string; patientRef: string };
          doctor: { name: string };
          clinic: { name: string };
        }>),
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
      { label: "Daily Sign-off", href: "/commission?tab=locum", Icon: Stethoscope },
    ],
    FINANCE:        [
      { label: "Daily Ledger",   href: "/ledger",              Icon: ClipboardList },
      { label: "Commission",     href: "/commission",          Icon: Banknote },
    ],
  };
  const links = quickLinks[role] ?? [];

  // Group appointments by calendar date (MYT)
  const apptByDate = new Map<string, typeof upcomingAppointments>();
  for (const a of upcomingAppointments) {
    const key = new Date(a.startTime).toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
    if (!apptByDate.has(key)) apptByDate.set(key, []);
    apptByDate.get(key)!.push(a);
  }

  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  const tomorrowKey = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });

  function dateLabel(key: string) {
    if (key === todayKey)    return "Today";
    if (key === tomorrowKey) return "Tomorrow";
    return new Date(key + "T12:00:00+08:00").toLocaleDateString("en-MY", { weekday: "short", month: "short", day: "numeric" });
  }

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
      {(licenseAlerts as any[]).length > 0 && (() => {
        const expired      = (licenseAlerts as any[]).find((g: any) => g.status === "EXPIRED");
        const expiringSoon = (licenseAlerts as any[]).find((g: any) => g.status === "EXPIRING_SOON");
        return (
          <div className="mb-5 space-y-2">
            {expired && (
              <Link href="/licenses" className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{expired._count} license(s) expired — click to review</span>
                <ArrowRight size={14} className="ml-auto flex-shrink-0" />
              </Link>
            )}
            {expiringSoon && (
              <Link href="/licenses" className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors">
                <AlertTriangle size={16} className="flex-shrink-0" />
                <span>{expiringSoon._count} license(s) expiring within 90 days</span>
                <ArrowRight size={14} className="ml-auto flex-shrink-0" />
              </Link>
            )}
          </div>
        );
      })()}

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

      {/* Upcoming Appointments */}
      {showAppointments && upcomingAppointments.length > 0 && (
        <div className="card mb-6 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <CalendarCheck size={15} className="text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900">Upcoming Appointments</h2>
              <span className="badge-blue text-[10px] px-1.5 py-0">{upcomingAppointments.length}</span>
            </div>
            <Link href="/appointments" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {Array.from(apptByDate.entries()).map(([dateKey, appts]) => (
            <div key={dateKey}>
              {/* Date header */}
              <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <span className={`text-xs font-semibold ${dateKey === todayKey ? "text-blue-700" : "text-slate-600"}`}>
                  {dateLabel(dateKey)}
                </span>
                <span className="text-[10px] text-slate-400">{dateKey}</span>
                <span className="badge-slate text-[10px] px-1 py-0 ml-auto">{appts.length} appt{appts.length !== 1 ? "s" : ""}</span>
              </div>

              {/* Appointment rows */}
              {appts.map(appt => {
                const timeStr = new Date(appt.startTime).toLocaleTimeString("en-MY", {
                  timeZone: "Asia/Kuala_Lumpur",
                  hour: "2-digit", minute: "2-digit", hour12: true,
                });
                const typeLabel = appt.type.charAt(0) + appt.type.slice(1).toLowerCase();
                const doctorName = appt.doctor.name.replace(/^Dr\.?\s*/i, "Dr. ");

                return (
                  <div key={appt.id} className="flex items-center gap-4 px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                    {/* Time */}
                    <div className="w-20 flex-shrink-0 flex items-center gap-1.5 text-slate-500">
                      <Clock size={12} className="flex-shrink-0" />
                      <span className="text-xs font-semibold tabular-nums">{timeStr}</span>
                    </div>

                    {/* Patient + complaint */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900 truncate">{appt.patient.name}</span>
                        <span className={`${APPT_TYPE_CLASS[appt.type] ?? "badge-slate"} text-[10px]`}>{typeLabel}</span>
                        {(APPT_STATUS_CLASS[appt.status]) && appt.status !== "SCHEDULED" && (
                          <span className={`${APPT_STATUS_CLASS[appt.status]} text-[10px]`}>{appt.status.toLowerCase()}</span>
                        )}
                      </div>
                      {appt.chiefComplaint && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{appt.chiefComplaint}</p>
                      )}
                    </div>

                    {/* Doctor + duration */}
                    <div className="text-right flex-shrink-0 hidden sm:block">
                      <p className="text-xs font-medium text-slate-600">{doctorName}</p>
                      <p className="text-[10px] text-slate-400">{appt.duration} min</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Empty upcoming appointments */}
      {showAppointments && upcomingAppointments.length === 0 && (
        <div className="card mb-6 p-6 flex items-center gap-3 text-slate-400">
          <CalendarCheck size={18} />
          <p className="text-sm">No upcoming appointments in the next 7 days</p>
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
