/**
 * PATCH /api/hr/payroll/bank-payments/[paymentId]/approve
 *
 * 2nd payment approver signs the bank transaction. This is the step that makes
 * the payment PAID — the payslips it covers become PAID with it, and the run is
 * marked PAID once every payslip is settled. Whoever prepared the payment can
 * never approve it.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClinicPayrollSettings } from "@/lib/payroll-config";
import { checkSecondApprover, isRunSettled } from "@/lib/payroll-workflow";

export async function PATCH(req: NextRequest, { params }: { params: { paymentId: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id as string;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const payment = await prisma.payrollBankPayment.findUnique({
    where: { id: params.paymentId },
    include: { slips: { select: { id: true } } },
  });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (payment.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: `Bank payment is already ${payment.status}` }, { status: 409 });

  const cfg = await getClinicPayrollSettings(payment.clinicId);
  const guard = checkSecondApprover(cfg, userId, role, payment.preparedById);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as { note?: string };
  const paidAt = new Date();

  await prisma.$transaction([
    prisma.payrollBankPayment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        approvedById: userId,
        approvedAt: paidAt,
        approvalNote: body.note || null,
        paymentDate: payment.paymentDate ?? paidAt,
      },
    }),
    prisma.paySlip.updateMany({
      where: { bankPaymentId: payment.id, status: "APPROVED" },
      data: { status: "PAID", paidAt },
    }),
  ]);

  // The run is PAID once every payslip has been settled; HR still has to
  // release each payslip to the employee.
  const slips = await prisma.paySlip.findMany({
    where: { payrollRunId: payment.payrollRunId },
    select: { status: true },
  });
  if (isRunSettled(slips)) {
    await prisma.payrollRun.update({
      where: { id: payment.payrollRunId },
      data: { status: "PAID", paidAt },
    });
  }

  return NextResponse.json({ ok: true, status: "PAID", slipsPaid: payment.slips.length });
}
