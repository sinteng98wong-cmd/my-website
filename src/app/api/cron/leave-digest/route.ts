import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { clinicManagerEmails } from "@/lib/leave-email";
import { getStaffingStatus } from "@/lib/staff-alert";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const fmt = (d: Date) => new Date(d).toLocaleDateString("en-MY", { dateStyle: "medium" });

/**
 * Accepts the `x-cron-secret` header used by this repo's other cron routes and
 * the `Authorization: Bearer <CRON_SECRET>` header Vercel Cron sends. Fails
 * closed when CRON_SECRET is unset, so an unconfigured deployment cannot leave
 * the route open.
 */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Weekly Monday 08:00 digest to each clinic's managers. */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
  const nextWeekEnd = new Date(weekEnd); nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);

  const clinics = await prisma.clinic.findMany({ select: { id: true, name: true } });
  let sent = 0;

  for (const clinic of clinics) {
    const [pending, thisWeek, nextWeek] = await Promise.all([
      prisma.leaveApplication.count({ where: { clinicId: clinic.id, status: "PENDING" } }),
      prisma.leaveApplication.findMany({
        where: { clinicId: clinic.id, status: "APPROVED", startDate: { lt: weekEnd }, endDate: { gte: weekStart } },
        include: { staffProfile: { select: { user: { select: { name: true } } } } },
      }),
      prisma.leaveApplication.findMany({
        where: { clinicId: clinic.id, status: "APPROVED", startDate: { gte: weekEnd, lt: nextWeekEnd } },
        include: { staffProfile: { select: { user: { select: { name: true } } } } },
      }),
    ]);

    // Low-staffing days this week
    const lowDays: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(d.getDate() + i);
      if (d.getDay() === 0) continue;
      const status = await getStaffingStatus(clinic.id, d);
      const shortRoles = status.filter((s) => s.isLow).map((s) => s.role);
      if (shortRoles.length) lowDays.push(`${fmt(d)} — short on ${shortRoles.join(", ")}`);
    }

    const to = await clinicManagerEmails(clinic.id);
    if (!to.length || !resend) continue;

    const html = `
      <h2>Weekly Leave Digest — ${clinic.name}</h2>
      <p><strong>${pending}</strong> pending leave application(s) awaiting review.</p>
      <h3>On leave this week</h3>
      ${thisWeek.length ? `<ul>${thisWeek.map((l) => `<li>${l.staffProfile.user.name} — ${l.leaveType} (${fmt(l.startDate)}–${fmt(l.endDate)})</li>`).join("")}</ul>` : "<p>None.</p>"}
      <h3>Low staffing days this week</h3>
      ${lowDays.length ? `<ul>${lowDays.map((d) => `<li style="color:#b91c1c">${d}</li>`).join("")}</ul>` : "<p>No staffing concerns.</p>"}
      <h3>Upcoming leave next week</h3>
      ${nextWeek.length ? `<ul>${nextWeek.map((l) => `<li>${l.staffProfile.user.name} — ${l.leaveType} (${fmt(l.startDate)}–${fmt(l.endDate)})</li>`).join("")}</ul>` : "<p>None.</p>"}
    `;

    await resend.emails.send({ from: "DentalOS <no-reply@dentalos.my>", to, subject: `Weekly Leave Digest — ${clinic.name}`, html });
    sent++;
  }

  return NextResponse.json({ ok: true, clinicsNotified: sent });
}
