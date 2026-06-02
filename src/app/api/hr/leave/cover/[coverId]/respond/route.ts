import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailCoverResponded } from "@/lib/leave-email";

export async function PATCH(req: NextRequest, { params }: { params: { coverId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const cover = await prisma.leaveCoverRequest.findUnique({
    where: { id: params.coverId },
    include: {
      requestedStaff: { select: { id: true, userId: true, user: { select: { name: true } } } },
      leaveApplication: { select: { clinicId: true, startDate: true, endDate: true, staffProfileId: true } },
    },
  });
  if (!cover) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only the requested cover staff may respond
  if (cover.requestedStaff.userId !== userId) {
    return NextResponse.json({ error: "Only the requested staff can respond" }, { status: 403 });
  }

  const { accept, notes } = await req.json();
  const status = accept ? "ACCEPTED" : "DECLINED";

  await prisma.leaveCoverRequest.update({
    where: { id: params.coverId },
    data: { status, offeredByStaffId: accept ? cover.requestedStaff.id : null, notes: notes || cover.notes },
  });

  // On accept: assign the cover staff to the schedule for the leave dates
  if (accept) {
    const { clinicId, startDate, endDate } = cover.leaveApplication;
    const cur = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    const last = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
    while (cur <= last) {
      if (cur.getUTCDay() !== 0) {
        await prisma.staffSchedule.upsert({
          where: { staffProfileId_clinicId_date: { staffProfileId: cover.requestedStaff.id, clinicId, date: new Date(cur) } },
          update: { isOff: false, notes: "Covering leave" },
          create: { staffProfileId: cover.requestedStaff.id, clinicId, date: new Date(cur), isOff: false, notes: "Covering leave" },
        });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  await emailCoverResponded(cover.leaveApplication.clinicId, cover.requestedStaff.user.name, accept);
  return NextResponse.json({ ok: true, status });
}
