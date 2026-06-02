import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if ((session.user as any).role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, description, isActive, metrics } = body as {
    name?: string; description?: string; isActive?: boolean;
    metrics?: { id?: string; name: string; description?: string; unit?: string; target?: number; weight: number; order: number }[];
  };

  if (metrics) {
    const totalWeight = metrics.reduce((s, m) => s + m.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) return NextResponse.json({ error: `Metric weights must sum to 100 (got ${totalWeight})` }, { status: 422 });
  }

  const update: any = {};
  if (name !== undefined) update.name = name;
  if (description !== undefined) update.description = description;
  if (isActive !== undefined) update.isActive = isActive;

  const template = await prisma.kpiTemplate.update({ where: { id: params.id }, data: update });

  if (metrics) {
    for (const m of metrics) {
      if (m.id) {
        await prisma.kpiMetric.update({ where: { id: m.id }, data: { name: m.name, description: m.description, unit: m.unit, target: m.target, weight: m.weight, order: m.order } });
      } else {
        await prisma.kpiMetric.create({ data: { templateId: params.id, name: m.name, description: m.description, unit: m.unit, target: m.target, weight: m.weight, order: m.order } });
      }
    }
  }

  const updated = await prisma.kpiTemplate.findUnique({ where: { id: params.id }, include: { metrics: { orderBy: { order: "asc" } } } });
  return NextResponse.json(updated);
}
