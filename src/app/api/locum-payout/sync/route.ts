import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePayoutLineForTreatment } from "@/services/locum-payout.service";

/**
 * POST /api/locum-payout/sync
 * Body: { month: "YYYY-MM", clinicId?: string }
 *
 * Catch-up: creates payout lines for every treatment in the month that
 * doesn't have one yet — for ALL doctors (permanent and locum). New
 * treatments recorded at a visit get their line automatically; this covers
 * anything recorded before that hook existed or entered by other paths.
 *
 * Roles: SUPER_ADMIN, FINANCE, CLINIC_MANAGER
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string | undefined;

  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { month?: string; clinicId?: string };
  const { month, clinicId } = body;

  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 422 });

  // Month boundaries in MYT
  const monthStart = new Date(`${month}-01T00:00:00+08:00`);
  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthEnd = new Date(`${nextMonth}-01T00:00:00+08:00`);

  const treatments = await prisma.treatment.findMany({
    where: {
      doctorId: { not: null },
      visit: {
        visitDate: { gte: monthStart, lt: monthEnd },
        ...(clinicId ? { clinicId } : {}),
      },
    },
    select: { id: true, doctorId: true },
  });

  // Skip treatments that already have a payout line for this doctor
  const existing = await (prisma as any).locumPayoutLine.findMany({
    where:  { treatmentId: { in: treatments.map((t: any) => t.id) } },
    select: { treatmentId: true, doctorProfileId: true },
  });
  const existingKeys = new Set(existing.map((l: any) => `${l.treatmentId}:${l.doctorProfileId}`));

  let created = 0;
  const errors: string[] = [];

  for (const t of treatments as any[]) {
    if (existingKeys.has(`${t.id}:${t.doctorId}`)) continue;
    try {
      const id = await ensurePayoutLineForTreatment(t.id);
      if (id) created++;
    } catch (e: any) {
      errors.push(`${t.id}: ${e.message}`);
    }
  }

  return NextResponse.json({
    created,
    skipped: treatments.length - created - errors.length,
    ...(errors.length ? { errors } : {}),
  });
}
