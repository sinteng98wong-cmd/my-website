/**
 * PATCH /api/hr/payroll/[id]/slip/[staffProfileId]/release
 *
 * Final step: once the bank payment has been approved by the 2nd approver and
 * the payslip is PAID, HR manually releases it to the employee. Only released
 * payslips are visible under "My Payslips" and emailed out.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HR_PAYROLL_ROLES } from "@/lib/payroll-workflow";
import { generatePaySlipPdf } from "@/lib/payslip-pdf";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function PATCH(_req: NextRequest, { params }: { params: { id: string; staffProfileId: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  const userId = (session?.user as any)?.id as string;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!HR_PAYROLL_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const slip = await prisma.paySlip.findFirst({
    where: { payrollRunId: params.id, staffProfileId: params.staffProfileId },
    include: {
      payrollRun: { select: { month: true } },
      staffProfile: { select: { user: { select: { name: true, email: true } } } },
    },
  });
  if (!slip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (slip.status === "RELEASED") return NextResponse.json({ ok: true, status: "RELEASED" });
  if (slip.status !== "PAID")
    return NextResponse.json({ error: "Only a paid payslip can be released to the employee." }, { status: 409 });

  const updated = await prisma.paySlip.update({
    where: { id: slip.id },
    data: { status: "RELEASED", releasedById: userId, releasedAt: new Date() },
  });

  // Email the payslip PDF (best-effort — release must not fail on mail issues)
  if (resend) {
    try {
      const buf = await generatePaySlipPdf(slip.id);
      await resend.emails.send({
        from: "DentalOS <no-reply@dentalos.my>",
        to: slip.staffProfile.user.email,
        subject: `Payslip — ${slip.payrollRun.month}`,
        html: `<p>Dear ${slip.staffProfile.user.name},</p><p>Your payslip for ${slip.payrollRun.month} is attached. Net salary: RM ${Number(slip.netSalary).toFixed(2)}.</p>`,
        attachments: [{ filename: `payslip-${slip.payrollRun.month}.pdf`, content: buf.toString("base64") }],
      });
    } catch (e) {
      console.error("Payslip email failed:", e);
    }
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
