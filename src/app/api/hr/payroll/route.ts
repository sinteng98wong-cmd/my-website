import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const clinicId = sp.get("clinicId");
  const month = sp.get("month");

  const runs = await prisma.payrollRun.findMany({
    where: { ...(clinicId ? { clinicId } : {}), ...(month ? { month } : {}) },
    include: { clinic: { select: { name: true } }, _count: { select: { slips: true } } },
    orderBy: { month: "desc" },
  });
  return NextResponse.json(runs);
}
