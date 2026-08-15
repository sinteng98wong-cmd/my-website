/** POST /api/stock-takes/[id]/reject — PIC rejects; the record stays in history. */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, assertClinicAccess } from "@/lib/clinic-access";
import { checkApprover, checkTransition } from "@/lib/stock-take";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

  const transition = checkTransition(take.status, "REJECTED");
  if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: transition.status });

  const approver = checkApprover({
    picId: take.clinic.picId, role, userId,
    createdById: take.createdById, submittedById: take.submittedById,
  });
  if (!approver.ok) return NextResponse.json({ error: approver.error }, { status: approver.status });

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  if (!body.reason) return NextResponse.json({ error: "A rejection reason is required" }, { status: 422 });

  const updated = await prisma.stockTake.update({
    where: { id: take.id },
    data: { status: "REJECTED", reviewedById: userId, reviewedAt: new Date(), reviewNote: body.reason },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
