import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const training = await prisma.training.findUnique({
    where: { id: params.id },
    include: {
      participants: {
        include: { staffProfile: { select: { id: true, user: { select: { name: true, role: true } } } } },
        orderBy: { staffProfile: { user: { name: "asc" } } },
      },
    },
  });
  if (!training) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(training);
}
