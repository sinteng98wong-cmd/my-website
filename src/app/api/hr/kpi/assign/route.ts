import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { autoPopulateKpiActuals } from "@/lib/kpi";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { staffProfileId, templateId, period } = await req.json() as { staffProfileId: string; templateId: string; period: string };
  if (!staffProfileId || !templateId || !period) return NextResponse.json({ error: "staffProfileId, templateId and period are required" }, { status: 422 });

  const existing = await prisma.staffKpi.findFirst({ where: { staffProfileId, period } });
  if (existing) return NextResponse.json({ error: `A KPI already exists for this staff for period ${period}` }, { status: 409 });

  const template = await prisma.kpiTemplate.findUnique({ where: { id: templateId }, include: { metrics: true } });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const staffKpi = await prisma.staffKpi.create({
    data: {
      staffProfileId, templateId, period, status: "DRAFT",
      results: { create: template.metrics.map((m) => ({ metricId: m.id })) },
    },
  });

  // Auto-populate in background — don't fail if it errors
  autoPopulateKpiActuals(staffKpi.id, period).catch(console.error);

  return NextResponse.json(staffKpi, { status: 201 });
}
