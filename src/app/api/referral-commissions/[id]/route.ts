import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!["SUPER_ADMIN", "FINANCE"].includes((session?.user as any)?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await prisma.referralCommission.findUnique({
    where: { id: params.id },
    include: {
      patient: { select: { id: true, name: true, patientRef: true, source: { select: { name: true } } } },
      doctor:  { select: { id: true, name: true } },
      clinic:  { select: { id: true, name: true } },
      basedOnInvoice: { select: { id: true, invoiceRef: true, total: true } },
      approvedBy: { select: { name: true } },
      paidBy:     { select: { name: true } },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
