import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateKpiScore } from "@/lib/kpi";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updates = await req.json() as { metricId: string; actual: number; notes?: string }[];

  for (const u of updates) {
    await prisma.kpiResult.updateMany({ where: { staffKpiId: params.id, metricId: u.metricId }, data: { actual: u.actual, notes: u.notes } });
  }

  const kpi = await prisma.staffKpi.findUnique({
    where: { id: params.id },
    include: { template: { include: { metrics: true } }, results: true },
  });
  if (!kpi) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const score = calculateKpiScore(kpi.template.metrics, kpi.results);
  await prisma.staffKpi.update({ where: { id: params.id }, data: { overallScore: score } });

  return NextResponse.json({ overallScore: score });
}
