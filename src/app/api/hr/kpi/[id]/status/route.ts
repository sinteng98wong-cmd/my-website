import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateKpiScore } from "@/lib/kpi";

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["COMPLETED"],
  COMPLETED: ["ARCHIVED"],
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { status: newStatus } = await req.json() as { status: string };
  const kpi = await prisma.staffKpi.findUnique({
    where: { id: params.id },
    include: { template: { include: { metrics: true } }, results: true },
  });
  if (!kpi) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!TRANSITIONS[kpi.status]?.includes(newStatus)) {
    return NextResponse.json({ error: `Cannot transition from ${kpi.status} to ${newStatus}` }, { status: 422 });
  }
  if (newStatus === "ARCHIVED" && role !== "SUPER_ADMIN") return NextResponse.json({ error: "Only SUPER_ADMIN can archive KPIs" }, { status: 403 });

  const data: any = { status: newStatus };
  if (newStatus === "COMPLETED") {
    data.overallScore = calculateKpiScore(kpi.template.metrics, kpi.results);
  }

  const updated = await prisma.staffKpi.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}
