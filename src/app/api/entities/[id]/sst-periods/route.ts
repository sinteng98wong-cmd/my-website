import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSstFilingPeriods } from "@/lib/financial-year";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE"].includes(role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entity = await prisma.entity.findUnique({ where: { id: params.id }, select: { financialYearStartMonth: true } });
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fyYear = parseInt(new URL(req.url).searchParams.get("fyYear") ?? String(new Date().getFullYear()));
  const periods = getSstFilingPeriods(entity.financialYearStartMonth ?? 1, fyYear);
  return NextResponse.json(periods.map((p) => ({
    ...p,
    startDate: p.startDate.toISOString(),
    endDate:   p.endDate.toISOString(),
    dueDate:   p.dueDate.toISOString(),
  })));
}
