import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];

function round2(n: number) { return Math.round(n * 100) / 100; }

function monthOf(d: Date): string {
  return d.toISOString().slice(0, 7); // "YYYY-MM"
}

function monthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-MY", { month: "long", year: "numeric" });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const clinicId = sp.get("clinicId") ?? undefined;
  const month    = sp.get("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "month (YYYY-MM) required" }, { status: 400 });

  const [y, m] = month.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to   = new Date(y, m, 1);         // exclusive upper bound

  // ── Fetch all invoices for the sales month ────────────────────────────
  const invoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: from, lt: to },
      ...(clinicId ? { visit: { clinicId } } : {}),
    },
    include: {
      visit: {
        include: {
          treatments: { select: { billedAmount: true } },
        },
      },
      payments: {
        include: {
          settlementBank: { select: { name: true } },
          panelProvider:  { select: { name: true } },
        },
      },
    },
  });

  // ── Aggregate sales figures ───────────────────────────────────────────
  let totalProfFees = 0;
  let totalProducts = 0;
  let totalSST      = 0;
  let totalPanel    = 0;   // panel debtor (billed, not immediately collected)

  for (const inv of invoices) {
    const profFee = inv.visit.treatments.reduce((s, t) => s + Number(t.billedAmount), 0);
    const sst     = Number(inv.sst);
    const product = Math.max(0, Number(inv.total) - profFee - sst);

    totalProfFees += profFee;
    totalSST      += sst;
    totalProducts += product;

    for (const p of inv.payments) {
      if (p.method === "PANEL") totalPanel += Number(p.amount);
    }
  }

  // ── Aggregate receipts ────────────────────────────────────────────────
  // Group by the month the money was ACTUALLY received (settledDate).
  // Unsettled payments → "outstanding".

  type MethodLine = { method: string; bankName: string | null; amount: number };
  type ReceiptGroup = {
    settlementMonth: string;  // "YYYY-MM"
    label: string;
    isCurrentMonth: boolean;
    amount: number;
    byMethod: Map<string, MethodLine>;
  };

  const groups = new Map<string, ReceiptGroup>();
  let outstandingAmount = 0;
  const outstandingByMethod = new Map<string, MethodLine>();

  for (const inv of invoices) {
    for (const p of inv.payments) {
      if (p.method === "PANEL") continue;  // panel shown separately on sales side
      const amt = Number(p.amount);

      if (p.settledDate) {
        const sm = monthOf(p.settledDate);
        if (!groups.has(sm)) {
          const isCurrent = sm === month;
          groups.set(sm, {
            settlementMonth: sm,
            label: isCurrent
              ? `Current — ${monthLabel(month)}`
              : `Deferred — ${monthLabel(sm)}`,
            isCurrentMonth: isCurrent,
            amount: 0,
            byMethod: new Map(),
          });
        }
        const g = groups.get(sm)!;
        g.amount += amt;

        const methodKey = `${p.method}|${p.settlementBank?.name ?? ""}`;
        if (!g.byMethod.has(methodKey)) {
          g.byMethod.set(methodKey, {
            method:   p.method,
            bankName: p.settlementBank?.name ?? null,
            amount:   0,
          });
        }
        g.byMethod.get(methodKey)!.amount += amt;

      } else {
        outstandingAmount += amt;
        const methodKey = `${p.method}|${p.settlementBank?.name ?? ""}`;
        if (!outstandingByMethod.has(methodKey)) {
          outstandingByMethod.set(methodKey, {
            method:   p.method,
            bankName: p.settlementBank?.name ?? null,
            amount:   0,
          });
        }
        outstandingByMethod.get(methodKey)!.amount += amt;
      }
    }
  }

  // Sort groups: current month first, then deferred in date order
  const sortedGroups = [...groups.values()]
    .sort((a, b) => a.settlementMonth.localeCompare(b.settlementMonth))
    .map((g) => ({
      settlementMonth: g.settlementMonth,
      label:           g.label,
      isCurrentMonth:  g.isCurrentMonth,
      amount:          round2(g.amount),
      byMethod:        [...g.byMethod.values()].map((ml) => ({
        ...ml, amount: round2(ml.amount),
      })),
    }));

  const totalReceipts = round2(sortedGroups.reduce((s, g) => s + g.amount, 0));
  const totalSales    = round2(totalProfFees + totalSST + totalProducts);

  return NextResponse.json({
    month,
    monthLabel: monthLabel(month),
    clinicId: clinicId ?? null,
    invoiceCount: invoices.length,

    sales: {
      professionalFees: round2(totalProfFees),
      products:         round2(totalProducts),
      sst:              round2(totalSST),
      panelDebtor:      round2(totalPanel),
      total:            round2(totalSales + totalPanel), // full billing
    },

    receiptGroups: sortedGroups,

    outstanding: {
      amount:    round2(outstandingAmount),
      byMethod:  [...outstandingByMethod.values()].map((ml) => ({ ...ml, amount: round2(ml.amount) })),
    },

    summary: {
      totalBilled:   round2(totalSales + totalPanel),
      totalReceived: totalReceipts,
      panelDebtor:   round2(totalPanel),
      outstanding:   round2(outstandingAmount),
      balance:       round2(totalSales - totalReceipts - outstandingAmount),
    },
  });
}
