import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const row = await prisma.referralCommission.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status !== "APPROVED") return NextResponse.json({ error: "Only APPROVED commissions can be paid" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const updated = await prisma.referralCommission.update({
    where: { id: params.id },
    data:  {
      status: "PAID",
      paidById: userId,
      paidAt: b.paidAt ? new Date(b.paidAt) : new Date(),
      paymentRef: b.paymentRef || null,
      ...(b.notes ? { notes: b.notes } : {}),
    },
  });
  return NextResponse.json(updated);
}
