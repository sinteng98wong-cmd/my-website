import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateKpiScore } from "@/lib/kpi";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const kpi = await prisma.staffKpi.findUnique({
    where: { id: params.id },
    include: {
      template: { include: { metrics: { orderBy: { order: "asc" } } } },
      staffProfile: { select: { id: true, user: { select: { name: true, role: true } } } },
      results: true,
    },
  });
  if (!kpi) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const score = calculateKpiScore(kpi.template.metrics, kpi.results);
  return NextResponse.json({ ...kpi, calculatedScore: score });
}
