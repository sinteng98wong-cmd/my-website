/**
 * POST /api/stock-takes/[id]/approve — PIC approval; posts the adjustments.
 *
 * Approval is the only path that turns a count into ledger movements, and it
 * is idempotent: the posting key per line collides rather than double-posting.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, assertClinicAccess } from "@/lib/clinic-access";
import { checkApprover, checkTransition } from "@/lib/stock-take";
import { approveStockTake } from "@/services/stock-take.service";
import { withPeriodLock } from "@/lib/stock-period-http";

async function postHandler(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const take = await prisma.stockTake.findUnique({
    where: { id: params.id },
    include: { clinic: { select: { picId: true } } },
  });
  if (!take) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await assertClinicAccess(role, userId, take.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const transition = checkTransition(take.status, "APPROVED");
  if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: transition.status });

  const approver = checkApprover({
    picId: take.clinic.picId,
    role,
    userId,
    createdById: take.createdById,
    submittedById: take.submittedById,
  });
  if (!approver.ok) return NextResponse.json({ error: approver.error }, { status: approver.status });

  const result = await approveStockTake(take.id, userId);
  if (!result.ok)
    return NextResponse.json({ error: result.error, drifted: result.drifted }, { status: result.status });

  const { ok: _ok, ...posted } = result;
  return NextResponse.json({ ok: true, status: "APPROVED", ...posted });
}

// A locked stock period surfaces as a 409 instead of an unhandled throw.
export const POST = withPeriodLock(postHandler);
