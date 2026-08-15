/**
 * GET  /api/hr/attendance/monthly-submission?clinicId=&month=
 * POST /api/hr/attendance/monthly-submission
 *
 * Monthly attendance sign-off for a branch. Only the branch's designated Head
 * Nurse (ClinicPayrollConfig.headNurseStaffProfileId) may submit it — being
 * signed in is not enough. HR cannot lock the month's payroll until it exists.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClinicPayrollSettings } from "@/lib/payroll-config";
import { checkHeadNurse } from "@/lib/payroll-workflow";

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;

  const sp = req.nextUrl.searchParams;
  const clinicId = sp.get("clinicId");
  const month = sp.get("month") ?? new Date().toISOString().slice(0, 7);
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 422 });

  const [submission, cfg, profile] = await Promise.all([
    prisma.attendanceMonthSubmission.findUnique({
      where: { clinicId_month: { clinicId, month } },
      include: { submittedBy: { select: { name: true } } },
    }),
    getClinicPayrollSettings(clinicId),
    prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } }),
  ]);

  return NextResponse.json({
    clinicId,
    month,
    submission,
    headNurseStaffProfileId: cfg.headNurseStaffProfileId,
    canSubmit: checkHeadNurse(cfg, profile?.id ?? null, role).ok,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;

  const body = (await req.json().catch(() => ({}))) as { clinicId?: string; month?: string; notes?: string };
  if (!body.clinicId || !body.month || !MONTH_RE.test(body.month))
    return NextResponse.json({ error: "clinicId and month (YYYY-MM) required" }, { status: 422 });

  const [cfg, profile] = await Promise.all([
    getClinicPayrollSettings(body.clinicId),
    prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } }),
  ]);

  const guard = checkHeadNurse(cfg, profile?.id ?? null, role);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const existing = await prisma.attendanceMonthSubmission.findUnique({
    where: { clinicId_month: { clinicId: body.clinicId, month: body.month } },
  });
  if (existing)
    return NextResponse.json({ error: `Attendance for ${body.month} has already been submitted.` }, { status: 409 });

  const [y, m] = body.month.split("-").map(Number);
  const records = await prisma.attendanceRecord.findMany({
    where: { clinicId: body.clinicId, date: { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) } },
    select: { staffProfileId: true },
  });
  if (!records.length)
    return NextResponse.json({ error: `No attendance recorded for ${body.month}.` }, { status: 409 });

  const submission = await prisma.attendanceMonthSubmission.create({
    data: {
      clinicId: body.clinicId,
      month: body.month,
      staffCount: new Set(records.map((r) => r.staffProfileId)).size,
      recordCount: records.length,
      notes: body.notes || null,
      submittedById: userId,
    },
  });

  return NextResponse.json(submission, { status: 201 });
}
