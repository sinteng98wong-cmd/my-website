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
  const period = sp.get("period") || "this_month"
  const { start, end } = parsePeriod(period, sp.get("from"), sp.get("to"))
  const { start: prevStart, end: prevEnd } = getPrevPeriod(start, end)

  const accessibleClinics = await getUserClinics()
  const clinicIds = accessibleClinics.map((c: { id: string }) => c.id)

  if (clinicIds.length === 0) {
    return NextResponse.json({
      totalRevenue: 0, totalRevenueChangePct: null,
      totalInvoices: 0, totalPatients: 0, newPatients: 0,
      avgInvoiceValue: 0, topClinic: null, topDoctor: null,
    })
  }

  const visitWhere = {
    clinicId: { in: clinicIds },
    visitDate: { gte: start, lte: end },
    deletedAt: null as null,
  }

  const [ledger, prevLedger, invoiceAgg, newPatientsCount, topDoctorRows] = await Promise.all([
    prisma.dailyLedger.aggregate({
      where: { clinicId: { in: clinicIds }, date: { gte: start, lte: end } },
      _sum: { totalSales: true },
    }),
    prisma.dailyLedger.aggregate({
      where: { clinicId: { in: clinicIds }, date: { gte: prevStart, lte: prevEnd } },
      _sum: { totalSales: true },
    }),
    prisma.invoice.aggregate({
      where: { deletedAt: null, visit: visitWhere },
      _count: { id: true },
      _avg: { total: true },
    }),
    prisma.patient.count({
      where: {
        homeClinicId: { in: clinicIds },
        createdAt: { gte: start, lte: end },
        status: { not: "REJECTED" },
      },
    }),
    // Top doctor by revenue
    prisma.$queryRaw<{ doctorProfileId: string; revenue: string }[]>`
      SELECT t."doctorId" AS "doctorProfileId", SUM(t."billedAmount") AS revenue
      FROM "Treatment" t
      JOIN "Visit" v ON t."visitId" = v.id
      WHERE v."clinicId" = ANY(${clinicIds}::text[])
        AND v."visitDate" >= ${start}
        AND v."visitDate" <= ${end}
        AND v."deletedAt" IS NULL
        AND t."doctorId" IS NOT NULL
      GROUP BY t."doctorId"
      ORDER BY revenue DESC
      LIMIT 1
    `,
  ])

  // Total unique patients visiting (need raw query for DISTINCT across clinics)
  const totalPatientsRows = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(DISTINCT v."patientId") AS cnt
    FROM "Visit" v
    WHERE v."clinicId" = ANY(${clinicIds}::text[])
      AND v."visitDate" >= ${start}
      AND v."visitDate" <= ${end}
      AND v."deletedAt" IS NULL
  `

  // Top clinic by revenue
  const topClinicRows = await prisma.dailyLedger.groupBy({
    by: ["clinicId"],
    where: { clinicId: { in: clinicIds }, date: { gte: start, lte: end } },
    _sum: { totalSales: true },
    orderBy: { _sum: { totalSales: "desc" } },
    take: 1,
  })

  let topClinicName: string | null = null
  if (topClinicRows[0]) {
    const c = await prisma.clinic.findUnique({
      where: { id: topClinicRows[0].clinicId },
      select: { name: true },
    })
    topClinicName = c?.name ?? null
  }

  let topDoctorName: string | null = null
  if (topDoctorRows[0]) {
    const profile = await prisma.doctorProfile.findUnique({
      where: { id: topDoctorRows[0].doctorProfileId },
      include: { user: { select: { name: true } } },
    })
    topDoctorName = profile?.user?.name ?? null
  }

  const totalRevenue = Number(ledger._sum.totalSales ?? 0)
  const prevRevenue = Number(prevLedger._sum.totalSales ?? 0)

  return NextResponse.json({
    totalRevenue,
    totalRevenueChangePct:
      prevRevenue === 0
        ? null
        : Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 1000) / 10,
    totalInvoices: invoiceAgg._count.id,
    totalPatients: Number(totalPatientsRows[0]?.cnt ?? 0),
    newPatients: newPatientsCount,
    avgInvoiceValue: Math.round(Number(invoiceAgg._avg.total ?? 0) * 100) / 100,
    topClinic: topClinicName,
    topDoctor: topDoctorName,
  })
}
