import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertClinicAccess } from "@/lib/clinic-access";
import { checkApprover, checkTransition } from "@/lib/stock-opening";
import { approveOpeningBalance } from "@/services/stock-opening.service";
import { withPeriodLock } from "@/lib/stock-period-http";

/**
 * Approve and post. Separation of duties applies: the raiser and the submitter
 * cannot sign their own document, super admin included.
 */
async function postHandler(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;

  const doc = await prisma.openingBalance.findUnique({ where: { id: params.id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await assertClinicAccess(role, userId, doc.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const transition = checkTransition(doc.status, "APPROVED");
  if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: transition.status });

  const approver = checkApprover({
    role, userId, createdById: doc.createdById, submittedById: doc.submittedById,
  });
  if (!approver.ok) return NextResponse.json({ error: approver.error }, { status: approver.status });

  const result = await approveOpeningBalance(doc.id, userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const { ok: _ok, ...posted } = result;
  return NextResponse.json({ ok: true, status: "APPROVED", ...posted });
}

// A locked period refuses the posting with a 409 rather than an unhandled throw.
export const POST = withPeriodLock(postHandler);
