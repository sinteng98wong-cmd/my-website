import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string;
  const userId  = (session?.user as any)?.id   as string;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE"].includes(role))
    return NextResponse.json({ error: "Forbidden — Finance or Super Admin only" }, { status: 403 });

  const updated = await (prisma as any).accountingLedgerEntry.update({
    where: { id: params.id },
    data: { isLocked: true, lockedAt: new Date(), lockedById: userId },
  });

  return NextResponse.json(updated);
}
