import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { restoreLeaveBalance } from "@/lib/leave";
import { emailLeaveRejected } from "@/lib/leave-email";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role   = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body?.reviewNote?.trim()) return NextResponse.json({ error: "A reason (reviewNote) is required" }, { status: 422 });

  const leave = await prisma.leaveApplication.findUnique({
    where: { id: params.id },
    include: { staffProfile: { select: { id: true, user: { select: { email: true } } } } },
  });
  if (!leave) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (leave.status !== "PENDING") return NextResponse.json({ error: `Cannot reject a ${leave.status} leave` }, { status: 400 });

  await prisma.leaveApplication.update({
    where: { id: params.id },
    data: { status: "REJECTED", reviewedById: userId, reviewedAt: new Date(), reviewNote: body.reviewNote.trim() },
  });

  // Clear pending days
  await restoreLeaveBalance(leave.staffProfileId, leave.leaveType, Number(leave.totalDays), new Date(leave.startDate).getFullYear(), false);

  await emailLeaveRejected(leave.staffProfile.user.email, leave.leaveType, body.reviewNote.trim());
  return NextResponse.json({ ok: true, status: "REJECTED" });
}
