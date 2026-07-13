import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateShift, ShiftConflictError } from "@/services/shift.service";

const ADMIN = ["SUPER_ADMIN", "CLINIC_MANAGER"];

/**
 * PATCH /api/shifts/[id] — move a shift (day change), reassign branch, or
 * change hours/status. Rejects with 409 if it would overlap another shift at
 * any branch (Conflict Safeguard Engine).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!ADMIN.includes(role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({})) as any;
  try {
    const shift = await updateShift(params.id, {
      ...(b.startTime ? { startTime: new Date(b.startTime) } : {}),
      ...(b.endTime   ? { endTime:   new Date(b.endTime) }   : {}),
      ...(b.branchId  ? { branchId:  b.branchId }            : {}),
      ...(b.status    ? { status:    b.status }              : {}),
    });
    return NextResponse.json(shift);
  } catch (e) {
    if (e instanceof ShiftConflictError) return NextResponse.json({ error: e.message, conflict: true, branch: e.branchName }, { status: 409 });
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === "Shift not found" ? 404 : 400 });
  }
}

/** DELETE /api/shifts/[id] — remove a shift (return to the available pool). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!ADMIN.includes(role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await (prisma as any).shift.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
