import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parsePeriod, getPrevPeriod, periodDays } from "@/lib/bi"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const role = (session.user as any).role as string
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const period = sp.get("period") || "this_month"
  const { start, end } = parsePeriod(period, sp.get("from"), sp.get("to"))
  const { start: prevStart, end: prevEnd } = getPrevPeriod(start, end)
  const days = periodDays(start, end)

  const clinics = await prisma.clinic.findMany({ orderBy: { name: "asc" } })
  const clinicIds = clinics.map((c) => c.id)

  const [ledger, prevLedger, newPatientsGroups, invoiceCounts] = await Promise.all([
    prisma.dailyLedger.groupBy({
      by: ["clinicId"],
      where: { clinicId: { in: clinicIds }, date: { gte: start, lte: end } },
      _sum: { totalSales: true, patientCount: true },
      _count: { id: true },
    }),
    prisma.dailyLedger.groupBy({
      by: ["clinicId"],
      where: { clinicId: { in: clinicIds }, date: { gte: prevStart, lte: prevEnd } },
      _sum: { totalSales: true },
    }),
    prisma.patient.groupBy({
      by: ["homeClinicId"],
      where: {
        homeClinicId: { in: clinicIds },
        createdAt: { gte: start, lte: end },
        status: { not: "REJECTED" },
      },
      _count: { id: true },
    }),
    // Invoice count per clinic via raw query
    prisma.$queryRaw<{ clinicId: string; cnt: bigint }[]>`
      SELECT v."clinicId", COUNT(i.id) as cnt
      FROM "Invoice" i
      JOIN "Visit" v ON i."visitId" = v.id
      WHERE v."clinicId" = ANY(${clinicIds}::text[])
        AND v."visitDate" >= ${start}
        AND v."visitDate" <= ${end}
        AND i."deletedAt" IS NULL
        AND v."deletedAt" IS NULL
      GROUP BY v."clinicId"
    `,
  ])

  const ledgerMap = Object.fromEntries(ledger.map((r) => [r.clinicId, r]))
  const prevMap = Object.fromEntries(prevLedger.map((r) => [r.clinicId, r]))
  const newPtsMap = Object.fromEntries(newPatientsGroups.map((r) => [r.homeClinicId, r._count.id]))
  const invoiceMap = Object.fromEntries(invoiceCounts.map((r) => [r.clinicId, Number(r.cnt)]))

  const result = clinics.map((clinic) => {
    const rev = Number(ledgerMap[clinic.id]?._sum.totalSales ?? 0)
    const prevRev = Number(prevMap[clinic.id]?._sum.totalSales ?? 0)
    const totalPatients = Number(ledgerMap[clinic.id]?._sum.patientCount ?? 0)
    const newPts = newPtsMap[clinic.id] ?? 0
    const invCount = invoiceMap[clinic.id] ?? 0
    const avgInv = invCount > 0 ? rev / invCount : 0

    return {
      clinicId: clinic.id,
      clinicName: clinic.name,
      totalRevenue: rev,
      invoiceCount: invCount,
      avgInvoiceValue: Math.round(avgInv * 100) / 100,
      newPatients: newPts,
      returningPatients: Math.max(0, totalPatients - newPts),
      revenueChangePct: prevRev === 0 ? null : Math.round(((rev - prevRev) / prevRev) * 1000) / 10,
      revenuePerDay: Math.round((rev / days) * 100) / 100,
    }
  })

  return NextResponse.json(result)
}
