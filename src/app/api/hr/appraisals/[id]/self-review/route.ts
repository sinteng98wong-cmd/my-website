import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailSelfReviewDone } from "@/lib/hr-email";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const appraisal = await prisma.appraisal.findUnique({
    where: { id: params.id },
    include: { staffProfile: { select: { userId: true, user: { select: { name: true } } } }, reviewer: { select: { email: true } } },
  });
  if (!appraisal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (appraisal.staffProfile.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!["DRAFT", "SELF_REVIEW"].includes(appraisal.status)) return NextResponse.json({ error: "Self-review not allowed in current status" }, { status: 422 });

  const { selfRating, selfComments } = await req.json() as { selfRating: number; selfComments: string };
  if (!selfRating || selfRating < 1 || selfRating > 5) return NextResponse.json({ error: "selfRating must be 1.0 – 5.0" }, { status: 422 });

  const updated = await prisma.appraisal.update({ where: { id: params.id }, data: { selfRating, selfComments, status: "SELF_REVIEW" } });

  if (appraisal.reviewer?.email) {
    emailSelfReviewDone(appraisal.reviewer.email, appraisal.staffProfile.user.name ?? "Staff").catch(console.error);
  }

  return NextResponse.json(updated);
}
