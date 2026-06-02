import { Resend } from "resend";
import { prisma } from "./prisma";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = "DentalOS <no-reply@dentalos.my>";

/** Best-effort send — never throws (email must not break the request flow). */
async function send(to: string | string[], subject: string, html: string) {
  if (!resend || (Array.isArray(to) ? to.length === 0 : !to)) return;
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (e) {
    console.error("Leave email failed:", e);
  }
}

/** Manager emails for a given clinic. */
export async function clinicManagerEmails(clinicId: string): Promise<string[]> {
  const links = await prisma.userClinic.findMany({
    where: { clinicId },
    include: { user: { select: { email: true, role: true, active: true } } },
  });
  return links
    .filter((l) => l.user.active && (l.roleOverride === "CLINIC_MANAGER" || (!l.roleOverride && l.user.role === "CLINIC_MANAGER")))
    .map((l) => l.user.email);
}

const fmtDate = (d: Date) => new Date(d).toLocaleDateString("en-MY", { dateStyle: "medium" });

export async function emailLeaveApplied(clinicId: string, staffName: string, leaveType: string, start: Date, end: Date, totalDays: number) {
  const to = await clinicManagerEmails(clinicId);
  await send(to, `Leave application — ${staffName}`,
    `<p><strong>${staffName}</strong> has applied for <strong>${leaveType}</strong> leave from ${fmtDate(start)} to ${fmtDate(end)} (${totalDays} day${totalDays === 1 ? "" : "s"}).</p>
     <p>Please review it in the HR leave dashboard.</p>`);
}

export async function emailLeaveApproved(staffEmail: string, leaveType: string, start: Date, end: Date) {
  await send(staffEmail, "Your leave has been approved",
    `<p>Your <strong>${leaveType}</strong> leave from ${fmtDate(start)} to ${fmtDate(end)} has been <strong>approved</strong>.</p>`);
}

export async function emailLeaveRejected(staffEmail: string, leaveType: string, reason: string) {
  await send(staffEmail, "Your leave has been rejected",
    `<p>Your <strong>${leaveType}</strong> leave application was <strong>rejected</strong>.</p><p>Reason: ${reason}</p>`);
}

export async function emailLeaveWithdrawn(clinicId: string, staffName: string, leaveType: string) {
  const to = await clinicManagerEmails(clinicId);
  await send(to, `Leave withdrawn — ${staffName}`,
    `<p><strong>${staffName}</strong> has withdrawn their <strong>${leaveType}</strong> leave application.</p>`);
}

export async function emailCoverRequested(coverEmail: string, absentName: string, start: Date, end: Date) {
  await send(coverEmail, "Cover request",
    `<p><strong>${absentName}</strong> is on leave from ${fmtDate(start)} to ${fmtDate(end)}.</p>
     <p>Can you cover their shift? Please respond in the system.</p>`);
}

export async function emailCoverResponded(clinicId: string, coverName: string, accepted: boolean) {
  const to = await clinicManagerEmails(clinicId);
  await send(to, `Cover ${accepted ? "accepted" : "declined"} — ${coverName}`,
    `<p><strong>${coverName}</strong> has ${accepted ? "agreed to cover" : "declined to cover"} the shift.</p>`);
}
