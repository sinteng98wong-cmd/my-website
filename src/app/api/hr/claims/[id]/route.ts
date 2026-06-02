import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;

  const claim = await prisma.staffClaim.findUnique({
    where: { id: params.id },
    include: {
      staffProfile: { select: { userId: true, user: { select: { name: true } } } },
      reviewedBy: { select: { name: true } },
    },
  });
  if (!claim) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isManager = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);
  if (!isManager && claim.staffProfile.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(claim);
}
