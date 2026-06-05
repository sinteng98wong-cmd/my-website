import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { methodLabel } from "@/lib/accounting-export";
import { PaymentMethod } from "@prisma/client";
import { z } from "zod";

const ALLOWED = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ── GET: settlement reconciliation for a month, grouped by method ──────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp       = new URL(req.url).searchParams;
  const clinicId = sp.get("clinicId") ?? undefined;
  const month    = sp.get("month");
  const method   = sp.get("method") ?? undefined;

  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "month (YYYY-MM) required" }, { status: 400 });

  const { from, to } = monthRange(month);

  const payments = await prisma.invoicePayment.findMany({
    where: {
      expectedSettlementDate: { gte: from, lt: to },
      ...(method ? { method: method as PaymentMethod } : {}),
      invoice: {
        deletedAt: null,
        ...(clinicId ? { visit: { clinicId } } : {}),
      },
    },
    select: {
      method: true,
      amount: true,
      settledDate: true,
      settledAmount: true,
      expectedSettlementDate: true,
      settlementBankId: true,
      settlementBank: { select: { name: true } },
    },
  });

  type Group = {
    method: string;
    methodLabel: string;
    bankId: string | null;
    bankName: string | null;
    expectedAmount: number;   // sum of all expected in month
    settledActual: number;    // sum of settledAmount where settled
    settledExpected: number;  // sum of expected amount of the settled rows
    pendingAmount: number;    // expected amount still unsettled
    expectedCount: number;
    settledCount: number;
    pendingCount: number;
    variance: number;         // settledActual - settledExpected
  };

  const groups = new Map<string, Group>();

  for (const p of payments) {
    const bankId = p.settlementBankId ?? null;
    const key = `${p.method}|${bankId ?? "none"}`;
    if (!groups.has(key)) {
      groups.set(key, {
        method: p.method,
        methodLabel: methodLabel(p.method as PaymentMethod, null, null),
        bankId,
        bankName: p.settlementBank?.name ?? null,
        expectedAmount: 0, settledActual: 0, settledExpected: 0, pendingAmount: 0,
        expectedCount: 0, settledCount: 0, pendingCount: 0, variance: 0,
      });
    }
    const g = groups.get(key)!;
    const amt = Number(p.amount);
    g.expectedAmount += amt;
    g.expectedCount  += 1;
    if (p.settledDate) {
      g.settledActual   += Number(p.settledAmount ?? p.amount);
      g.settledExpected += amt;
      g.settledCount    += 1;
    } else {
      g.pendingAmount += amt;
      g.pendingCount  += 1;
    }
  }

  const groupList = [...groups.values()].map((g) => ({
    ...g,
    expectedAmount: round2(g.expectedAmount),
    settledActual:  round2(g.settledActual),
    pendingAmount:  round2(g.pendingAmount),
    variance:       round2(g.settledActual - g.settledExpected),
  })).sort((a, b) =>
    a.methodLabel.localeCompare(b.methodLabel) || (a.bankName ?? "").localeCompare(b.bankName ?? ""),
  );

  const totals = groupList.reduce(
    (t, g) => ({
      expectedAmount: round2(t.expectedAmount + g.expectedAmount),
      settledActual:  round2(t.settledActual + g.settledActual),
      pendingAmount:  round2(t.pendingAmount + g.pendingAmount),
      variance:       round2(t.variance + g.variance),
    }),
    { expectedAmount: 0, settledActual: 0, pendingAmount: 0, variance: 0 },
  );

  return NextResponse.json({ month, clinicId: clinicId ?? null, groups: groupList, totals });
}

// ── PATCH: mark a method's pending payments as settled for the month ───────
const PatchSchema = z.object({
  clinicId:     z.string().min(1),
  month:        z.string().regex(/^\d{4}-\d{2}$/),
  method:       z.enum(["CASH_CURRENT", "CASH_NEXT", "CREDIT_CARD", "FPX", "EWALLET", "ATOME", "PANEL", "DEPOSIT"]),
  bankId:       z.string().nullable().optional(),     // scope to one bank group (null = no bank)
  settledDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actualAmount: z.number().nonnegative().optional(),  // actual total received; defaults to expected
});

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  const { clinicId, month, method, bankId, settledDate, actualAmount } = parsed.data;
  const { from, to } = monthRange(month);

  // Scope to one bank group when bankId is provided (null = the "no bank" group).
  const bankWhere = bankId === undefined ? {} : { settlementBankId: bankId ?? null };

  const pending = await prisma.invoicePayment.findMany({
    where: {
      expectedSettlementDate: { gte: from, lt: to },
      method: method as PaymentMethod,
      settledDate: null,
      ...bankWhere,
      invoice: { deletedAt: null, visit: { clinicId } },
    },
    select: { id: true, amount: true },
  });

  if (pending.length === 0)
    return NextResponse.json({ error: "No pending settlements for this group" }, { status: 404 });

  const expectedTotal = pending.reduce((s, p) => s + Number(p.amount), 0);
  const actual = actualAmount ?? expectedTotal;
  const settledOn = new Date(settledDate + "T00:00:00");

  // Distribute the actual received amount proportionally; last row absorbs the
  // rounding remainder so the per-row settled amounts sum exactly to `actual`.
  let allocated = 0;
  const updates = pending.map((p, i) => {
    const isLast = i === pending.length - 1;
    const share = isLast
      ? round2(actual - allocated)
      : round2((Number(p.amount) / expectedTotal) * actual);
    allocated = round2(allocated + share);
    return prisma.invoicePayment.update({
      where: { id: p.id },
      data:  { settledDate: settledOn, settledAmount: share },
    });
  });

  await prisma.$transaction(updates);

  return NextResponse.json({
    settledCount: pending.length,
    expectedTotal: round2(expectedTotal),
    actualSettled: round2(actual),
    variance: round2(actual - expectedTotal),
  });
}
