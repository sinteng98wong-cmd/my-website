import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role   = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id   as string;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const pv = await prisma.paymentVoucher.findUnique({ where: { id: params.id } });
  if (!pv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pv.status !== "PENDING_DIRECTOR")
    return NextResponse.json({ error: "Can only withdraw PVs in PENDING_DIRECTOR status" }, { status: 409 });

  const isPreparer  = pv.preparedById === userId;
  const isSuperAdmin = role === "SUPER_ADMIN";
  const isFinance   = role === "FINANCE";
  if (!isPreparer && !isSuperAdmin && !isFinance)
    return NextResponse.json({ error: "Only the preparer or Finance/Super Admin can withdraw" }, { status: 403 });

  const updated = await prisma.paymentVoucher.update({
    where: { id: params.id },
    data: { status: "DRAFT", submittedAt: null },
  });

  return NextResponse.json(updated);
}
