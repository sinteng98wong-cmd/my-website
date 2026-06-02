import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const templates = await prisma.kpiTemplate.findMany({
    include: { metrics: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, role: templateRole, description, metrics } = body as {
    name: string; role?: string; description?: string;
    metrics: { name: string; description?: string; unit?: string; target?: number; weight: number; order: number }[];
  };

  if (!name || !metrics?.length) return NextResponse.json({ error: "name and metrics are required" }, { status: 422 });
  const totalWeight = metrics.reduce((s, m) => s + m.weight, 0);
  if (Math.abs(totalWeight - 100) > 0.01) return NextResponse.json({ error: `Metric weights must sum to 100 (got ${totalWeight})` }, { status: 422 });

  const template = await prisma.kpiTemplate.create({
    data: {
      name, description, role: templateRole as any ?? null,
      metrics: { create: metrics.map((m) => ({ name: m.name, description: m.description, unit: m.unit, target: m.target, weight: m.weight, order: m.order })) },
    },
    include: { metrics: true },
  });
  return NextResponse.json(template, { status: 201 });
}
