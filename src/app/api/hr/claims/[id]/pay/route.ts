import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const claim = await prisma.staffClaim.findUnique({ where: { id: params.id } });
  if (!claim) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (claim.status !== "APPROVED") return NextResponse.json({ error: `Cannot pay a ${claim.status} claim` }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  await prisma.staffClaim.update({
    where: { id: params.id },
    data: { status: "PAID", paidAt: new Date(), paymentRef: b.paymentRef || null },
  });
  return NextResponse.json({ ok: true, status: "PAID" });
}
