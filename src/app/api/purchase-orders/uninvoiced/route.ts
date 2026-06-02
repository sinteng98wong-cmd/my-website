import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER", "STOREKEEPER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pos = await prisma.purchaseOrder.findMany({
    where: {
      status:        { in: ["RECEIVED", "PARTIAL"] },
      stockInvoices: { none: {} },   // exclude POs already linked to an invoice
    },
    include: {
      clinic:   { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      lines: {
        include: { item: { select: { id: true, name: true, sku: true, unit: true, category: true } } },
      },
    },
    orderBy: { receivedAt: "desc" },
  });

  return NextResponse.json(pos);
}
