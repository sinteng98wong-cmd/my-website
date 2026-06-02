import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const clinicId = sp.get("clinicId") ?? undefined;
  const year = parseInt(sp.get("year") ?? String(new Date().getFullYear()), 10);
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const staffWhere: any = { user: { active: true } };
  if (clinicId) staffWhere.clinicId = clinicId;

  const [allStaff, newHires, resignations, leaveApps, attendanceAgg, kpiCompleted, disciplinaryRecords, trainings] = await Promise.all([
    prisma.staffProfile.findMany({ where: staffWhere, select: { employmentType: true, employmentStatus: true, user: { select: { role: true } } } }),
    prisma.staffProfile.count({ where: { ...staffWhere, joinDate: { gte: yearStart, lt: yearEnd } } }),
    prisma.staffProfile.count({ where: { ...(clinicId ? { clinicId } : {}), resignationDate: { gte: yearStart, lt: yearEnd } } }),
    prisma.leaveApplication.findMany({
      where: { ...(clinicId ? { clinicId } : {}), status: "APPROVED", startDate: { gte: yearStart, lt: yearEnd } },
      select: { leaveType: true, totalDays: true },
    }),
    prisma.attendance.findMany({
      where: { ...(clinicId ? { staffProfile: { clinicId } } : {}), month: { startsWith: String(year) } },
      select: { attendedDays: true, lateCount: true, totalWorkDays: true },
    }),
    prisma.staffKpi.findMany({
      where: { status: "COMPLETED", period: { startsWith: String(year) }, ...(clinicId ? { staffProfile: { clinicId } } : {}) },
      select: { overallScore: true },
    }),
    prisma.disciplinary.findMany({
      where: { ...(clinicId ? { clinicId } : {}), createdAt: { gte: yearStart, lt: yearEnd } },
      select: { type: true, status: true },
    }),
    prisma.training.findMany({
      where: { startDate: { gte: yearStart, lt: yearEnd } },
      include: { _count: { select: { participants: true } }, participants: { where: { status: "COMPLETED" }, select: { id: true } } },
    }),
  ]);

  // Headcount
  const byRole: Record<string, number> = {};
  const byEmploymentType: Record<string, number> = {};
  const byEmploymentStatus: Record<string, number> = {};
  for (const s of allStaff) {
    byRole[s.user.role] = (byRole[s.user.role] ?? 0) + 1;
    byEmploymentType[s.employmentType] = (byEmploymentType[s.employmentType] ?? 0) + 1;
    byEmploymentStatus[s.employmentStatus] = (byEmploymentStatus[s.employmentStatus] ?? 0) + 1;
  }

  // Attendance
  const totalAtt = attendanceAgg.length;
  const avgAttendanceRate = totalAtt > 0
    ? attendanceAgg.reduce((s, a) => s + (Number(a.attendedDays) / Math.max(1, a.totalWorkDays)) * 100, 0) / totalAtt
    : 0;
  const avgLateCount = totalAtt > 0 ? attendanceAgg.reduce((s, a) => s + a.lateCount, 0) / totalAtt : 0;

  // Leave
  const leaveByType: Record<string, number> = {};
  for (const l of leaveApps) leaveByType[l.leaveType] = (leaveByType[l.leaveType] ?? 0) + Number(l.totalDays);
  const totalLeaveDays = leaveApps.reduce((s, l) => s + Number(l.totalDays), 0);

  // KPI
  const kpiScores = kpiCompleted.map((k) => Number(k.overallScore ?? 0)).filter(Boolean);
  const avgKpiScore = kpiScores.length > 0 ? kpiScores.reduce((s, v) => s + v, 0) / kpiScores.length : null;

  // Disciplinary
  const discByType: Record<string, number> = {};
  const discByStatus: Record<string, number> = {};
  for (const d of disciplinaryRecords) {
    discByType[d.type] = (discByType[d.type] ?? 0) + 1;
    discByStatus[d.status] = (discByStatus[d.status] ?? 0) + 1;
  }

  // Training
  const totalEnrolled = trainings.reduce((s, t) => s + t._count.participants, 0);
  const totalCompleted = trainings.reduce((s, t) => s + t.participants.length, 0);

  return NextResponse.json({
    headcount: { total: allStaff.length, byRole, byEmploymentType, byEmploymentStatus, newHires, resignations },
    attendance: { avgAttendanceRate: Math.round(avgAttendanceRate * 100) / 100, avgLateCount: Math.round(avgLateCount * 100) / 100 },
    leave: { totalDays: totalLeaveDays, byType: leaveByType },
    kpi: { completedCount: kpiCompleted.length, avgScore: avgKpiScore ? Math.round(avgKpiScore * 100) / 100 : null },
    disciplinary: { total: disciplinaryRecords.length, byType: discByType, byStatus: discByStatus },
    training: { sessions: trainings.length, enrolled: totalEnrolled, completed: totalCompleted, completionRate: totalEnrolled > 0 ? Math.round((totalCompleted / totalEnrolled) * 10000) / 100 : 0 },
  });
}
