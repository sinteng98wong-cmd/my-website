import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { generatePaySlipPdf } from "@/lib/payslip-pdf";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const run = await prisma.payrollRun.findUnique({
    where: { id: params.id },
    include: { slips: { include: { staffProfile: { select: { user: { select: { name: true, email: true } } } } } }, clinic: { select: { name: true } } },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status !== "DRAFT") return NextResponse.json({ error: `Cannot approve a ${run.status} run` }, { status: 400 });

  await prisma.payrollRun.update({ where: { id: params.id }, data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() } });

  // Email each staff their payslip PDF (best-effort)
  if (resend) {
    const monthLabel = run.month;
    for (const slip of run.slips) {
      try {
        const buf = await generatePaySlipPdf(slip.id);
        await resend.emails.send({
          from: "DentalOS <no-reply@dentalos.my>",
          to: slip.staffProfile.user.email,
          subject: `Payslip — ${monthLabel}`,
          html: `<p>Dear ${slip.staffProfile.user.name},</p><p>Your payslip for ${monthLabel} is attached. Net salary: RM ${Number(slip.netSalary).toFixed(2)}.</p>`,
          attachments: [{ filename: `payslip-${monthLabel}.pdf`, content: buf.toString("base64") }],
        });
      } catch (e) { console.error("Payslip email failed:", e); }
    }
  }

  return NextResponse.json({ ok: true, status: "APPROVED" });
}
