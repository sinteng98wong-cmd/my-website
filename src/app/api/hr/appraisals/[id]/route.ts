import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const appraisal = await prisma.appraisal.findUnique({
    where: { id: params.id },
    include: {
      staffProfile: { select: { id: true, user: { select: { id: true, name: true, email: true, role: true } } } },
      reviewer: { select: { id: true, name: true, email: true } },
    },
  });
  if (!appraisal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(appraisal);
}
