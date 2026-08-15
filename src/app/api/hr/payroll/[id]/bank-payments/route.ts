/**
 * GET  /api/hr/payroll/[id]/bank-payments  — list bank payments for a run
 * POST /api/hr/payroll/[id]/bank-payments  — Accounts prepares/uploads one
 *
 * Accounts may only prepare. Approval is a separate endpoint reserved for the
 * clinic's 2nd payment approver.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ACCOUNTS_ROLES, HR_PAYROLL_ROLES, bankPaymentRef, isPayable } from "@/lib/payroll-workflow";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!HR_PAYROLL_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payments = await prisma.payrollBankPayment.findMany({
    where: { payrollRunId: params.id },
    include: {
      preparedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      rejectedBy: { select: { name: true } },
      _count: { select: { slips: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(payments);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id as string;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!ACCOUNTS_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const run = await prisma.payrollRun.findUnique({
    where: { id: params.id },
    include: { slips: { select: { id: true, status: true, bankPaymentId: true, netSalary: true } } },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status !== "LOCKED")
    return NextResponse.json({ error: "Payroll must be locked by HR before a bank payment can be prepared." }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as {
    slipIds?: string[]; bankName?: string; accountNo?: string;
    paymentDate?: string; fileUrl?: string; fileName?: string; notes?: string;
  };

  const payable = run.slips.filter(isPayable);
  const selected = body.slipIds?.length ? payable.filter((s) => body.slipIds!.includes(s.id)) : payable;
  if (!selected.length)
    return NextResponse.json(
      { error: "No approved payslips awaiting payment. The 1st approver must approve payslips first." },
      { status: 409 }
    );

  const total = selected.reduce((sum, s) => sum + Number(s.netSalary), 0);
  const sequence = (await prisma.payrollBankPayment.count({ where: { clinicId: run.clinicId, payrollRunId: run.id } })) + 1;

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payrollBankPayment.create({
      data: {
        paymentRef: bankPaymentRef(run.month, sequence),
        clinicId: run.clinicId,
        payrollRunId: run.id,
        status: "PENDING_APPROVAL",
        totalAmount: total.toFixed(2),
        bankName: body.bankName || null,
        accountNo: body.accountNo || null,
        paymentDate: body.paymentDate ? new Date(body.paymentDate) : null,
        fileUrl: body.fileUrl || null,
        fileName: body.fileName || null,
        notes: body.notes || null,
        preparedById: userId,
      },
    });
    await tx.paySlip.updateMany({
      where: { id: { in: selected.map((s) => s.id) } },
      data: { bankPaymentId: created.id },
    });
    return created;
  });

  return NextResponse.json({ ...payment, slipCount: selected.length }, { status: 201 });
}
