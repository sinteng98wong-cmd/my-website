import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json();
  const data: Record<string, any> = {};
  if (b.commissionType !== undefined) data.commissionType = b.commissionType;
  if (b.rate           !== undefined) data.rate           = b.rate;
  if (b.isActive       !== undefined) data.isActive       = b.isActive;
  if (b.notes          !== undefined) data.notes          = b.notes || null;

  const row = await prisma.referralCommissionConfig.update({ where: { id: params.id }, data });
  return NextResponse.json(row);
}
