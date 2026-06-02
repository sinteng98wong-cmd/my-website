import { Resend } from "resend";
import { prisma } from "./prisma";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = "DentalOS HR <no-reply@dentalos.my>";

async function send(to: string | string[], subject: string, html: string) {
  if (!resend || (Array.isArray(to) ? to.length === 0 : !to)) return;
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (e) {
    console.error("HR email failed:", e);
  }
}

async function staffEmail(staffProfileId: string): Promise<string | null> {
  const p = await prisma.staffProfile.findUnique({ where: { id: staffProfileId }, select: { user: { select: { email: true } } } });
  return p?.user.email ?? null;
}

async function managerEmails(clinicId: string): Promise<string[]> {
  const links = await prisma.userClinic.findMany({
    where: { clinicId },
    include: { user: { select: { email: true, role: true, active: true } } },
  });
  return links
    .filter((l) => l.user.active && (l.roleOverride === "CLINIC_MANAGER" || (!l.roleOverride && l.user.role === "CLINIC_MANAGER")))
    .map((l) => l.user.email);
}

// ── Appraisal emails ─────────────────────────────────────────────────────

export async function emailAppraisalInitiated(staffProfileId: string, period: string, deadline?: string) {
  const to = await staffEmail(staffProfileId);
  if (!to) return;
  const deadlineStr = deadline ? ` by ${deadline}` : "";
  await send(to, `Your ${period} appraisal has been initiated`,
    `<p>Your <strong>${period}</strong> appraisal has been initiated. Please complete your self-review${deadlineStr}.</p>
     <p>Log in to DentalOS to complete your self-review.</p>`);
}

export async function emailSelfReviewDone(reviewerEmail: string, staffName: string) {
  await send(reviewerEmail, `${staffName} has completed their self-review`,
    `<p><strong>${staffName}</strong> has completed their self-review. Please complete your manager review.</p>`);
}

export async function emailAppraisalCompleted(staffProfileId: string) {
  const to = await staffEmail(staffProfileId);
  if (!to) return;
  await send(to, "Your appraisal is ready for review",
    `<p>Your appraisal is ready for review. Please acknowledge it in DentalOS.</p>`);
}

// ── Disciplinary emails ──────────────────────────────────────────────────

export async function emailDisciplinaryNotice(staffProfileId: string, type: string, deadline?: string) {
  const to = await staffEmail(staffProfileId);
  if (!to) return;
  const deadlineStr = deadline ? ` Please respond by <strong>${deadline}</strong>.` : "";
  await send(to, `You have received a ${type} notice`,
    `<p>You have received a <strong>${type}</strong> notice.${deadlineStr}</p>
     <p>Log in to DentalOS to view the notice and submit your response.</p>`);
}

export async function emailDisciplinaryResponded(clinicId: string, staffName: string, type: string) {
  const to = await managerEmails(clinicId);
  await send(to, `${staffName} has responded to their ${type} notice`,
    `<p><strong>${staffName}</strong> has responded to their <strong>${type}</strong> notice. Please review the response.</p>`);
}

// ── Training emails ──────────────────────────────────────────────────────

export async function emailTrainingEnrolled(staffProfileId: string, title: string, startDate: Date, endDate: Date, venue?: string) {
  const to = await staffEmail(staffProfileId);
  if (!to) return;
  const fmt = (d: Date) => new Date(d).toLocaleDateString("en-MY", { dateStyle: "medium" });
  const dates = `${fmt(startDate)} – ${fmt(endDate)}`;
  const venueStr = venue ? ` at <strong>${venue}</strong>` : "";
  await send(to, `Enrolled: ${title}`,
    `<p>You have been enrolled in <strong>${title}</strong> on ${dates}${venueStr}.</p>`);
}

export async function emailTrainingCompleted(staffProfileId: string, title: string) {
  const to = await staffEmail(staffProfileId);
  if (!to) return;
  await send(to, `Training completed: ${title}`,
    `<p>Your training record for <strong>${title}</strong> has been marked as completed. Well done!</p>`);
}
