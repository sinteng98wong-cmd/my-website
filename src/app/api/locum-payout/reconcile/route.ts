/**
 * POST /api/locum-payout/reconcile
 *
 * Runs the monthly reconciliation for a locum doctor:
 *   finalPayout = max(totalEarnedCommissions + flatRates, sessionsWorked × dayRate)
 *
 * Body: { doctorProfileId, month, flatRates? }
 *
 * Returns the full breakdown + all payout lines for the period.
 * Does NOT write anything — read-only calculation.
 * Use /api/commission/locum-statement (POST) to persist the statement.
 *
 * POST /api/locum-payout/reconcile/sweep
 * Body: { doctorProfileId, month }
 * → Bulk-promotes all eligible lines to PENDING_RELEASE at month-end.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { authOptions }               from "@/lib/auth";
import { runMonthlyReconciliation, sweepMonthlyRelease, WorkflowError }
  from "@/services/locum-payout.service";

const MANAGE_ROLES = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role = (session.user as any).role as string;
  if (!MANAGE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { doctorProfileId, month, flatRates, sweep } = body;

  if (!doctorProfileId || !month) {
    return NextResponse.json(
      { error: "doctorProfileId and month are required" },
      { status: 400 },
    );
  }

  // Optional sweep mode: bulk-promote eligible lines before reconciling
  if (sweep) {
    try {
      const sweepResult = await sweepMonthlyRelease(doctorProfileId, month);
      const reconciliation = await runMonthlyReconciliation(doctorProfileId, month, {
        flatRates: Number(flatRates ?? 0),
      });
      return NextResponse.json({ sweep: sweepResult, reconciliation });
    } catch (err) {
      if (err instanceof WorkflowError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
      }
      throw err;
    }
  }

  try {
    const result = await runMonthlyReconciliation(doctorProfileId, month, {
      flatRates: Number(flatRates ?? 0),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof WorkflowError) {
      const status = err.code === "NOT_FOUND" ? 404 : 422;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
