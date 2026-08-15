/**
 * PATCH /api/hr/payroll/bank-payments/[paymentId]/reject
 *
 * The 2nd payment approver sends the bank payment back. The payslips it
 * covered are detached and stay APPROVED, so Accounts can prepare a corrected
 * payment without redoing the 1st approval.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClinicPayrollSettings } from "@/lib/payroll-config";
import { checkSecondApprover } from "@/lib/payroll-workflow";

export async function PATCH(req: NextRequest, { params }: { params: { paymentId: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id as string;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const payment = await prisma.payrollBankPayment.findUnique({ where: { id: params.paymentId } });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (payment.status !== "PENDING_APPROVAL")
    return NextResponse.json({ error: `Bank payment is already ${payment.status}` }, { status: 409 });

  const cfg = await getClinicPayrollSettings(payment.clinicId);
  const guard = checkSecondApprover(cfg, userId, role, payment.preparedById);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  if (!body.reason) return NextResponse.json({ error: "A rejection reason is required" }, { status: 422 });

  await prisma.$transaction([
    prisma.paySlip.updateMany({ where: { bankPaymentId: payment.id }, data: { bankPaymentId: null } }),
    prisma.payrollBankPayment.update({
      where: { id: payment.id },
      data: { status: "REJECTED", rejectedById: userId, rejectedAt: new Date(), rejectionReason: body.reason },
    }),
  ]);

  return NextResponse.json({ ok: true, status: "REJECTED" });
}
