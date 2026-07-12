import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SCHEMES, getEffectiveSchemes, type StageRule } from "@/services/locum-payout.service";

const MANAGE = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];

/**
 * GET /api/payout-schemes?clinicId=...
 * Returns { effective, saved, defaults }:
 *  - effective: the merged rules currently applied for the clinic
 *  - saved:     raw DB rows (global + clinic) for editing
 *  - defaults:  built-in defaults for reference / reset
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const clinicId = req.nextUrl.searchParams.get("clinicId") || null;

  const [effective, saved] = await Promise.all([
    getEffectiveSchemes(clinicId),
    (prisma as any).payoutScheme.findMany({
      where:   { OR: [{ clinicId: null }, ...(clinicId ? [{ clinicId }] : [])] },
      orderBy: [{ name: "asc" }],
    }).catch(() => []),
  ]);

  return NextResponse.json({ effective, saved, defaults: DEFAULT_SCHEMES });
}

/**
 * POST /api/payout-schemes
 * Body: { id?, clinicId?, name, matchCodes, subTypes, paymentTracked, stages, active }
 * Creates or updates a scheme. Stage percents must sum to 100 (±0.01) unless
 * the scheme is paymentTracked or being deactivated.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string | undefined;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!MANAGE.includes(role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as {
    id?: string; clinicId?: string | null; name?: string;
    matchCodes?: string[]; subTypes?: string[];
    paymentTracked?: boolean; stages?: StageRule[]; active?: boolean;
  } | null;

  if (!body?.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 422 });

  const stages = (body.stages ?? []).map(s => ({
    name:    String(s.name ?? "").trim(),
    percent: Number(s.percent),
    ...(s.requiresLabInvoice  ? { requiresLabInvoice: true } : {}),
    ...(s.paymentThresholdPct ? { paymentThresholdPct: Number(s.paymentThresholdPct) } : {}),
    ...(s.requiresCaseComplete ? { requiresCaseComplete: true } : {}),
  }));

  if (stages.some(s => !s.name || !isFinite(s.percent) || s.percent <= 0))
    return NextResponse.json({ error: "Every stage needs a name and a percent above 0" }, { status: 422 });

  const active = body.active ?? true;
  const paymentTracked = !!body.paymentTracked;
  if (active && !paymentTracked) {
    const sum = stages.reduce((s, r) => s + r.percent, 0);
    if (Math.abs(sum - 100) > 0.01)
      return NextResponse.json({ error: `Stage percents must total 100% (currently ${sum}%)` }, { status: 422 });
  }

  const data = {
    clinicId:       body.clinicId || null,
    name:           body.name.trim(),
    matchCodes:     (body.matchCodes ?? []).map(c => c.trim().toUpperCase()).filter(Boolean),
    subTypes:       (body.subTypes ?? []).map(c => c.trim()).filter(Boolean),
    paymentTracked,
    stages,
    active,
  };

  const scheme = body.id
    ? await (prisma as any).payoutScheme.update({ where: { id: body.id }, data })
    : await (prisma as any).payoutScheme.upsert({
        where:  { clinicId_name: { clinicId: data.clinicId, name: data.name } },
        update: data,
        create: data,
      }).catch(async (e: any) => {
        // clinicId null can't hit the compound unique — fall back to manual find
        const existing = await (prisma as any).payoutScheme.findFirst({
          where: { clinicId: data.clinicId, name: data.name },
        });
        if (existing) return (prisma as any).payoutScheme.update({ where: { id: existing.id }, data });
        return (prisma as any).payoutScheme.create({ data });
      });

  return NextResponse.json(scheme);
}
