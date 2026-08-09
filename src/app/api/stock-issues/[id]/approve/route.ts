/** POST /api/stock-issues/[id]/approve — PIC approves a write-off and posts it. */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, assertClinicAccess } from "@/lib/clinic-access";
import { checkApprover, checkTransition } from "@/lib/stock-issue";
import { postStockIssue } from "@/services/stock-issue.service";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const issue = await prisma.stockIssue.findUnique({
    where: { id: params.id },
    include: { clinic: { select: { picId: true } } },
  });
  if (!issue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await assertClinicAccess(role, userId, issue.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const transition = checkTransition(issue.status, "POSTED");
  if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: transition.status });

  const approver = checkApprover({
    picId: issue.clinic.picId, role, userId,
    createdById: issue.createdById, submittedById: issue.submittedById,
  });
  if (!approver.ok) return NextResponse.json({ error: approver.error }, { status: approver.status });

  await prisma.stockIssue.update({
    where: { id: issue.id },
    data: { reviewedById: userId, reviewedAt: new Date() },
  });

  const result = await postStockIssue(issue.id, userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const { ok: _ok, ...posted } = result;
  return NextResponse.json({ ok: true, status: "POSTED", ...posted });
}
