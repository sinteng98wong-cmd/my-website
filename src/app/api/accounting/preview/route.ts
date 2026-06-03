import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSalesBook, getCashReceived, getAccountingSummary } from "@/lib/accounting-export";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const clinicId = searchParams.get("clinicId") ?? "";
  const year  = parseInt(searchParams.get("year")  ?? "0");
  const month = parseInt(searchParams.get("month") ?? "0");

  if (!clinicId || !year || !month)
    return NextResponse.json({ error: "clinicId, year, month required" }, { status: 422 });

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const [salesBook, cashReceived, summary, monthLock] = await Promise.all([
    getSalesBook(clinicId, year, month),
    getCashReceived(clinicId, year, month),
    getAccountingSummary(clinicId, year, month),
    (prisma as any).accountingMonthLock.findFirst({
      where: { clinicId, month: monthStr },
      include: { lockedBy: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({
    salesBook, cashReceived, summary,
    isLocked: !!monthLock,
    monthLock: monthLock ? { lockedAt: monthLock.lockedAt, lockedByName: (monthLock.lockedBy as any)?.name } : null,
  });
}
