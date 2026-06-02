import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [supplier, invoices, payments] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: params.id } }),
    prisma.stockInvoice.findMany({
      where:   { supplierId: params.id },
      include: {
        deliveryOrders: { select: { id: true, doRef: true, toClinic: { select: { name: true } } } },
        fromEntity:     { select: { legalName: true } },
      },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.supplierPayment.findMany({
      where:   { supplierId: params.id },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.totalAmount) + Number(i.sst), 0);
  const totalPaid     = payments.reduce((s, p) => s + Number(p.amount), 0);
  const outstanding   = totalInvoiced - totalPaid;

  return NextResponse.json({ supplier, invoices, payments, totalInvoiced, totalPaid, outstanding });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  const userId  = (session?.user as any)?.id;
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { amount, paidAt, reference, notes } = await req.json();
  if (!amount || amount <= 0) return NextResponse.json({ error: "amount must be positive" }, { status: 422 });

  const payment = await prisma.supplierPayment.create({
    data: {
      supplierId: params.id,
      amount,
      paidAt:     paidAt ? new Date(paidAt) : new Date(),
      reference:  reference || null,
      notes:      notes     || null,
      recordedBy: userId,
    },
  });

  return NextResponse.json(payment, { status: 201 });
}
