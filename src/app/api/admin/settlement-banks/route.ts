import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN = ["SUPER_ADMIN", "FINANCE"];

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ADMIN.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const banks = await prisma.settlementBank.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(banks);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ADMIN.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body.name || typeof body.name !== "string")
    return NextResponse.json({ error: "name required" }, { status: 400 });

  const bank = await prisma.settlementBank.create({
    data: {
      name: body.name,
      settlementDays: Number(body.settlementDays ?? 0),
    },
  });
  return NextResponse.json(bank, { status: 201 });
}
