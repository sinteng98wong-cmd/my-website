import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, clinicScopeFor, clinicWhere } from "@/lib/clinic-access";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scope = await clinicScopeFor(role, userId);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const pos = await prisma.purchaseOrder.findMany({
    where: {
      ...clinicWhere(scope.clinicIds),
      status:        { in: ["RECEIVED", "PARTIAL"] },
      stockInvoice:  { is: null },   // exclude POs already linked to an invoice
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
