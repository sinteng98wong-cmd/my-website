import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { calculateDoctorPayrollPayload, type DisciplinaryDeduction } from "@/services/commission.service";

/**
 * GET  /api/commission/payroll-calc?doctorId=X&month=YYYY-MM
 *   Preview the payroll calculation without writing to DB.
 *
 * POST /api/commission/payroll-calc
 *   Body: { doctorId, month, disciplinaryDeductions?: [{description,amount}][] }
 *   Runs the calculation AND persists DoctorCommission DRAFT rows.
 *
 * Roles: SUPER_ADMIN, FINANCE, CLINIC_MANAGER
 */

function forbidden()  { return NextResponse.json({ error: "Forbidden" },       { status: 403 }); }
function unauth()     { return NextResponse.json({ error: "Unauthenticated" }, { status: 401 }); }
function badRequest(msg: string) { return NextResponse.json({ error: msg }, { status: 422 }); }

function guardRole(role: string | undefined) {
  return ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role ?? "");
}

function serialise(obj: unknown): unknown {
  if (obj instanceof Decimal) return obj.toNumber();
  if (Array.isArray(obj))     return obj.map(serialise);
  if (obj !== null && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = serialise(v);
    return out;
  }
  return obj;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauth();
  if (!guardRole((session.user as any).role)) return forbidden();

  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get("doctorId");
  const month    = searchParams.get("month");

  if (!doctorId || !month)     return badRequest("doctorId and month are required");
  if (!/^\d{4}-\d{2}$/.test(month)) return badRequest("month must be YYYY-MM");

  // Resolve User.id → DoctorProfile.id
  let profileId = doctorId;
  const byProfile = await prisma.doctorProfile.findUnique({ where: { id: doctorId }, select: { id: true } });
  if (!byProfile) {
    const byUser = await prisma.doctorProfile.findUnique({ where: { userId: doctorId }, select: { id: true } });
    if (!byUser) return NextResponse.json({ error: `No DoctorProfile for id "${doctorId}"` }, { status: 404 });
    profileId = byUser.id;
  }

  try {
    const result = await calculateDoctorPayrollPayload(profileId, month, {}, prisma);
    return NextResponse.json(serialise(result));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauth();
  if (!guardRole((session.user as any).role)) return forbidden();

  const body = await req.json().catch(() => ({})) as {
    doctorId?: string;
    month?: string;
    disciplinaryDeductions?: { description: string; amount: number }[];
  };

  const { doctorId, month, disciplinaryDeductions = [] } = body;
  if (!doctorId || !month)          return badRequest("doctorId and month are required");
  if (!/^\d{4}-\d{2}$/.test(month)) return badRequest("month must be YYYY-MM");

  let profileId = doctorId;
  const byProfile = await prisma.doctorProfile.findUnique({ where: { id: doctorId }, select: { id: true } });
  if (!byProfile) {
    const byUser = await prisma.doctorProfile.findUnique({ where: { userId: doctorId }, select: { id: true } });
    if (!byUser) return NextResponse.json({ error: `No DoctorProfile for id "${doctorId}"` }, { status: 404 });
    profileId = byUser.id;
  }

  const deductions: DisciplinaryDeduction[] = disciplinaryDeductions.map(d => ({
    description: d.description,
    amount:      new Decimal(d.amount),
  }));

  try {
    const result = await calculateDoctorPayrollPayload(profileId, month, { disciplinaryDeductions: deductions }, prisma);
    return NextResponse.json(serialise(result), { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}
