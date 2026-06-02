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

  const probation = await prisma.staffProfile.findMany({
    where: {
      employmentStatus: "PROBATION",
      confirmationDate: { gte: today, lte: in30 },
    },
    include: {
      user: { select: { name: true } },
      // get clinic for manager emails
    },
  });

  if (!probation.length) return NextResponse.json({ sent: 0 });

  // Group by clinic
  const byClinc = new Map<string, { staffName: string; date: Date }[]>();
  for (const p of probation) {
    const cid = p.clinicId;
    if (!byClinc.has(cid)) byClinc.set(cid, []);
    byClinc.get(cid)!.push({ staffName: p.user.name, date: p.confirmationDate! });
  }

  let sent = 0;
  for (const [clinicId, items] of byClinc) {
    const managers = await prisma.userClinic.findMany({
      where: { clinicId },
      include: { user: { select: { email: true, role: true, active: true } } },
    });
    const emails = managers.filter(m => m.user.active && ["CLINIC_MANAGER","SUPER_ADMIN"].includes(m.roleOverride ?? m.user.role)).map(m => m.user.email);
    if (!emails.length || !resend) continue;
    const rows = items.map(i => `<li>${i.staffName} — confirmation due ${i.date.toLocaleDateString("en-MY")}</li>`).join("");
    try {
      await resend.emails.send({ from: FROM, to: emails, subject: "Probation ending reminder",
        html: `<p>The following staff have probation ending within 30 days. Please confirm or extend their employment:</p><ul>${rows}</ul>` });
      sent += emails.length;
    } catch {}
  }

  return NextResponse.json({ sent, staff: probation.length });
}
