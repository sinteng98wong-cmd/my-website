import { Resend } from "resend";
import { prisma } from "./prisma";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = "DentalOS Compliance <no-reply@dentalos.my>";

async function send(to: string | string[], subject: string, html: string) {
  if (!resend || (Array.isArray(to) ? to.length === 0 : !to)) return;
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (e) {
    console.error("License email failed:", e);
  }
}

async function superAdminEmails(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN", active: true },
    select: { email: true },
  });
  return users.map((u) => u.email);
}

async function clinicManagerEmails(clinicId: string): Promise<string[]> {
  const links = await prisma.userClinic.findMany({
    where: { clinicId },
    include: { user: { select: { email: true, role: true, active: true } } },
  });
  return links
    .filter((l) => l.user.active && (l.roleOverride === "CLINIC_MANAGER" || (!l.roleOverride && l.user.role === "CLINIC_MANAGER")))
    .map((l) => l.user.email);
}

export async function sendLicenseExpiryAlert(params: {
  licenseId: string;
  typeName: string;
  licenseNo: string | null;
  entityName: string;
  expiryDate: Date;
  daysRemaining: number;
  scope: "CLINIC" | "DOCTOR";
  clinicId: string | null;
  doctorEmail?: string | null;
}) {
  const { typeName, licenseNo, entityName, expiryDate, daysRemaining, scope, clinicId, doctorEmail } = params;

  const fmt = (d: Date) => new Date(d).toLocaleDateString("en-MY", { dateStyle: "long" });
  const noStr = licenseNo ? ` (${licenseNo})` : "";
  const subject = `License Expiry Alert: ${typeName} — ${daysRemaining} days`;
  const html = `
    <p><strong>${typeName}${noStr}</strong> for <strong>${entityName}</strong>
    expires on <strong>${fmt(expiryDate)}</strong> (${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining).</p>
    <p>Please arrange renewal promptly to maintain compliance.</p>
  `;

  const admins = await superAdminEmails();
  const managers = clinicId ? await clinicManagerEmails(clinicId) : [];
  const recipients = [...new Set([...admins, ...managers, ...(doctorEmail ? [doctorEmail] : [])])];
  await send(recipients, subject, html);
}

export async function sendLicenseExpiredAlert(params: {
  licenseId: string;
  typeName: string;
  licenseNo: string | null;
  entityName: string;
  expiryDate: Date;
  scope: "CLINIC" | "DOCTOR";
  clinicId: string | null;
  doctorEmail?: string | null;
}) {
  const { typeName, licenseNo, entityName, expiryDate, scope, clinicId, doctorEmail } = params;

  const fmt = (d: Date) => new Date(d).toLocaleDateString("en-MY", { dateStyle: "long" });
  const noStr = licenseNo ? ` (${licenseNo})` : "";
  const subject = `⚠ EXPIRED: ${typeName} for ${entityName}`;
  const html = `
    <p style="color:red"><strong>⚠ COMPLIANCE ALERT</strong></p>
    <p><strong>${typeName}${noStr}</strong> for <strong>${entityName}</strong>
    <strong>expired on ${fmt(expiryDate)}</strong>.</p>
    <p>This license is no longer valid. Immediate renewal action is required to avoid regulatory risk.</p>
    ${scope === "DOCTOR" && typeName.includes("APC") ? "<p><strong>⚠ An expired APC means the doctor cannot legally practise. Schedule must be updated immediately.</strong></p>" : ""}
  `;

  const admins = await superAdminEmails();
  const managers = clinicId ? await clinicManagerEmails(clinicId) : [];
  const recipients = [...new Set([...admins, ...managers, ...(doctorEmail ? [doctorEmail] : [])])];
  await send(recipients, subject, html);
}
