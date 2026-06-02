import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: {
      clinic:    { select: { id: true, name: true } },
      supplier:  { select: { id: true, name: true, email: true, phone: true } },
      raisedBy:  { select: { id: true, name: true } },
      stockInvoices: { select: { id: true, invoiceRef: true, totalAmount: true, sst: true, issuedAt: true } },
      lines: {
        include: { item: { select: { id: true, name: true, sku: true, unit: true, category: true } } },
      },
    },
  });

  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(po);
}
