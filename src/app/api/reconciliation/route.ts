import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];

// Non-panel methods we track in Track A.
// CASH_NEXT is folded into CASH_CURRENT — cash is reconciled as a single monthly total.
const SETTLEMENT_METHODS = ["CASH_CURRENT", "CREDIT_CARD", "FPX", "EWALLET", "ATOME"] as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp       = new URL(req.url).searchParams;
  const clinicId = sp.get("clinicId");
  const month    = sp.get("month"); // "YYYY-MM"
  if (!clinicId || !month)
    return NextResponse.json({ error: "clinicId and month are required" }, { status: 400 });

  // Ensure recon record exists
  const recon = await prisma.monthlyRecon.upsert({
    where:  { clinicId_month: { clinicId, month } },
    update: {},
    create: { clinicId, month },
    include: {
      methodEntries: { include: { confirmedBy: { select: { name: true } } } },
      remittances: {
        orderBy: { receivedDate: "asc" },
        include: {
          panelProvider: { select: { id: true, name: true } },
          createdBy:     { select: { name: true } },
          items: {
            include: {
              invoicePayment: {
                include: {
                  invoice: {
                    include: {
                      visit: { include: { patient: { select: { name: true, patientRef: true } } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Build month date range
  const [year, mon] = month.split("-").map(Number);
  const monthStart  = new Date(year, mon - 1, 1);
  const monthEnd    = new Date(year, mon, 1);

  // Fetch all invoice payments for invoices in this month (via visit.visitDate)
  const invoicePayments = await prisma.invoicePayment.findMany({
    where: {
      invoice: {
        deletedAt: null,
        visit: {
          clinicId,
          visitDate: { gte: monthStart, lt: monthEnd },
        },
      },
    },
    include: {
      invoice: {
        include: {
          visit: {
            include: {
              patient: { select: { id: true, name: true, patientRef: true } },
            },
          },
        },
      },
      panelProvider: { select: { id: true, name: true, code: true } },
      remittanceItems: { select: { id: true, remittanceId: true, allocatedAmount: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // ── Track A: per-method settlement summary ─────────────────────────────
  const methodMap: Record<string, { billed: number; inMonth: number; nextMonths: number }> = {};
  for (const method of SETTLEMENT_METHODS) {
    methodMap[method] = { billed: 0, inMonth: 0, nextMonths: 0 };
  }

  for (const ip of invoicePayments) {
    if (ip.method === "PANEL" || ip.method === "DEPOSIT") continue;
    // CASH_NEXT is folded into CASH_CURRENT for monthly reconciliation
    const key = ip.method === "CASH_NEXT" ? "CASH_CURRENT" : ip.method;
    const m = methodMap[key];
    if (!m) continue;
    const amt = Number(ip.amount);
    m.billed += amt;
    const sDate = ip.expectedSettlementDate;
    if (!sDate || (sDate >= monthStart && sDate < monthEnd)) {
      m.inMonth += amt;
    } else {
      m.nextMonths += amt;
    }
  }

  const methodSettlement = SETTLEMENT_METHODS.map(method => {
    const data      = methodMap[method];
    // current-month entry (sourceMonth IS NULL)
    const confirmed = recon.methodEntries.find(e => e.method === method && e.sourceMonth === null) ?? null;
    const confirmedAmt = confirmed ? Number(confirmed.confirmedAmount) : null;
    return {
      method,
      billed:        data.billed,
      confirmed:     confirmed ? {
        amount:      confirmedAmt!,
        notes:       confirmed.notes,
        by:          confirmed.confirmedBy?.name ?? null,
        at:          confirmed.confirmedAt,
      } : null,
      // carry-forward = billed - confirmed (what still needs to arrive next month)
      carryForward:  Math.max(0, data.billed - (confirmedAmt ?? data.billed)),
    };
  }).filter(m => m.billed > 0);

  // ── Carry-forward: prior-month invoice payments whose expectedSettlementDate falls THIS month ──
  const carryForwardPayments = await prisma.invoicePayment.findMany({
    where: {
      method:                 { notIn: ["PANEL", "DEPOSIT"] },
      expectedSettlementDate: { gte: monthStart, lt: monthEnd },
      invoice: {
        deletedAt: null,
        visit: {
          clinicId,
          visitDate: { lt: monthStart },
        },
      },
    },
    include: {
      invoice: { include: { visit: { select: { visitDate: true } } } },
    },
  });

  // Group carry-forward by sourceMonth + method (raw settlement-date sum)
  const cfMap = new Map<string, { method: string; sourceMonth: string; rawExpected: number }>();
  for (const ip of carryForwardPayments) {
    const srcMonth  = ip.invoice.visit.visitDate.toISOString().slice(0, 7);
    // CASH_NEXT folded into CASH_CURRENT for monthly reconciliation
    const method    = ip.method === "CASH_NEXT" ? "CASH_CURRENT" : ip.method;
    const key       = `${srcMonth}::${method}`;
    if (!cfMap.has(key)) cfMap.set(key, { method, sourceMonth: srcMonth, rawExpected: 0 });
    cfMap.get(key)!.rawExpected += Number(ip.amount);
  }

  // Adjust expected: if prior month has a confirmed amount, expected = max(0, priorBilled - priorConfirmed)
  const uniqueSourceMonths = [...new Set(
    carryForwardPayments.map(ip => ip.invoice.visit.visitDate.toISOString().slice(0, 7))
  )];

  let priorConfirmedMap = new Map<string, Map<string, number>>();
  let priorBilledMap    = new Map<string, Map<string, number>>();

  if (uniqueSourceMonths.length > 0) {
    // Fetch prior month recons + in-month confirmations
    const priorRecons = await prisma.monthlyRecon.findMany({
      where:   { clinicId, month: { in: uniqueSourceMonths } },
      include: {
        methodEntries: {
          where:  { sourceMonth: null },
          select: { method: true, confirmedAmount: true },
        },
      },
    });
    for (const pr of priorRecons) {
      const mmap = new Map<string, number>();
      for (const e of pr.methodEntries) {
        // Fold CASH_NEXT into CASH_CURRENT
        const method = e.method === "CASH_NEXT" ? "CASH_CURRENT" : e.method;
        mmap.set(method, (mmap.get(method) ?? 0) + Number(e.confirmedAmount));
      }
      priorConfirmedMap.set(pr.month, mmap);
    }

    // Fetch total billed per method for each prior source month
    const minSrc = uniqueSourceMonths.reduce((a, b) => a < b ? a : b);
    const priorBilledPayments = await prisma.invoicePayment.findMany({
      where: {
        method:  { notIn: ["PANEL", "DEPOSIT"] },
        invoice: {
          deletedAt: null,
          visit: {
            clinicId,
            visitDate: { gte: new Date(minSrc + "-01"), lt: monthStart },
          },
        },
      },
      select: {
        method: true, amount: true,
        invoice: { select: { visit: { select: { visitDate: true } } } },
      },
    });
    for (const ip of priorBilledPayments) {
      const srcMonth = ip.invoice.visit.visitDate.toISOString().slice(0, 7);
      if (!uniqueSourceMonths.includes(srcMonth)) continue;
      if (!priorBilledMap.has(srcMonth)) priorBilledMap.set(srcMonth, new Map());
      const mmap   = priorBilledMap.get(srcMonth)!;
      // Fold CASH_NEXT into CASH_CURRENT
      const method = ip.method === "CASH_NEXT" ? "CASH_CURRENT" : ip.method;
      mmap.set(method, (mmap.get(method) ?? 0) + Number(ip.amount));
    }
  }

  const carryForward = Array.from(cfMap.values()).map(cf => {
    const priorBilled     = priorBilledMap.get(cf.sourceMonth)?.get(cf.method) ?? cf.rawExpected;
    const priorConfirmed  = priorConfirmedMap.get(cf.sourceMonth)?.get(cf.method);
    const hasConfirmation = priorConfirmed !== undefined;
    // If prior month confirmed, expected = what they still owe; else use raw settlement-date sum
    const expected = hasConfirmation
      ? Math.max(0, priorBilled - priorConfirmed!)
      : cf.rawExpected;

    const entry = recon.methodEntries.find(e => e.method === cf.method && e.sourceMonth === cf.sourceMonth) ?? null;
    return {
      method:      cf.method,
      sourceMonth: cf.sourceMonth,
      expected:    Math.round(expected * 100) / 100,
      confirmed:   entry ? {
        amount: Number(entry.confirmedAmount),
        notes:  entry.notes,
        by:     entry.confirmedBy?.name ?? null,
        at:     entry.confirmedAt,
      } : null,
    };
  }).filter(cf => cf.expected > 0)
    .sort((a, b) => a.sourceMonth.localeCompare(b.sourceMonth) || a.method.localeCompare(b.method));

  // ── Track B: panel invoice payments (for this month) ──────────────────
  const panelPayments = invoicePayments.filter(ip => ip.method === "PANEL");

  // Build matched set (invoicePaymentId → allocatedAmount)
  const matchedMap = new Map<string, number>();
  for (const rem of recon.remittances) {
    for (const item of rem.items) {
      matchedMap.set(item.invoicePaymentId, (matchedMap.get(item.invoicePaymentId) ?? 0) + Number(item.allocatedAmount));
    }
  }

  const panelSummary = panelPayments.map(ip => {
    const allocated = matchedMap.get(ip.id) ?? 0;
    const amount    = Number(ip.amount);
    return {
      id:              ip.id,
      invoiceId:       ip.invoiceId,
      invoiceRef:      ip.invoice.invoiceRef,
      visitDate:       ip.invoice.visit.visitDate,
      patientName:     ip.invoice.visit.patient.name,
      patientRef:      ip.invoice.visit.patient.patientRef,
      provider:        ip.panelProvider ?? null,
      amount,
      allocated,
      unallocated:     Math.max(0, amount - allocated),
      status:          allocated >= amount ? "MATCHED" : allocated > 0 ? "PARTIAL" : "UNMATCHED",
    };
  });

  // ── Daily listing ──────────────────────────────────────────────────────
  const dayMap = new Map<string, {
    invoiceCount: Set<string>;
    billed: number;
    cashCard: number;
    panel: number;
    invoices: Map<string, { id: string; invoiceRef: string; patientName: string; patientRef: string; payments: { method: string; amount: number; provider: string | null; panelStatus: string }[] }>;
  }>();

  for (const ip of invoicePayments) {
    const inv     = ip.invoice;
    const dateKey = inv.visit.visitDate.toISOString().slice(0, 10);

    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, { invoiceCount: new Set(), billed: 0, cashCard: 0, panel: 0, invoices: new Map() });
    }
    const day = dayMap.get(dateKey)!;

    if (!day.invoiceCount.has(inv.id)) {
      day.invoiceCount.add(inv.id);
      day.billed += Number(inv.total);
    }

    if (!day.invoices.has(inv.id)) {
      day.invoices.set(inv.id, {
        id: inv.id, invoiceRef: inv.invoiceRef,
        patientName: inv.visit.patient.name,
        patientRef:  inv.visit.patient.patientRef,
        payments: [],
      });
    }

    const amt = Number(ip.amount);
    if (ip.method === "PANEL") {
      day.panel += amt;
      const allocated  = matchedMap.get(ip.id) ?? 0;
      const panelStatus = allocated >= amt ? "MATCHED" : allocated > 0 ? "PARTIAL" : "UNMATCHED";
      day.invoices.get(inv.id)!.payments.push({
        method: ip.method, amount: amt,
        provider: ip.panelProvider?.name ?? null,
        panelStatus,
      });
    } else {
      day.cashCard += amt;
      day.invoices.get(inv.id)!.payments.push({
        method: ip.method, amount: amt, provider: null, panelStatus: "",
      });
    }
  }

  const dailyRows = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => {
      const invList     = Array.from(d.invoices.values());
      const panelRows   = invList.flatMap(i => i.payments.filter(p => p.method === "PANEL"));
      const allMatched  = panelRows.length > 0 && panelRows.every(p => p.panelStatus === "MATCHED");
      const anyMatched  = panelRows.some(p => p.panelStatus === "MATCHED" || p.panelStatus === "PARTIAL");
      const panelStatus = panelRows.length === 0 ? null : allMatched ? "MATCHED" : anyMatched ? "PARTIAL" : "UNMATCHED";
      return {
        date,
        invoiceCount: d.invoiceCount.size,
        billed:   Math.round(d.billed   * 100) / 100,
        cashCard: Math.round(d.cashCard * 100) / 100,
        panel:    Math.round(d.panel    * 100) / 100,
        panelStatus,
        invoices: invList,
      };
    });

  // ── Summary totals ─────────────────────────────────────────────────────
  const totalBilled      = dailyRows.reduce((s, r) => s + r.billed, 0);
  const totalCashCard    = dailyRows.reduce((s, r) => s + r.cashCard, 0);
  const totalPanel       = dailyRows.reduce((s, r) => s + r.panel, 0);
  const totalConfirmed   = methodSettlement.reduce((s, m) => s + (m.confirmed?.amount ?? m.billed), 0);
  const totalNextMonths  = methodSettlement.reduce((s, m) => s + m.carryForward, 0);
  const panelMatched     = Array.from(matchedMap.values()).reduce((s, v) => s + v, 0);
  const panelOutstanding = panelSummary.reduce((s, p) => s + p.unallocated, 0);

  return NextResponse.json({
    recon: {
      id:       recon.id,
      clinicId: recon.clinicId,
      month:    recon.month,
      status:   recon.status,
      lockedAt: recon.lockedAt,
      notes:    recon.notes,
    },
    summary: {
      totalBilled:      Math.round(totalBilled * 100) / 100,
      settledInMonth:   Math.round(totalConfirmed * 100) / 100,
      settledNextMonths: Math.round(totalNextMonths * 100) / 100,
      panelMatched:     Math.round(panelMatched * 100) / 100,
      panelOutstanding: Math.round(panelOutstanding * 100) / 100,
    },
    methodSettlement,
    carryForward,
    remittances: recon.remittances,
    panelSummary,
    dailyRows,
  });
}
