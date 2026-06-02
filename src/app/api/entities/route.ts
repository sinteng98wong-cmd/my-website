import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const entities = await prisma.entity.findMany({
    orderBy: { legalName: "asc" },
    select: { id: true, legalName: true, sstRegistered: true },
  });

  return NextResponse.json(entities);
}
