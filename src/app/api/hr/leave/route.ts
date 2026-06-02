import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateLeaveDays, getLeaveBalance } from "@/lib/leave";
import { emailLeaveApplied } from "@/lib/leave-email";
import type { HrLeaveType } from "@prisma/client";

const NO_BALANCE_CHECK: HrLeaveType[] = ["EMERGENCY", "MATERNITY", "PATERNITY"];

async function genLeaveRef(): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const count = await prisma.leaveApplication.count({ where: { appliedAt: { gte: start, lt: end } } });
  return `LV-${ym}-${String(count + 1).padStart(3, "0")}`;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id as string;

  const sp = req.nextUrl.searchParams;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);

  const where: any = {};
  if (sp.get("status"))         where.status = sp.get("status");
  if (sp.get("staffProfileId")) where.staffProfileId = sp.get("staffProfileId");
  if (sp.get("clinicId"))       where.clinicId = sp.get("clinicId");
  if (sp.get("month")) {
    const [y, m] = sp.get("month")!.split("-").map(Number);
    where.startDate = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
  }

  if (!isManager) {
    const profile = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
    where.staffProfileId = profile?.id ?? "__none__";
  }

  const leaves = await prisma.leaveApplication.findMany({
    where,
    include: {
      staffProfile: { select: { id: true, user: { select: { name: true, role: true } } } },
      clinic: { select: { name: true } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { appliedAt: "desc" },
  });
  return NextResponse.json(leaves);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const profile = await prisma.staffProfile.findUnique({
    where: { userId },
    select: { id: true, clinicId: true, user: { select: { name: true } } },
  });
  if (!profile) return NextResponse.json({ error: "You do not have a staff profile" }, { status: 400 });

  const body = await req.json();
  const { leaveType, startDate, endDate, reason, attachmentUrl } = body as {
    leaveType: HrLeaveType; startDate: string; endDate: string; reason?: string; attachmentUrl?: string;
  };
  if (!leaveType || !startDate || !endDate) {
    return NextResponse.json({ error: "leaveType, startDate and endDate are required" }, { status: 422 });
  }

  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (end < start) return NextResponse.json({ error: "End date is before start date" }, { status: 422 });

  const totalDays = await calculateLeaveDays(start, end, profile.clinicId);
  if (totalDays <= 0) return NextResponse.json({ error: "Selected range has no working days" }, { status: 422 });

  const year = start.getFullYear();
  if (!NO_BALANCE_CHECK.includes(leaveType)) {
    const bal = await getLeaveBalance(profile.id, year, leaveType);
    if (Number(bal.balance) < totalDays) {
      return NextResponse.json(
        { error: `Insufficient ${leaveType} balance. You have ${Number(bal.balance)} day(s), requested ${totalDays}.` },
        { status: 422 }
      );
    }
  }

  const leaveRef = await genLeaveRef();
  const application = await prisma.leaveApplication.create({
    data: {
      leaveRef, staffProfileId: profile.id, clinicId: profile.clinicId,
      leaveType, startDate: start, endDate: end, totalDays,
      reason: reason || null, attachmentUrl: attachmentUrl || null, status: "PENDING",
    },
  });

  // Increment pending on balance
  const bal = await getLeaveBalance(profile.id, year, leaveType);
  await prisma.leaveBalance.update({
    where: { id: bal.id },
    data: {
      pending: Number(bal.pending) + totalDays,
      balance: Number(bal.entitled) + Number(bal.carriedOver) - Number(bal.taken) - (Number(bal.pending) + totalDays),
    },
  });

  await emailLeaveApplied(profile.clinicId, profile.user.name, leaveType, start, end, totalDays);

  return NextResponse.json(application, { status: 201 });
}
