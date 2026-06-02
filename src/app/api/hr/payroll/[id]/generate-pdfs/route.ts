import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Payslip PDFs are streamed on demand by the .../pdf route. This endpoint
 * records the stable URL for each slip so the UI can link/download.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const slips = await prisma.paySlip.findMany({ where: { payrollRunId: params.id }, select: { id: true, staffProfileId: true } });
  const urls: string[] = [];
  for (const s of slips) {
    const url = `/api/hr/payroll/${params.id}/slip/${s.staffProfileId}/pdf`;
    await prisma.paySlip.update({ where: { id: s.id }, data: { slipUrl: url } });
    urls.push(url);
  }
  return NextResponse.json({ generated: urls.length, urls });
}
