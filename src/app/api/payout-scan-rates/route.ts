import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SCAN_RATES, getEffectiveScanRates } from "@/services/locum-payout.service";

const MANAGE = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];

/**
 * GET /api/payout-scan-rates?clinicId=...
 * Returns { effective, saved, defaults }.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const clinicId = req.nextUrl.searchParams.get("clinicId") || null;
  const [effective, saved] = await Promise.all([
    getEffectiveScanRates(clinicId),
    (prisma as any).payoutScanRate.findMany({
      where:   { OR: [{ clinicId: null }, ...(clinicId ? [{ clinicId }] : [])] },
      orderBy: { code: "asc" },
    }).catch(() => []),
  ]);
  return NextResponse.json({ effective, saved, defaults: DEFAULT_SCAN_RATES });
}

/**
 * POST /api/payout-scan-rates
 * Body: { clinicId?, code, label, rate, active? } — upsert one scan rate.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string | undefined;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!MANAGE.includes(role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as {
    clinicId?: string | null; code?: string; label?: string; rate?: number; active?: boolean;
  } | null;

  const code = body?.code?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 422 });
  const rate = Number(body?.rate);
  if (!isFinite(rate) || rate < 0) return NextResponse.json({ error: "rate must be 0 or above" }, { status: 422 });

  const data = {
    clinicId: body?.clinicId || null,
    code,
    label:    body?.label?.trim() || code,
    rate,
    active:   body?.active ?? true,
  };

  const existing = await (prisma as any).payoutScanRate.findFirst({
    where: { clinicId: data.clinicId, code: data.code },
  });
  const saved = existing
    ? await (prisma as any).payoutScanRate.update({ where: { id: existing.id }, data })
    : await (prisma as any).payoutScanRate.create({ data });

  return NextResponse.json(saved);
}
