import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  if (
    !session?.user ||
    !["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const clinicId  = searchParams.get("clinicId")  ?? undefined;
  const month     = searchParams.get("month")     ?? undefined;
  const entityId  = searchParams.get("entityId")  ?? undefined;

  const batches = await db.eInvoiceBatch.findMany({
    where: {
      ...(clinicId  ? { clinicId }  : {}),
      ...(month     ? { month }     : {}),
      ...(entityId  ? { entityId }  : {}),
    },
    include: {
      clinic:        { select: { name: true } },
      panelProvider: { select: { name: true } },
      submittedBy:   { select: { name: true } },
      _count: { select: { invoices: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(batches);
}
