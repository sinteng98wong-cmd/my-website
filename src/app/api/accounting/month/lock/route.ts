import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string;
  const userId  = (session?.user as any)?.id   as string;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { clinicId, month } = await req.json();
  if (!clinicId || !month) return NextResponse.json({ error: "clinicId and month required" }, { status: 422 });

  const { count } = await (prisma as any).accountingLedgerEntry.updateMany({
    where: { clinicId, settlementMonth: month, isLocked: false },
    data: { isLocked: true, lockedAt: new Date(), lockedById: userId },
  });

  const lock = await (prisma as any).accountingMonthLock.create({
    data: { clinicId, month, lockedById: userId },
  });

  return NextResponse.json({ locked: true, entryCount: count, lock });
}
