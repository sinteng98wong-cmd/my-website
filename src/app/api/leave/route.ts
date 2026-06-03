import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json([], { status: 200 });

    const role   = (session.user as any)?.role;
    const userId = (session.user as any)?.id;
    const { searchParams } = new URL(req.url);
    const month  = searchParams.get("month");
    const clinicId = searchParams.get("clinicId");

    // Managers see all; staff see own
    const isManager = ["SUPER_ADMIN","CLINIC_MANAGER","FINANCE"].includes(role);

    const where: any = {};
    if (!isManager) where.staffId = userId;
    if (clinicId)   where.clinicId = clinicId;
    if (month) {
      const [y, m] = month.split("-").map(Number);
      where.fromDate = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    }

    const leaves = await (prisma as any).staffLeave.findMany({
      where,
      include: {
        staff:      { select: { name: true, role: true } },
        clinic:     { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { appliedAt: "desc" },
    });

    return NextResponse.json(leaves);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const userId = (session.user as any)?.id;
    const body   = await req.json();
    const { leaveType, fromDate, toDate, reason, clinicId } = body;

    if (!leaveType || !fromDate || !toDate || !clinicId) {
      return NextResponse.json({ error: "leaveType, fromDate, toDate, clinicId required" }, { status: 422 });
    }

    const from = new Date(fromDate);
    const to   = new Date(toDate);
    const days = Math.max(0.5, Math.round(
      (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1);

    const count = await (prisma as any).staffLeave.count();
    const leaveRef = `LV-${String(count + 1).padStart(5, "0")}`;

    const leave = await (prisma as any).staffLeave.create({
      data: {
        leaveRef, staffId: userId, clinicId, leaveType,
        fromDate: from, toDate: to, days,
        reason: reason || null, status: "PENDING",
      },
      include: {
        staff:  { select: { name: true, role: true } },
        clinic: { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
    });

    return NextResponse.json(leave, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
