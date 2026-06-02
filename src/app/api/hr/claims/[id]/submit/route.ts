import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const claim = await prisma.staffClaim.findUnique({ where: { id: params.id }, include: { staffProfile: { select: { userId: true } } } });
  if (!claim) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (claim.staffProfile.userId !== userId) return NextResponse.json({ error: "Only the owner can submit" }, { status: 403 });
  if (claim.status !== "DRAFT") return NextResponse.json({ error: `Cannot submit a ${claim.status} claim` }, { status: 400 });

  await prisma.staffClaim.update({ where: { id: params.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  return NextResponse.json({ ok: true, status: "SUBMITTED" });
}
