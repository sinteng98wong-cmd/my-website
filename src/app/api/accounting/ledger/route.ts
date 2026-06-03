import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const clinicId = searchParams.get("clinicId") ?? "";
  const month    = searchParams.get("month") ?? "";

  const entries = await (prisma as any).accountingLedgerEntry.findMany({
    where: { clinicId, settlementMonth: month },
    include: {
      lockedBy:      { select: { name: true } },
      panelProvider: { select: { name: true } },
    },
    orderBy: [{ method: "asc" }, { tag: "asc" }],
  });

  return NextResponse.json(entries);
}
