import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parsePeriod, getPrevPeriod } from "@/lib/bi"
import { getUserClinics } from "@/lib/selected-clinic"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const role = (session.user as any).role as string
  const sp = req.nextUrl.searchParams
  const clinicId = sp.get("clinicId") || undefined
  const period = sp.get("period") || "this_month"

  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 })

  // Scope check
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) {
    const accessible = await getUserClinics()
    const ids = accessible.map((c: { id: string }) => c.id)
    if (!ids.includes(clinicId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { start, end } = parsePeriod(period, sp.get("from"), sp.get("to"))
  const { start: prevStart, end: prevEnd } = getPrevPeriod(start, end)

  const visitWhere = { clinicId, visitDate: { gte: start, lte: end }, deletedAt: null as null }
  const prevVisitWhere = { clinicId, visitDate: { gte: prevStart, lte: prevEnd }, deletedAt: null as null }

  const [
    ledger,
    invoiceAgg,
    paymentGroups,
    treatmentGroups,
    trendRows,
    prevLedger,
  ] = await Promise.all([
    // Revenue totals from DailyLedger (the authoritative financial source)
    prisma.dailyLedger.aggregate({
      where: { clinicId, date: { gte: start, lte: end } },
      _sum: { professionalFee: true, productSales: true, sst: true, totalSales: true },
    }),

    // Invoice count + avg for this period
    prisma.invoice.aggregate({
      where: { deletedAt: null, visit: visitWhere },
      _count: { id: true },
      _avg: { total: true },
    }),

    // Payment method breakdown from InvoicePayment
    prisma.invoicePayment.groupBy({
      by: ["method"],
      where: { invoice: { deletedAt: null, visit: visitWhere } },
      _sum: { amount: true },
    }),

    // Treatment category breakdown
    prisma.treatment.groupBy({
      by: ["treatmentTypeId"],
      where: { visit: visitWhere },
      _sum: { billedAmount: true },
      _count: { id: true },
    }),

    // Daily trend from DailyLedger
    prisma.dailyLedger.findMany({
      where: { clinicId, date: { gte: start, lte: end } },
      select: { date: true, totalSales: true },
      orderBy: { date: "asc" },
    }),

    // Previous period for change %
    prisma.dailyLedger.aggregate({
      where: { clinicId, date: { gte: prevStart, lte: prevEnd } },
      _sum: { totalSales: true },
    }),
  ])

  // Look up treatment type names
  const typeIds = treatmentGroups.map((g) => g.treatmentTypeId)
  const types = typeIds.length
    ? await prisma.treatmentType.findMany({
        where: { id: { in: typeIds } },
        select: { id: true, name: true },
      })
    : []
  const typeMap = Object.fromEntries(types.map((t) => [t.id, t.name]))

  const totalRevenue = Number(ledger._sum.totalSales ?? 0)
  const prevRevenue = Number(prevLedger._sum.totalSales ?? 0)

  const paymentTotal = paymentGroups.reduce((s, g) => s + Number(g._sum.amount ?? 0), 0) || 1

  const PAYMENT_LABELS: Record<string, string> = {
    CASH_CURRENT: "Cash",
    CASH_NEXT: "Cash",
    CREDIT_CARD: "Credit Card",
    FPX: "FPX",
    EWALLET: "e-Wallet",
    ATOME: "Atome",
    PANEL: "Panel",
    DEPOSIT: "Deposit",
  }

  // Merge CASH_CURRENT + CASH_NEXT into Cash
  const pmMap: Record<string, number> = {}
  for (const g of paymentGroups) {
    const label = PAYMENT_LABELS[g.method] ?? g.method
    pmMap[label] = (pmMap[label] ?? 0) + Number(g._sum.amount ?? 0)
  }
  const byPaymentMethod = Object.entries(pmMap).map(([method, amount]) => ({
    method,
    amount,
    percentage: Math.round((amount / paymentTotal) * 1000) / 10,
  }))

  const byTreatmentCategory = treatmentGroups
    .map((g) => ({
      category: typeMap[g.treatmentTypeId] ?? "Unknown",
      amount: Number(g._sum.billedAmount ?? 0),
      count: g._count.id,
    }))
    .sort((a, b) => b.amount - a.amount)

  const trend = trendRows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    revenue: Number(r.totalSales ?? 0),
  }))

  return NextResponse.json({
    totalRevenue,
    revenueChangePct: prevRevenue === 0 ? null : Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 1000) / 10,
    invoiceCount: invoiceAgg._count.id,
    avgInvoiceValue: Math.round(Number(invoiceAgg._avg.total ?? 0) * 100) / 100,
    profFees: Number(ledger._sum.professionalFee ?? 0),
    products: Number(ledger._sum.productSales ?? 0),
    sst: Number(ledger._sum.sst ?? 0),
    byPaymentMethod,
    byTreatmentCategory,
    trend,
  })
}
