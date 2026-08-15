import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canUnlockPeriod, unlockPeriod } from "@/lib/stock-period";
import { z } from "zod";

/**
 * Reopen a closed stock month.
 *
 * Deliberately a separate endpoint from locking, and deliberately narrower:
 * anyone who can close a month should not be able to reopen one. The reason is
 * mandatory and is kept on the lock row, so a reopen is always on record.
 */
const UnlockSchema = z.object({
  clinicId: z.string().min(1),
  period:   z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "period must be YYYY-MM"),
  reason:   z.string().trim().min(1, "reason is required to unlock a stock period"),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;

  if (!canUnlockPeriod(role))
    return NextResponse.json(
      { error: "Forbidden: only a super admin can unlock a stock period" },
      { status: 403 }
    );

  const body   = await req.json().catch(() => null);
  const parsed = UnlockSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );

  const { clinicId, period, reason } = parsed.data;

  try {
    const lock = await unlockPeriod({ clinicId, period, userId, reason });
    return NextResponse.json(lock);
  } catch (e) {
    if (e instanceof Error && e.message === "PERIOD_NOT_LOCKED")
      return NextResponse.json(
        { error: `Stock period ${period} is not locked for this clinic.` },
        { status: 409 }
      );
    throw e;
  }
}
