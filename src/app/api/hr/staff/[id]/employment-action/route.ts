import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = "DentalOS HR <no-reply@dentalos.my>";
async function sendEmail(to: string, subject: string, html: string) {
  if (!resend || !to) return;
  try { await resend.emails.send({ from: FROM, to, subject, html }); } catch {}
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const performedById = (session.user as any).id as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { action, reason, resignationDate, lastWorkingDate, exitReason, noticePeriodDays } = body;

  const profile = await prisma.staffProfile.findUnique({
    where: { id: params.id },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fromStatus = profile.employmentStatus;
  let toStatus = fromStatus;
  const updateData: any = {};
  const effectiveDate = new Date();

  switch (action) {
    case "CONFIRM":
      if (fromStatus !== "PROBATION") return NextResponse.json({ error: "Staff must be on PROBATION" }, { status: 422 });
      toStatus = "ACTIVE";
      updateData.employmentStatus = "ACTIVE";
      updateData.confirmationDate = effectiveDate;
      await sendEmail(profile.user.email, "Employment Confirmed",
        `<p>Dear ${profile.user.name},</p><p>Congratulations! Your employment has been confirmed effective ${effectiveDate.toLocaleDateString("en-MY")}.</p>`);
      break;

    case "SUSPEND":
      if (!reason) return NextResponse.json({ error: "reason is required" }, { status: 422 });
      toStatus = "SUSPENDED";
      updateData.employmentStatus = "SUSPENDED";
      // Cancel future approved leaves
      await prisma.leaveApplication.updateMany({
        where: { staffProfileId: params.id, status: "APPROVED", startDate: { gt: effectiveDate } },
        data: { status: "CANCELLED" },
      });
      await sendEmail(profile.user.email, "Employment Suspended",
        `<p>Dear ${profile.user.name},</p><p>Your employment has been suspended effective ${effectiveDate.toLocaleDateString("en-MY")}. Reason: ${reason}</p>`);
      break;

    case "RESIGN":
      if (!resignationDate) return NextResponse.json({ error: "resignationDate is required" }, { status: 422 });
      toStatus = "RESIGNED";
      updateData.employmentStatus = "RESIGNED";
      updateData.resignationDate = new Date(resignationDate);
      if (lastWorkingDate) updateData.lastWorkingDate = new Date(lastWorkingDate);
      if (noticePeriodDays) updateData.noticePeriodDays = noticePeriodDays;
      break;

    case "TERMINATE":
      if (role !== "SUPER_ADMIN") return NextResponse.json({ error: "Only SUPER_ADMIN can terminate" }, { status: 403 });
      if (!reason) return NextResponse.json({ error: "reason is required" }, { status: 422 });
      toStatus = "TERMINATED";
      updateData.employmentStatus = "TERMINATED";
      if (lastWorkingDate) updateData.lastWorkingDate = new Date(lastWorkingDate);
      // Deactivate user account
      await prisma.user.update({ where: { id: profile.userId }, data: { active: false } });
      // Cancel future schedules and leaves
      await prisma.leaveApplication.updateMany({
        where: { staffProfileId: params.id, status: { in: ["PENDING","APPROVED"] }, startDate: { gt: effectiveDate } },
        data: { status: "CANCELLED" },
      });
      break;

    case "REINSTATE":
      if (fromStatus !== "SUSPENDED") return NextResponse.json({ error: "Staff must be SUSPENDED to reinstate" }, { status: 422 });
      toStatus = "ACTIVE";
      updateData.employmentStatus = "ACTIVE";
      await sendEmail(profile.user.email, "Employment Reinstated",
        `<p>Dear ${profile.user.name},</p><p>Your employment has been reinstated effective ${effectiveDate.toLocaleDateString("en-MY")}.</p>`);
      break;

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 422 });
  }

  await prisma.staffProfile.update({ where: { id: params.id }, data: updateData });
  await (prisma as any).employmentHistory.create({
    data: { staffProfileId: params.id, action, fromStatus, toStatus, reason: reason || exitReason, effectiveDate, performedById },
  });

  return NextResponse.json({ success: true, action, fromStatus, toStatus });
}
