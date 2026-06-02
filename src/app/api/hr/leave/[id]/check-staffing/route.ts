import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLowStaffAlert } from "@/lib/staff-alert";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const alert = await checkLowStaffAlert(params.id);
  if (!alert) return NextResponse.json({ error: "Leave not found" }, { status: 404 });
  return NextResponse.json(alert);
}
