import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generatePvRef, calculatePVTotal } from "@/lib/payment-voucher";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role   = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id   as string;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clinicId   = searchParams.get("clinicId") ?? undefined;
  const status     = searchParams.get("status")   ?? undefined;
  const month      = searchParams.get("month")    ?? undefined;
  const supplierId = searchParams.get("supplierId") ?? undefined;

  let where: any = {};

  if (["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    if (clinicId)   where.clinicId   = clinicId;
    if (supplierId) where.supplierId = supplierId;
    if (status)     where.status     = status;
    if (month) {
      const [y, m] = month.split("-").map(Number);
      where.createdAt = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    }
  } else {
    const clinic = await prisma.clinic.findFirst({
      where: { OR: [{ directorId: userId }, { picId: userId }] },
    });
    if (!clinic) return NextResponse.json([]);
    where.OR = [
      { directorId: userId, status: "PENDING_DIRECTOR" },
      { picId: userId, status: "PENDING_PIC" },
    ];
  }

  const pvs = await prisma.paymentVoucher.findMany({
    where,
    include: {
      supplier: { select: { name: true } },
      clinic:   { select: { name: true } },
      preparedBy: { select: { name: true } },
      _count: { select: { invoices: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(pvs);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role   = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id   as string;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { clinicId, supplierId, fromClinicId, notes, bankName, accountNo, accountName, invoices } = body;

  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 422 });
  if (!invoices || invoices.length === 0) return NextResponse.json({ error: "At least one invoice required" }, { status: 422 });

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { directorId: true, picId: true },
  });

  const pvRef = await generatePvRef(clinicId);
  const totalAmount = calculatePVTotal(invoices);

  const pv = await prisma.paymentVoucher.create({
    data: {
      pvRef,
      clinicId,
      supplierId: supplierId || null,
      fromClinicId: fromClinicId || null,
      status: "DRAFT",
      totalAmount,
      bankName: bankName || null,
      accountNo: accountNo || null,
      accountName: accountName || null,
      notes: notes || null,
      preparedById: userId,
      directorId: clinic?.directorId || null,
      picId: clinic?.picId || null,
      invoices: {
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
    },
    include: { invoices: true },
  });

  return NextResponse.json(pv, { status: 201 });
}
