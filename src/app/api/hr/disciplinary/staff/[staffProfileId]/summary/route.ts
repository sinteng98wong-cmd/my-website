import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { staffProfileId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const records = await prisma.disciplinary.findMany({
    where: { staffProfileId: params.staffProfileId },
    select: { type: true, status: true },
  });

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const r of records) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }

  return NextResponse.json({ total: records.length, byType, byStatus, openCount: byStatus["OPEN"] ?? 0 });
}
