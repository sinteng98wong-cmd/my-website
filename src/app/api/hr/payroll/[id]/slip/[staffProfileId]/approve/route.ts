/**
 * PATCH /api/hr/payroll/[id]/slip/[staffProfileId]/approve
 *
 * 1st payment approver signs off an individual payslip after the HR lock.
 * The approver is whoever the clinic has configured — never the PV
 * director/PIC and never a hard-coded user.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClinicPayrollSettings } from "@/lib/payroll-config";
import { checkFirstApprover } from "@/lib/payroll-workflow";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; staffProfileId: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id as string;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const slip = await prisma.paySlip.findFirst({
    where: { payrollRunId: params.id, staffProfileId: params.staffProfileId },
    include: { payrollRun: { select: { clinicId: true, status: true } } },
  });
  if (!slip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (slip.payrollRun.status !== "LOCKED")
    return NextResponse.json({ error: "Payroll must be locked by HR before payslips can be approved." }, { status: 409 });
  if (slip.status !== "PENDING")
    return NextResponse.json({ error: `Payslip is already ${slip.status}` }, { status: 409 });

  const cfg = await getClinicPayrollSettings(slip.payrollRun.clinicId);
  const guard = checkFirstApprover(cfg, userId, role);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as { note?: string };
  const updated = await prisma.paySlip.update({
    where: { id: slip.id },
    data: { status: "APPROVED", approvedById: userId, approvedAt: new Date(), approvalNote: body.note || null },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
