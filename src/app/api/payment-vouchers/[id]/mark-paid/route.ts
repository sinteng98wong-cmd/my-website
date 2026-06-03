import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role   = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id   as string;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pv = await prisma.paymentVoucher.findUnique({ where: { id: params.id } });
  if (!pv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pv.status !== "APPROVED")
    return NextResponse.json({ error: "PV must be APPROVED before marking as paid" }, { status: 409 });

  const body = await req.json();
  if (!body.paymentRef) return NextResponse.json({ error: "paymentRef required" }, { status: 422 });

  const updated = await prisma.paymentVoucher.update({
    where: { id: params.id },
    data: {
      status: "PAID",
      paymentRef:  body.paymentRef,
      paymentDate: body.paymentDate ? new Date(body.paymentDate) : new Date(),
      bankName:    body.bankName    || pv.bankName,
      accountNo:   body.accountNo   || pv.accountNo,
      accountName: body.accountName || pv.accountName,
      paidById:    userId,
      paidAt:      new Date(),
    },
  });

  return NextResponse.json(updated);
}
