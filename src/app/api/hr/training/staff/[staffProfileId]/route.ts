import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { staffProfileId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);

  if (!isManager) {
    const profile = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
    if (profile?.id !== params.staffProfileId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const trainings = await prisma.staffTraining.findMany({
    where: { staffProfileId: params.staffProfileId },
    include: { training: true },
    orderBy: { training: { startDate: "desc" } },
  });
  return NextResponse.json(trainings);
}
