import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MANAGE = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];

/**
 * PATCH /api/doctors/[id]/rate   ([id] = DoctorProfile.id)
 * Body: { defaultRate?: number (0-100), dayRate?: number }
 * Updates the doctor's personal commission percentage and/or day rate.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string | undefined;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!MANAGE.includes(role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { defaultRate?: number; dayRate?: number };
  const data: Record<string, number> = {};

  if (body.defaultRate !== undefined) {
    const r = Number(body.defaultRate);
    if (!isFinite(r) || r < 0 || r > 100) return NextResponse.json({ error: "defaultRate must be between 0 and 100" }, { status: 422 });
    data.defaultRate = r;
  }
  if (body.dayRate !== undefined) {
    const r = Number(body.dayRate);
    if (!isFinite(r) || r < 0) return NextResponse.json({ error: "dayRate must be 0 or above" }, { status: 422 });
    data.dayRate = r;
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Provide defaultRate and/or dayRate" }, { status: 400 });

  try {
    const updated = await prisma.doctorProfile.update({
      where: { id: params.id },
      data,
      select: { id: true, defaultRate: true, dayRate: true },
    });
    return NextResponse.json({ id: updated.id, defaultRate: Number(updated.defaultRate), dayRate: updated.dayRate ? Number(updated.dayRate) : null });
  } catch {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }
}
