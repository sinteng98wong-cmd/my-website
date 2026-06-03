import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFinancialYearOptions } from "@/lib/financial-year";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entity = await prisma.entity.findUnique({ where: { id: params.id }, select: { financialYearStartMonth: true } });
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const options = getFinancialYearOptions(entity.financialYearStartMonth ?? 1);
  return NextResponse.json(options.map((o) => ({ ...o, start: o.start.toISOString(), end: o.end.toISOString() })));
}
