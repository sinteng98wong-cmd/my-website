import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runStaffCommission } from "@/services/staff-commission.service";

/**
 * POST /api/commission/staff/run
 * Body: { clinicId: string, month: "YYYY-MM" }
 *
 * Calculates and upserts DRAFT StaffCommission rows for all active staff
 * at the clinic. Safe to call multiple times — re-running always overwrites
 * DRAFT rows; LOCKED rows are preserved (upsert only touches DRAFT status).
 *
 * Roles: SUPER_ADMIN, FINANCE, CLINIC_MANAGER
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;

  if (!session?.user)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { clinicId?: string; month?: string };
  const { clinicId, month } = body;

  if (!clinicId || !month)
    return NextResponse.json(
      { error: "clinicId and month (YYYY-MM) are required" },
      { status: 422 },
    );

  if (!/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 422 });

  try {
    const result = await runStaffCommission(clinicId, month);
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}
