import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const clinicId = new URL(req.url).searchParams.get("clinicId") ?? undefined;
  const providers = await prisma.panelProvider.findMany({
    where: { ...(clinicId ? { clinicId } : {}), active: true },
    select: { id: true, name: true, code: true, clinicId: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(providers);
}
