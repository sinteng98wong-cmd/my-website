import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string;
  if (!session?.user || role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

  const lock = await (prisma as any).accountingMonthLock.findUnique({ where: { id: params.id } });
  if (!lock) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await (prisma as any).accountingLedgerEntry.updateMany({
    where: { clinicId: lock.clinicId, settlementMonth: lock.month },
    data: { isLocked: false, lockedAt: null, lockedById: null },
  });

  await (prisma as any).accountingMonthLock.delete({ where: { id: params.id } });
  return NextResponse.json({ unlocked: true });
}
