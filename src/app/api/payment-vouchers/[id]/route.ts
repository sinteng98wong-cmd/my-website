import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculatePVTotal } from "@/lib/payment-voucher";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const pv = await prisma.paymentVoucher.findUnique({
    where: { id: params.id },
    include: {
      clinic:   { select: { id: true, name: true, directorId: true, picId: true } },
      supplier: true,
      fromClinic: { select: { id: true, name: true } },
      preparedBy:         { select: { id: true, name: true } },
      directorApprovedBy: { select: { id: true, name: true } },
      picApprovedBy:      { select: { id: true, name: true } },
      rejectedBy:         { select: { id: true, name: true } },
      paidBy:             { select: { id: true, name: true } },
      invoices: {
        include: {
          category: { select: { name: true } },
          labJob: { select: { id: true, labJobRef: true, workDescription: true, estimatedFee: true, invoiceAmount: true } },
          stockInvoice: { select: { id: true, invoiceRef: true, totalAmount: true } },
          poolOrder: { select: { id: true, poRef: true } },
          fromClinic: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!pv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(pv);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.paymentVoucher.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "DRAFT" && existing.status !== "REJECTED")
    return NextResponse.json({ error: "Can only edit DRAFT or REJECTED PVs" }, { status: 409 });

  const body = await req.json();
  const { invoices, ...pvFields } = body;

  const totalAmount = invoices ? calculatePVTotal(invoices) : Number(existing.totalAmount);

  const updated = await prisma.paymentVoucher.update({
    where: { id: params.id },
    data: {
      ...(pvFields.notes       !== undefined ? { notes: pvFields.notes }             : {}),
      ...(pvFields.bankName    !== undefined ? { bankName: pvFields.bankName }       : {}),
      ...(pvFields.accountNo   !== undefined ? { accountNo: pvFields.accountNo }     : {}),
      ...(pvFields.accountName !== undefined ? { accountName: pvFields.accountName } : {}),
      ...(pvFields.supplierId  !== undefined ? { supplierId: pvFields.supplierId }   : {}),
      totalAmount,
      ...(invoices ? {
        invoices: {
          deleteMany: {},
          create: invoices.map((inv: any) => ({
            invoiceType:   inv.invoiceType ?? "GENERAL",
            invoiceNo:     inv.invoiceNo,
            invoiceDate:   new Date(inv.invoiceDate),
            description:   inv.description,
            amount:        Number(inv.amount),
            categoryId:    inv.categoryId || null,
            attachmentUrl: inv.attachmentUrl || null,
            attachmentName: inv.attachmentName || null,
            labJobId:      inv.labJobId || null,
            stockInvoiceId: inv.stockInvoiceId || null,
            poolOrderId:   inv.poolOrderId || null,
            fromClinicId:  inv.fromClinicId || null,
            notes:         inv.notes || null,
          })),
        },
      } : {}),
    },
    include: { invoices: true },
  });

  return NextResponse.json(updated);
}
