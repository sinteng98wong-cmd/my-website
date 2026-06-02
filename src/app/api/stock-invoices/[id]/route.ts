import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoice = await prisma.stockInvoice.findUnique({
    where: { id: params.id },
    include: {
      fromEntity: { select: { id: true, legalName: true } },
      deliveryOrders: {
        include: {
          fromClinic: { select: { id: true, name: true } },
          toClinic:   { select: { id: true, name: true } },
          lines: {
            include: { item: { select: { name: true, sku: true, unit: true } } },
          },
        },
      },
    },
  });

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(invoice);
}
