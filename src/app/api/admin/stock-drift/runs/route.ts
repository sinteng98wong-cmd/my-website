/**
 * GET /api/admin/stock-drift/runs — history of scheduled drift checks.
 *
 * Run metadata (timing, outcome, counts) is system-level. The findings inside
 * each run name specific clinics and items, so they are filtered to the
 * caller's own clinics and the counts are recomputed for that scope — a branch
 * user never sees another branch's stock through the monitoring history.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVENTORY_ROLES, clinicScopeFor, hasGlobalClinicScope } from "@/lib/clinic-access";
import { scopeFindings } from "@/lib/stock-drift-run";
import type { DriftFinding } from "@/lib/stock-drift";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id   as string;
  if (!INVENTORY_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = await clinicScopeFor(role, userId);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 30, 100);
  const runs = await prisma.stockDriftRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });

  const global = hasGlobalClinicScope(role);

  return NextResponse.json({
    scoped: !global,
    runs: runs.map((r) => {
      const all = (r.findings as unknown as DriftFinding[]) ?? [];
      const visible = scopeFindings(all, scope.clinicIds);
      return {
        id: r.id,
        trigger: r.trigger,
        status: r.status,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        durationMs: r.durationMs,
        clean: r.clean,
        alertSentAt: r.alertSentAt,
        errorMessage: r.errorMessage,
        // Group-wide roles see the true totals; branch users see their slice.
        positions:    global ? r.positions : undefined,
        movements:    global ? r.movements : undefined,
        errorCount:   global ? r.errorCount   : visible.filter((f) => f.severity === "ERROR").length,
        warningCount: global ? r.warningCount : visible.filter((f) => f.severity === "WARNING").length,
        infoCount:    global ? r.infoCount    : undefined,
        findings: visible,
      };
    }),
  });
}
