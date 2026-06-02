import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/commission/doctor/lock
 * Body: { doctorId: string, month: "YYYY-MM" }
 *
 * Bulk-transitions all DRAFT/PENDING_LOCK DoctorCommission rows for a
 * doctor+month to LOCKED. Idempotent — already-locked rows are untouched.
 *
 * Roles: SUPER_ADMIN, FINANCE
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string | undefined;
  const userId  = (session?.user as any)?.id   as string | undefined;

  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!["SUPER_ADMIN", "FINANCE"].includes(role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { doctorId?: string; month?: string };
  const { doctorId, month } = body;

  if (!doctorId || !month)
    return NextResponse.json({ error: "doctorId and month are required" }, { status: 422 });
  if (!/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 422 });

  const { count } = await prisma.doctorCommission.updateMany({
    where: {
      doctorId,
      month,
      status: { in: ["DRAFT", "PENDING_LOCK"] },
    },
    data: {
      status:   "LOCKED",
      lockedAt: new Date(),
      lockedBy: userId,
    },
  });

  return NextResponse.json({ locked: count, doctorId, month });
}
