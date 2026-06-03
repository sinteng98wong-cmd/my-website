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
  if (pv.status === "PAID") return NextResponse.json({ error: "Cannot reject a paid PV" }, { status: 409 });

  const isDirector  = pv.directorId === userId;
  const isSuperAdmin = role === "SUPER_ADMIN";
  if (!isDirector && !isSuperAdmin)
    return NextResponse.json({ error: "Only the assigned director or Super Admin can reject" }, { status: 403 });

  const { rejectionReason } = await req.json();
  if (!rejectionReason) return NextResponse.json({ error: "rejectionReason is required" }, { status: 422 });

  const updated = await prisma.paymentVoucher.update({
    where: { id: params.id },
    data: { status: "REJECTED", rejectedById: userId, rejectedAt: new Date(), rejectionReason },
  });

  return NextResponse.json(updated);
}
