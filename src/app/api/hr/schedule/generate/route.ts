import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateMonthlySchedule } from "@/lib/schedule";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { clinicId, year, month } = await req.json();
  if (!clinicId || !year || !month) return NextResponse.json({ error: "clinicId, year, month required" }, { status: 422 });

  const result = await generateMonthlySchedule(clinicId, Number(year), Number(month), userId);
  return NextResponse.json({
    ...result,
    warning: result.skipped > 0 ? `${result.skipped} day(s) already had a schedule and were skipped.` : undefined,
  });
}
