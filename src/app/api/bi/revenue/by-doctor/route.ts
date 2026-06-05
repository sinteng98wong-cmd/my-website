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

  type DoctorRow = {
    doctorProfileId: string
    revenue: string | number
    treatmentCount: bigint
    patientCount: bigint
    workedDays: bigint
  }

  const rows = await prisma.$queryRaw<DoctorRow[]>`
    SELECT
      t."doctorId"                            AS "doctorProfileId",
      SUM(t."billedAmount")                   AS revenue,
      COUNT(t.id)                             AS "treatmentCount",
      COUNT(DISTINCT v."patientId")           AS "patientCount",
      COUNT(DISTINCT DATE(v."visitDate"))     AS "workedDays"
    FROM "Treatment" t
    JOIN "Visit" v ON t."visitId" = v.id
    WHERE v."clinicId"    = ${clinicId}
      AND v."visitDate"  >= ${start}
      AND v."visitDate"  <= ${end}
      AND v."deletedAt"  IS NULL
      AND t."doctorId"   IS NOT NULL
    GROUP BY t."doctorId"
    ORDER BY revenue DESC
  `

  if (rows.length === 0) return NextResponse.json([])

  const profileIds = rows.map((r) => r.doctorProfileId)
  const profiles = await prisma.doctorProfile.findMany({
    where: { id: { in: profileIds } },
    include: { user: { select: { id: true, name: true } } },
  })
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } })
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))

  const result = rows.map((r) => {
    const profile = profileMap[r.doctorProfileId]
    const rev = Number(r.revenue)
    const treated = Number(r.treatmentCount)
    const patients = Number(r.patientCount)
    const worked = Math.max(1, Number(r.workedDays))

    return {
      doctorId: profile?.userId ?? r.doctorProfileId,
      doctorName: profile?.user?.name ?? "Unknown",
      clinicName: clinic?.name ?? clinicId,
      revenue: Math.round(rev * 100) / 100,
      treatmentCount: treated,
      patientCount: patients,
      avgRevenuePerPatient: patients > 0 ? Math.round((rev / patients) * 100) / 100 : 0,
      treatmentsPerDay: Math.round((treated / days) * 10) / 10,
      revenuePerDay: Math.round((rev / days) * 100) / 100,
    }
  })

  return NextResponse.json(result)
}
