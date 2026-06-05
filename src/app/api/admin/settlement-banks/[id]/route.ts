import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN = ["SUPER_ADMIN", "FINANCE"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ADMIN.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, any> = {};
  if (body.name           !== undefined) data.name = body.name;
  if (body.settlementDays !== undefined) data.settlementDays = Number(body.settlementDays);
  if (body.isActive       !== undefined) data.isActive = !!body.isActive;

  const bank = await prisma.settlementBank.update({ where: { id: params.id }, data });
  return NextResponse.json(bank);
}
