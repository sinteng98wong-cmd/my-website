import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const row = await prisma.referralCommission.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status !== "PENDING") return NextResponse.json({ error: "Only PENDING commissions can be approved" }, { status: 400 });

  const updated = await prisma.referralCommission.update({
    where: { id: params.id },
    data:  { status: "APPROVED", approvedById: userId, approvedAt: new Date() },
  });
  return NextResponse.json(updated);
}
