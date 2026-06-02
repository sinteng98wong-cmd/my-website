import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { copyWeekSchedule } from "@/lib/schedule";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { clinicId, fromWeekStart, toWeekStart } = await req.json();
  if (!clinicId || !fromWeekStart || !toWeekStart) {
    return NextResponse.json({ error: "clinicId, fromWeekStart, toWeekStart required" }, { status: 422 });
  }
  const result = await copyWeekSchedule(clinicId, new Date(fromWeekStart), new Date(toWeekStart));
  return NextResponse.json(result);
}
