import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runPayroll } from "@/lib/payroll";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clinicId, month } = await req.json();
  if (!clinicId || !month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "clinicId and month (YYYY-MM) required" }, { status: 422 });
  }

  try {
    const run = await runPayroll(clinicId, month, userId);
    return NextResponse.json(run, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
