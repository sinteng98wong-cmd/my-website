/**
 * GET /api/admin/stock-drift?clinicId=
 *
 * Phase 1 acceptance gate: compares ClinicStock against the stock ledger and
 * reports every disagreement plus the ledger's own invariant violations.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { INVENTORY_ROLES, clinicScopeFor } from "@/lib/clinic-access";
import { runDriftDetection } from "@/lib/stock-drift";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = await clinicScopeFor(role, userId, req.nextUrl.searchParams.get("clinicId"));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const report = await runDriftDetection(scope.clinicIds);
  return NextResponse.json(report);
}
