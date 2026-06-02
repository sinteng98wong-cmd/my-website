import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);

  const sp = req.nextUrl.searchParams;
  const where: any = {};
  if (sp.get("staffProfileId")) where.staffProfileId = sp.get("staffProfileId");
  if (sp.get("period")) where.period = sp.get("period");
  if (sp.get("clinicId")) where.staffProfile = { clinicId: sp.get("clinicId") };

  if (!isManager) {
    const profile = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
    where.staffProfileId = profile?.id ?? "__none__";
  }

  const kpis = await prisma.staffKpi.findMany({
    where,
    include: {
      template: { select: { name: true } },
      staffProfile: { select: { id: true, user: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(kpis);
}
