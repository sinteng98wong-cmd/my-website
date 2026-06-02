import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { claimType, limitAmount, period } = await req.json();
  if (!claimType || limitAmount === undefined || !period) {
    return NextResponse.json({ error: "claimType, limitAmount, period required" }, { status: 422 });
  }

  const row = await prisma.claimLimit.upsert({
    where: { claimType },
    update: { limitAmount: Number(limitAmount), period },
    create: { claimType, limitAmount: Number(limitAmount), period, isActive: true },
  });
  return NextResponse.json(row);
}
