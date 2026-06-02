import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lockStaffCommission, reverseStaffCommission } from "@/services/staff-commission.service";

/**
 * GET  /api/commission/staff/:id  — fetch a single StaffCommission record
 * PATCH /api/commission/staff/:id — transition status: LOCK or REVERSE
 *
 * PATCH body: { action: "lock" | "reverse" }
 * Roles: SUPER_ADMIN, FINANCE (lock/reverse); any authenticated user (GET own record)
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const record = await prisma.staffCommission.findUnique({
    where:   { id: params.id },
    include: { staffProfile: { select: { user: { select: { name: true } } } } },
  });

  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(record);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  const role   = (session?.user as any)?.role as string | undefined;
  const userId = (session?.user as any)?.id  as string | undefined;

  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (!["SUPER_ADMIN", "FINANCE"].includes(role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { action?: string };
  const { action } = body;

  if (!action || !["lock", "reverse"].includes(action))
    return NextResponse.json({ error: "action must be 'lock' or 'reverse'" }, { status: 422 });

  // Verify the record exists and check status transitions
  const existing = await prisma.staffCommission.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "lock") {
    if (existing.status !== "DRAFT" && existing.status !== "PENDING_LOCK")
      return NextResponse.json({ error: "Only DRAFT or PENDING_LOCK records can be locked" }, { status: 409 });

    const updated = await lockStaffCommission(params.id, userId!);
    return NextResponse.json(updated);
  }

  // action === "reverse"
  if (existing.status !== "LOCKED")
    return NextResponse.json({ error: "Only LOCKED records can be reversed" }, { status: 409 });

  const updated = await reverseStaffCommission(params.id);
  return NextResponse.json(updated);
}
