import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function guard(session: any) {
  return ["SUPER_ADMIN", "FINANCE"].includes((session?.user as any)?.role);
}

const INCLUDE = {
  patient: { select: { id: true, name: true, patientRef: true } },
  doctor:  { select: { id: true, name: true } },
  clinic:  { select: { id: true, name: true } },
  basedOnInvoice: { select: { id: true, invoiceRef: true, total: true } },
} as const;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!guard(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const referralType = sp.get("referralType");
  const month = sp.get("month"); // YYYY-MM

  let createdAt: any = undefined;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    createdAt = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
  }

  const rows = await prisma.referralCommission.findMany({
    where: {
      ...(status ? { status: status as any } : {}),
      ...(referralType ? { referralType: referralType as any } : {}),
      ...(createdAt ? { createdAt } : {}),
    },
    include: INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!guard(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json();
  if (!b.patientId || !b.referralType || !b.commissionType || b.rate === undefined) {
    return NextResponse.json({ error: "patientId, referralType, commissionType and rate are required" }, { status: 422 });
  }

  let calculatedAmount = Number(b.rate);
  if (b.commissionType === "PERCENTAGE") {
    if (!b.basedOnInvoiceId) return NextResponse.json({ error: "basedOnInvoiceId required for PERCENTAGE" }, { status: 422 });
    const inv = await prisma.invoice.findUnique({ where: { id: b.basedOnInvoiceId }, select: { total: true } });
    if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    calculatedAmount = Math.round(Number(inv.total) * (Number(b.rate) / 100) * 100) / 100;
  }

  const row = await prisma.referralCommission.create({
    data: {
      patientId:      b.patientId,
      referralType:   b.referralType,
      doctorId:       b.referralType === "INTERNAL_DOCTOR" ? b.doctorId || null : null,
      clinicId:       b.referralType === "INTERNAL_CLINIC" ? b.clinicId || null : null,
      externalName:   b.referralType === "EXTERNAL" ? b.externalName || null : null,
      commissionType: b.commissionType,
      rate:           b.rate,
      basedOnInvoiceId: b.basedOnInvoiceId || null,
      calculatedAmount,
      notes:          b.notes || null,
    },
    include: INCLUDE,
  });
  return NextResponse.json(row, { status: 201 });
}
