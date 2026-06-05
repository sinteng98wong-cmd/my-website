import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parsePeriod, periodDays } from "@/lib/bi"
import { getUserClinics } from "@/lib/selected-clinic"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const role = (session.user as any).role as string
  const sp = req.nextUrl.searchParams
  const clinicId = sp.get("clinicId") || undefined
  const period = sp.get("period") || "this_month"

  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 })

  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) {
    const accessible = await getUserClinics()
    const ids = accessible.map((c: { id: string }) => c.id)
    if (!ids.includes(clinicId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { start, end } = parsePeriod(period, sp.get("from"), sp.get("to"))
  const days = periodDays(start, end)

  const visitWhere = { clinicId, visitDate: { gte: start, lte: end }, deletedAt: null as null }

  const [totalTreatments, treatmentGroups, doctorRows] = await Promise.all([
    prisma.treatment.count({ where: { visit: visitWhere } }),

    // Top treatments by category
    prisma.treatment.groupBy({
      by: ["treatmentTypeId"],
      where: { visit: visitWhere },
      _sum: { billedAmount: true },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    }),

    // Doctor utilisation
    prisma.$queryRaw<
      {
        doctorProfileId: string
        treatments: bigint
        revenue: string
        workedDays: bigint
        scheduledDays: bigint
      }[]
    >`
      SELECT
        t."doctorId"                            AS "doctorProfileId",
        COUNT(t.id)                             AS treatments,
        SUM(t."billedAmount")                   AS revenue,
        COUNT(DISTINCT DATE(v."visitDate"))     AS "workedDays",
        COUNT(DISTINCT DATE(v."visitDate"))     AS "scheduledDays"
      FROM "Treatment" t
      JOIN "Visit" v ON t."visitId" = v.id
      WHERE v."clinicId"   = ${clinicId}
        AND v."visitDate" >= ${start}
        AND v."visitDate" <= ${end}
        AND v."deletedAt" IS NULL
        AND t."doctorId"  IS NOT NULL
      GROUP BY t."doctorId"
      ORDER BY revenue DESC
    `,
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

  // Look up doctor names
  const profileIds = doctorRows.map((r) => r.doctorProfileId)
  const profiles = profileIds.length
    ? await prisma.doctorProfile.findMany({
        where: { id: { in: profileIds } },
        include: { user: { select: { name: true } } },
      })
    : []
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))

  const totalRevForTreatments = treatmentGroups.reduce(
    (s, g) => s + Number(g._sum.billedAmount ?? 0),
    0
  ) || 1

  const topTreatments = treatmentGroups.map((g) => ({
    name: typeMap[g.treatmentTypeId] ?? "Unknown",
    count: g._count.id,
    revenue: Number(g._sum.billedAmount ?? 0),
    pct: Math.round((Number(g._sum.billedAmount ?? 0) / totalRevForTreatments) * 1000) / 10,
  }))

  const distinctDoctors = new Set(doctorRows.map((r) => r.doctorProfileId)).size

  const doctorUtilisation = doctorRows.map((r) => ({
    doctorName: profileMap[r.doctorProfileId]?.user?.name ?? "Unknown",
    scheduledDays: Number(r.scheduledDays),
    workedDays: Number(r.workedDays),
    treatments: Number(r.treatments),
    revenue: Math.round(Number(r.revenue) * 100) / 100,
  }))

  return NextResponse.json({
    totalTreatments,
    treatmentsPerDoctor: distinctDoctors > 0 ? Math.round(totalTreatments / distinctDoctors) : 0,
    avgTreatmentsPerDay: Math.round((totalTreatments / days) * 10) / 10,
    topTreatments,
    doctorUtilisation,
  })
}
