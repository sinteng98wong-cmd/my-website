import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CLAIM_LIMITS } from "@/lib/claims";

const TYPES = ["MEDICAL", "TRANSPORT", "MEAL", "ACCOMMODATION", "TRAINING", "UNIFORM", "TELEPHONE", "OTHER"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const rows = await prisma.claimLimit.findMany();
  const byType = new Map(rows.map((r) => [r.claimType, r]));

  return NextResponse.json(TYPES.map((t) => {
    const row = byType.get(t as any);
    const def = DEFAULT_CLAIM_LIMITS[t];
    return row
      ? { claimType: t, limitAmount: Number(row.limitAmount), period: row.period, isActive: row.isActive, isDefault: false }
      : { claimType: t, limitAmount: def.limit, period: def.period, isActive: true, isDefault: true };
  }));
}
