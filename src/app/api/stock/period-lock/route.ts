import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertClinicAccess, clinicScopeFor } from "@/lib/clinic-access";
import { canLockPeriod, isValidPeriod, listPeriodLocks, lockPeriod } from "@/lib/stock-period";
import { z } from "zod";

const LockSchema = z.object({
  clinicId: z.string().min(1),
  period:   z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "period must be YYYY-MM"),
  notes:    z.string().optional(),
});

/** Lock status for the caller's clinics, optionally narrowed to one period. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;

  const sp       = req.nextUrl.searchParams;
  const clinicId = sp.get("clinicId");
  const period   = sp.get("period") ?? undefined;

  if (period && !isValidPeriod(period))
    return NextResponse.json({ error: "period must be YYYY-MM" }, { status: 422 });

  // Reuses the existing scope resolution — no parallel authorization model.
  const scope = await clinicScopeFor(role, userId, clinicId);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  return NextResponse.json(await listPeriodLocks(scope.clinicIds, period));
}

/** Close a clinic-month. Super admin, finance or the clinic's manager. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;

  if (!canLockPeriod(role))
    return NextResponse.json(
      { error: "Forbidden: only a super admin, finance or clinic manager can lock a stock period" },
      { status: 403 }
    );

  const body   = await req.json().catch(() => null);
  const parsed = LockSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );

  const { clinicId, period, notes } = parsed.data;

  // A manager may only lock a clinic they belong to.
  const access = await assertClinicAccess(role, userId, clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const lock = await lockPeriod({ clinicId, period, userId, notes });
  return NextResponse.json(lock, { status: 201 });
}
