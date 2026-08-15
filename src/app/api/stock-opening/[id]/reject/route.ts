import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertClinicAccess } from "@/lib/clinic-access";
import { canReviewOpening, checkTransition } from "@/lib/stock-opening";
import { z } from "zod";

const RejectSchema = z.object({ reason: z.string().trim().min(1, "a reason is required") });

/** Send the document back to the branch. Nothing is posted. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;

  const parsed = RejectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });

  const doc = await prisma.openingBalance.findUnique({ where: { id: params.id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await assertClinicAccess(role, userId, doc.clinicId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!canReviewOpening(role))
    return NextResponse.json({ error: "Only a super admin, finance or clinic manager can reject an opening balance" }, { status: 403 });

  const transition = checkTransition(doc.status, "REJECTED");
  if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: transition.status });

  const updated = await prisma.openingBalance.update({
    where: { id: doc.id },
    data: { status: "REJECTED", reviewedById: userId, reviewedAt: new Date(), reviewNote: parsed.data.reason },
  });
  return NextResponse.json({ ok: true, status: updated.status });
}
