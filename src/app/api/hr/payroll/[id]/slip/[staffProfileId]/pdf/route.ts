import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generatePaySlipPdf } from "@/lib/payslip-pdf";

export async function GET(_req: NextRequest, { params }: { params: { id: string; staffProfileId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;

  const slip = await prisma.paySlip.findFirst({
    where: { payrollRunId: params.id, staffProfileId: params.staffProfileId },
    include: { staffProfile: { select: { userId: true } } },
  });
  if (!slip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isManager = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role);
  if (!isManager && slip.staffProfile.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const buf = await generatePaySlipPdf(slip.id);
  return new NextResponse(buf as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="payslip-${params.id}-${params.staffProfileId}.pdf"`,
    },
  });
}
