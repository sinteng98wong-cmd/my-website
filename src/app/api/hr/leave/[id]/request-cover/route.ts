import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailCoverRequested } from "@/lib/leave-email";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { staffProfileId, notes } = await req.json();
  if (!staffProfileId) return NextResponse.json({ error: "staffProfileId required" }, { status: 422 });

  const leave = await prisma.leaveApplication.findUnique({
    where: { id: params.id },
    include: { staffProfile: { select: { user: { select: { name: true } } } } },
  });
  if (!leave) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cover = await prisma.leaveCoverRequest.create({
    data: { leaveApplicationId: params.id, requestedStaffId: staffProfileId, status: "PENDING", notes: notes || null },
  });

  const requested = await prisma.staffProfile.findUnique({
    where: { id: staffProfileId }, select: { user: { select: { email: true } } },
  });
  if (requested) await emailCoverRequested(requested.user.email, leave.staffProfile.user.name, leave.startDate, leave.endDate);

  return NextResponse.json(cover, { status: 201 });
}
