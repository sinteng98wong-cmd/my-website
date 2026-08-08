/**
 * PATCH /api/hr/payroll/[id]/lock
 *
 * HR Payroll Lock — freezes the month's figures and opens the payment
 * approval workflow. Every payslip becomes PENDING approval by the clinic's
 * configured 1st payment approver.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClinicPayrollSettings } from "@/lib/payroll-config";
import { HR_PAYROLL_ROLES } from "@/lib/payroll-workflow";

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id as string;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!HR_PAYROLL_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const run = await prisma.payrollRun.findUnique({ where: { id: params.id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status !== "DRAFT") return NextResponse.json({ error: `Cannot lock a ${run.status} run` }, { status: 409 });

  // The month's attendance must have been signed off by the branch Head Nurse.
  const submission = await prisma.attendanceMonthSubmission.findUnique({
    where: { clinicId_month: { clinicId: run.clinicId, month: run.month } },
  });
  if (!submission)
    return NextResponse.json(
      { error: `Monthly attendance for ${run.month} has not been submitted by the branch Head Nurse yet.` },
      { status: 409 }
    );

  const cfg = await getClinicPayrollSettings(run.clinicId);
  if (!cfg.firstApproverId || !cfg.secondApproverId)
    return NextResponse.json(
      { error: "Configure the clinic's 1st and 2nd payment approvers in Payroll Settings before locking." },
      { status: 422 }
    );

  const [, updated] = await prisma.$transaction([
    prisma.paySlip.updateMany({ where: { payrollRunId: run.id }, data: { status: "PENDING" } }),
    prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: "LOCKED", lockedById: userId, lockedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true, status: updated.status });
}
