import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDepositBalance, genDepositRef, genSalesReturnRef, postDepositToLedger } from "@/lib/deposit";

const TOPUP_METHODS  = ["CASH_CURRENT", "CASH_NEXT", "CREDIT_CARD", "FPX", "EWALLET", "ATOME"] as const;
const REFUND_CATS    = ["TREATMENT_FAILURE", "PATIENT_REQUEST", "OVERPAYMENT", "OTHER"] as const;
const MANAGER_ROLES  = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const [deposits, balance] = await Promise.all([
    (prisma as any).patientDeposit.findMany({
      where:   { patientId: params.id },
      include: {
        clinic:      { select: { name: true } },
        createdBy:   { select: { name: true } },
        invoice:     { select: { invoiceRef: true } },
        salesReturn: {
          select: {
            returnRef: true,
            originalInvoice: { select: { invoiceRef: true, createdAt: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    getDepositBalance(params.id),
  ]);

  return NextResponse.json({ balance, deposits });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role        = (session.user as any).role as string;
  const createdById = (session.user as any).id   as string;

  const body = await req.json() as {
    type:              "TOPUP" | "UTILIZATION" | "REFUND";
    amount:            number;
    clinicId:          string;
    // TOPUP
    paymentMethod?:    string;
    // REFUND
    refundCategory?:   string;
    reason?:           string;
    originalInvoiceId?: string;  // required when refundCategory = TREATMENT_FAILURE
    visitId?:          string;
    // UTILIZATION
    invoiceId?:        string;
    notes?:            string;
  };

  const { type, amount, clinicId, paymentMethod, refundCategory, reason,
          originalInvoiceId, visitId, invoiceId, notes } = body;

  // ── Validation ────────────────────────────────────────────────────────────

  if (!type || !amount || !clinicId)
    return NextResponse.json({ error: "type, amount and clinicId are required" }, { status: 422 });

  if (amount <= 0)
    return NextResponse.json({ error: "amount must be greater than 0" }, { status: 422 });

  if (type === "TOPUP") {
    if (!paymentMethod || !(TOPUP_METHODS as readonly string[]).includes(paymentMethod))
      return NextResponse.json(
        { error: `paymentMethod required for TOPUP. Valid: ${TOPUP_METHODS.join(", ")}` },
        { status: 422 }
      );
  }

  if (type === "REFUND") {
    if (!MANAGER_ROLES.includes(role))
      return NextResponse.json({ error: "Only managers can process refunds" }, { status: 403 });
    if (!refundCategory || !(REFUND_CATS as readonly string[]).includes(refundCategory))
      return NextResponse.json(
        { error: `refundCategory required. Valid: ${REFUND_CATS.join(", ")}` },
        { status: 422 }
      );
    if (!reason?.trim())
      return NextResponse.json({ error: "reason is required for refunds" }, { status: 422 });
    if (refundCategory === "TREATMENT_FAILURE" && !originalInvoiceId)
      return NextResponse.json(
        { error: "originalInvoiceId is required for TREATMENT_FAILURE refunds" },
        { status: 422 }
      );
  }

  if (type === "UTILIZATION" && !invoiceId)
    return NextResponse.json({ error: "invoiceId is required for UTILIZATION" }, { status: 422 });

  // Balance check for outflows.
  // TREATMENT_FAILURE refunds bypass this — the clinic is creating a liability
  // (patient is owed money regardless of their current deposit balance).
  const skipBalanceCheck = type === "REFUND" && refundCategory === "TREATMENT_FAILURE";

  if ((type === "UTILIZATION" || type === "REFUND") && !skipBalanceCheck) {
    const balance = await getDepositBalance(params.id);
    if (amount > balance + 0.001)
      return NextResponse.json(
        { error: `Insufficient deposit balance. Available: RM ${balance.toFixed(2)}` },
        { status: 422 }
      );
  }

  // ── Create SalesReturn first (if treatment failure) ───────────────────────

  let salesReturnId: string | null = null;

  if (type === "REFUND" && refundCategory === "TREATMENT_FAILURE" && originalInvoiceId) {
    const returnRef  = await genSalesReturnRef();
    const sr = await (prisma as any).salesReturn.create({
      data: {
        returnRef,
        clinicId,
        patientId:         params.id,
        originalInvoiceId,
        amount,
        reason:            reason!,
        returnDate:        new Date(),
        createdById,
      },
    });
    salesReturnId = sr.id;
  }

  // ── Create deposit transaction ────────────────────────────────────────────

  const depositRef = await genDepositRef();

  const deposit = await (prisma as any).patientDeposit.create({
    data: {
      depositRef,
      patientId:      params.id,
      clinicId,
      amount,
      type,
      paymentMethod:  type === "TOPUP"   ? paymentMethod  : null,
      refundCategory: type === "REFUND"  ? refundCategory : null,
      reason:         type === "REFUND"  ? reason         : null,
      salesReturnId:  salesReturnId,
      invoiceId:      invoiceId          ?? null,
      visitId:        visitId            ?? null,
      notes:          notes              ?? null,
      createdById,
    },
  });

  // ── Post to DailyLedger ───────────────────────────────────────────────────

  if (type === "TOPUP" || type === "REFUND") {
    await postDepositToLedger({
      clinicId,
      date:                new Date(),
      type,
      amount,
      paymentMethod:       type === "TOPUP" ? paymentMethod : undefined,
      isTreatmentFailure:  type === "REFUND" && refundCategory === "TREATMENT_FAILURE",
      updatedById:         createdById,
    });
  }

  // ── Utilization: InvoicePayment + auto-collect ────────────────────────────

  if (type === "UTILIZATION" && invoiceId) {
    await prisma.invoicePayment.create({
      data: { invoiceId, method: "DEPOSIT" as any, amount },
    });
    const inv = await prisma.invoice.findUnique({
      where:   { id: invoiceId },
      include: { payments: { select: { amount: true } } },
    });
    if (inv && !inv.collectedAt) {
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      if (paid >= Number(inv.total)) {
        await prisma.invoice.update({ where: { id: invoiceId }, data: { collectedAt: new Date() } });
      }
    }
  }

  const newBalance = await getDepositBalance(params.id);
  return NextResponse.json({ deposit, balance: newBalance, salesReturnId }, { status: 201 });
}
