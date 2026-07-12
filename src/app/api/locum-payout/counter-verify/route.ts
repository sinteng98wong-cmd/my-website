import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { step1_counterVerify } from "@/services/locum-payout.service";

const COUNTER_ROLES = ["SUPER_ADMIN", "CLINIC_MANAGER", "FINANCE", "RECEPTIONIST", "NURSE"];

/**
 * POST /api/locum-payout/counter-verify
 * Body: { day: "YYYY-MM-DD", clinicId: string }
 *
 * Counter reconciles the day's collected cash: completes step ① on every
 * payout line for that clinic + day that isn't counter-verified yet. This is
 * the counter's equivalent of the doctor's daily sign-off — it never touches
 * or exposes commission entitlement.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string | undefined;
  const userId  = (session?.user as any)?.id   as string | undefined;

  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!COUNTER_ROLES.includes(role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { day?: string; clinicId?: string };
  const { day, clinicId } = body;
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "day must be YYYY-MM-DD" }, { status: 422 });
  if (!clinicId) return NextResponse.json({ error: "clinicId is required" }, { status: 422 });

  const dayStart = new Date(`${day}T00:00:00+08:00`);
  const dayEnd   = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const lines = await (prisma as any).locumPayoutLine.findMany({
    where: {
      clinicId,
      counterVerifiedAt: null,
      status: { notIn: ["PAID", "VOIDED"] },
      treatment: { visit: { visitDate: { gte: dayStart, lt: dayEnd }, deletedAt: null } },
    },
    select: { id: true },
  });

  let verified = 0;
  const errors: string[] = [];
  for (const { id } of lines as { id: string }[]) {
    try {
      await step1_counterVerify(id, userId!);
      verified++;
    } catch (e: any) {
      errors.push(`${id}: ${e.message}`);
    }
  }

  return NextResponse.json({ verified, ...(errors.length ? { errors } : {}) });
}
