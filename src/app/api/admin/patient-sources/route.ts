import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** GET — active sources, ordered. Available to all authenticated users (needed for forms). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const sources = await prisma.patientSource.findMany({
    where:   { isActive: true },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(sources);
}

/** POST — create a source. SUPER_ADMIN only. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description, order } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 422 });

  let finalOrder = order;
  if (finalOrder === undefined) {
    const max = await prisma.patientSource.aggregate({ _max: { order: true } });
    finalOrder = (max._max.order ?? 0) + 1;
  }

  const source = await prisma.patientSource.create({
    data: { name: name.trim(), description: description?.trim() || null, order: finalOrder },
  });
  return NextResponse.json(source, { status: 201 });
}
