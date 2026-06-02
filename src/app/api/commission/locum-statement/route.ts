import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { generateLocumStatement } from "@/services/commission.service";

/**
 * POST /api/commission/locum-statement
 * Body: { doctorId: string, month: "YYYY-MM", splitRate?: number }
 *
 * Generates (or regenerates) a LocumReconciliationStatement for the given
 * locum doctor + month, then returns { statementId, finalPayout }.
 *
 * Roles: SUPER_ADMIN, FINANCE, CLINIC_MANAGER
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string | undefined;

  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as {
    doctorId?: string;
    month?: string;
    splitRate?: number;
  };

  const { doctorId, month, splitRate } = body;

  if (!doctorId || !month)
    return NextResponse.json({ error: "doctorId and month are required" }, { status: 422 });
  if (!/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 422 });

  // Resolve User.id → DoctorProfile.id
  let profileId = doctorId;
  const byProfile = await prisma.doctorProfile.findUnique({ where: { id: doctorId }, select: { id: true } });
  if (!byProfile) {
    const byUser = await prisma.doctorProfile.findUnique({ where: { userId: doctorId }, select: { id: true } });
    if (!byUser)
      return NextResponse.json({ error: `No DoctorProfile found for id "${doctorId}"` }, { status: 404 });
    profileId = byUser.id;
  }

  try {
    const splitRateDecimal = splitRate ? new Decimal(splitRate) : undefined;
    const { statementId, finalPayout } = await generateLocumStatement(
      profileId, month, splitRateDecimal, [], prisma,
    );
    return NextResponse.json({ statementId, finalPayout: finalPayout.toNumber() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}
