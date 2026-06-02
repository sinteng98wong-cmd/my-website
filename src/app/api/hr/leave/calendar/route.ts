import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const clinicId = sp.get("clinicId");
  const month = sp.get("month"); // YYYY-MM
  if (!month) return NextResponse.json({ error: "month required" }, { status: 422 });

  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end   = new Date(y, m, 1);

  const leaves = await prisma.leaveApplication.findMany({
    where: {
      status: "APPROVED",
      ...(clinicId ? { clinicId } : {}),
      startDate: { lt: end },
      endDate:   { gte: start },
    },
    include: { staffProfile: { select: { user: { select: { name: true, role: true } } } } },
    orderBy: { startDate: "asc" },
  });

  return NextResponse.json(leaves.map((l) => ({
    id: l.id,
    staffName: l.staffProfile.user.name,
    role: l.staffProfile.user.role,
    leaveType: l.leaveType,
    startDate: l.startDate,
    endDate: l.endDate,
    totalDays: Number(l.totalDays),
  })));
}
