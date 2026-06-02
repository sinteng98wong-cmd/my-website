import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { calculateReferralCommission, hasExistingCommission } from "@/lib/referral-commission";

const PaymentLineSchema = z.object({
  method:         z.enum(["CASH_CURRENT","CASH_NEXT","CREDIT_CARD","FPX","EWALLET","ATOME","PANEL"]),
  amount:         z.number().positive(),
  panelProviderId: z.string().min(1).optional(),
}).refine(p => p.method !== "PANEL" || !!p.panelProviderId, {
  message: "PANEL payment requires a panelProviderId",
  path: ["panelProviderId"],
});

const CreateInvoiceSchema = z.object({
  visitId:   z.string().min(1),
  subtotal:  z.number().nonnegative(),
  sst:       z.number().nonnegative().default(0),
  payments:  z.array(PaymentLineSchema).min(1),
}).refine(d => {
  const payTotal = d.payments.reduce((s, p) => s + p.amount, 0);
  const invoiceTotal = Math.round((d.subtotal + d.sst) * 100) / 100;
  return Math.abs(payTotal - invoiceTotal) < 0.01;
}, { message: "Sum of payment lines must equal subtotal + SST", path: ["payments"] });

async function genRef(): Promise<string> {
  const count = await prisma.invoice.count();
  return `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CreateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const d = parsed.data;
  const total = Math.round((d.subtotal + d.sst) * 100) / 100;
  const now   = new Date();

  // All amounts collected = mark collectedAt now
  const allCollected = d.payments.every(p => ["CASH_CURRENT","CASH_NEXT","CREDIT_CARD","FPX","EWALLET","ATOME"].includes(p.method));

  const invoice = await prisma.invoice.create({
    data: {
      invoiceRef:  await genRef(),
      visitId:     d.visitId,
      subtotal:    d.subtotal,
      sst:         d.sst,
      total,
      collectedAt: allCollected ? now : null,
      payments: {
        create: d.payments.map(p => ({
          method:          p.method,
          amount:          p.amount,
          panelProviderId: p.panelProviderId ?? null,
          collectedAt:     ["CASH_CURRENT","CASH_NEXT","CREDIT_CARD","FPX","EWALLET","ATOME"].includes(p.method)
            ? now : null,
        })),
      },
    },
    include: {
      payments: { include: { panelProvider: { select: { name: true } } } },
    },
  });

  // Update treatment collected amounts proportionally
  const treatments = await prisma.treatment.findMany({
    where: { visitId: d.visitId },
    select: { id: true, billedAmount: true },
  });
  if (treatments.length > 0) {
    const cashLikePayments = d.payments.filter(p =>
      ["CASH_CURRENT","CASH_NEXT","CREDIT_CARD","FPX","EWALLET","ATOME"].includes(p.method)
    );
    const collectedTotal = cashLikePayments.reduce((s, p) => s + p.amount, 0);
    for (const t of treatments) {
      const proportion = total > 0 ? (Number(t.billedAmount) / d.subtotal) * collectedTotal : 0;
      await prisma.treatment.update({
        where: { id: t.id },
        data:  { collectedAmount: Math.min(proportion, Number(t.billedAmount)) },
      });
    }
  }

  // Referral commission: trigger on the patient's FIRST paid invoice
  if (allCollected) {
    try {
      const visit = await prisma.visit.findUnique({ where: { id: d.visitId }, select: { patientId: true } });
      if (visit && !(await hasExistingCommission(visit.patientId))) {
        await calculateReferralCommission(visit.patientId, invoice.id);
      }
    } catch (e) {
      // Non-fatal: commission failure must not block invoice creation
      console.error("Referral commission calculation failed:", e);
    }
  }

  return NextResponse.json(invoice, { status: 201 });
}
