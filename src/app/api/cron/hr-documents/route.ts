import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = "DentalOS HR <no-reply@dentalos.my>";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date();
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);

  const expiring = await (prisma as any).staffDocument.findMany({
    where: { expiryDate: { lte: in30 } },
    include: { staffProfile: { include: { user: { select: { name: true } } } } },
  });

  if (!expiring.length) return NextResponse.json({ sent: 0 });

  const byClinic = new Map<string, { staffName: string; title: string; expiry: Date; expired: boolean }[]>();
  for (const doc of expiring) {
    const cid = doc.staffProfile.clinicId;
    if (!byClinic.has(cid)) byClinic.set(cid, []);
    byClinic.get(cid)!.push({ staffName: doc.staffProfile.user.name, title: doc.title, expiry: doc.expiryDate, expired: doc.expiryDate < today });
  }

  let sent = 0;
  for (const [clinicId, items] of byClinic) {
    const managers = await prisma.userClinic.findMany({
      where: { clinicId },
      include: { user: { select: { email: true, role: true, active: true } } },
    });
    const emails = managers.filter(m => m.user.active && ["CLINIC_MANAGER","SUPER_ADMIN"].includes(m.roleOverride ?? m.user.role)).map(m => m.user.email);
    if (!emails.length || !resend) continue;
    const rows = items.map(i => `<li>${i.staffName} — ${i.title} (${i.expired ? "EXPIRED" : "expires"} ${new Date(i.expiry).toLocaleDateString("en-MY")})</li>`).join("");
    try {
      await resend.emails.send({ from: FROM, to: emails, subject: "Staff document expiry alert",
        html: `<p>The following staff documents are expiring or have expired:</p><ul>${rows}</ul>` });
      sent++;
    } catch {}
  }

  return NextResponse.json({ sent, docs: expiring.length });
}
