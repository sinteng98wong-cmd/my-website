import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { autoPopulateKpiActuals } from "@/lib/kpi";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const kpi = await prisma.staffKpi.findUnique({ where: { id: params.id }, select: { period: true } });
  if (!kpi) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await autoPopulateKpiActuals(params.id, kpi.period);
  return NextResponse.json({ updatedMetrics: updated });
}
