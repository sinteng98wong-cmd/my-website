import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { restoreLeaveBalance } from "@/lib/leave";
import { emailLeaveWithdrawn } from "@/lib/leave-email";

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role   = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);

  const leave = await prisma.leaveApplication.findUnique({
    where: { id: params.id },
    include: { staffProfile: { select: { id: true, userId: true, user: { select: { name: true } } } } },
  });
  if (!leave) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = leave.staffProfile.userId === userId;

  // Staff may withdraw their own PENDING; managers may cancel APPROVED
  if (leave.status === "PENDING") {
    if (!isOwner && !isManager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (leave.status === "APPROVED") {
    if (!isManager) return NextResponse.json({ error: "Only a manager can cancel approved leave" }, { status: 403 });
  } else {
    return NextResponse.json({ error: `Cannot cancel a ${leave.status} leave` }, { status: 400 });
  }

  const wasApproved = leave.status === "APPROVED";
  const newStatus = isOwner && leave.status === "PENDING" ? "WITHDRAWN" : "CANCELLED";

  await prisma.leaveApplication.update({ where: { id: params.id }, data: { status: newStatus } });

  // Restore balance (from taken if it was approved, else from pending)
  await restoreLeaveBalance(leave.staffProfileId, leave.leaveType, Number(leave.totalDays), new Date(leave.startDate).getFullYear(), wasApproved);

  // If it was approved, un-mark the schedule off days
  if (wasApproved) {
    await prisma.staffSchedule.updateMany({
      where: { staffProfileId: leave.staffProfileId, date: { gte: leave.startDate, lte: leave.endDate } },
      data: { isOff: false },
    });
  }

  if (newStatus === "WITHDRAWN") {
    await emailLeaveWithdrawn(leave.clinicId, leave.staffProfile.user.name, leave.leaveType);
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
