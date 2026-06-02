import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deductLeaveBalance } from "@/lib/leave";
import { checkLowStaffAlert } from "@/lib/staff-alert";
import { emailLeaveApproved } from "@/lib/leave-email";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role   = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const leave = await prisma.leaveApplication.findUnique({
    where: { id: params.id },
    include: { staffProfile: { select: { id: true, user: { select: { email: true } } } } },
  });
  if (!leave) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (leave.status !== "PENDING") return NextResponse.json({ error: `Cannot approve a ${leave.status} leave` }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const confirmed = body?.confirmed === true;
  const reviewNote = body?.reviewNote as string | undefined;

  // Low-staff gate
  if (!confirmed) {
    const alert = await checkLowStaffAlert(params.id);
    if (alert?.hasAlert) {
      const n = new Set(alert.affectedDates.map((d) => d.date.toISOString().slice(0, 10))).size;
      return NextResponse.json({
        requiresConfirmation: true,
        alert,
        message: `Approving this leave will leave the clinic understaffed on ${n} day(s). Review cover suggestions and confirm to proceed.`,
      });
    }
  }

  // Approve
  const year = new Date(leave.startDate).getFullYear();
  await prisma.leaveApplication.update({
    where: { id: params.id },
    data: { status: "APPROVED", reviewedById: userId, reviewedAt: new Date(), reviewNote: reviewNote || null },
  });
  await deductLeaveBalance(leave.staffProfileId, leave.leaveType, Number(leave.totalDays), year);

  // Mark schedule days as off for the leave window
  await prisma.staffSchedule.updateMany({
    where: { staffProfileId: leave.staffProfileId, date: { gte: leave.startDate, lte: leave.endDate } },
    data: { isOff: true },
  });

  await emailLeaveApproved(leave.staffProfile.user.email, leave.leaveType, leave.startDate, leave.endDate);

  return NextResponse.json({ ok: true, status: "APPROVED" });
}
