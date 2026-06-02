import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const appraisal = await prisma.appraisal.findUnique({
    where: { id: params.id },
    include: { staffProfile: { select: { userId: true } } },
  });
  if (!appraisal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (appraisal.staffProfile.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (appraisal.status !== "COMPLETED") return NextResponse.json({ error: "Can only acknowledge from COMPLETED status" }, { status: 422 });

  const { comment } = (await req.json().catch(() => ({}))) as { comment?: string };
  const selfComments = comment
    ? `${appraisal.selfComments ?? ""}\n--- Acknowledgement: ${comment}`
    : appraisal.selfComments;

  const updated = await prisma.appraisal.update({
    where: { id: params.id },
    data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), selfComments },
  });
  return NextResponse.json(updated);
}
