import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const profile = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json([]);

  // Only payslips HR has explicitly released reach the employee.
  const slips = await prisma.paySlip.findMany({
    where: { staffProfileId: profile.id, status: "RELEASED" },
    include: { payrollRun: { select: { id: true, month: true, status: true } } },
    orderBy: { payrollRun: { month: "desc" } },
  });

  return NextResponse.json(slips.map((s) => ({
    id: s.id,
    payrollRunId: s.payrollRun.id,
    staffProfileId: s.staffProfileId,
    month: s.payrollRun.month,
    status: s.status,
    releasedAt: s.releasedAt,
    grossSalary: Number(s.grossSalary),
    netSalary: Number(s.netSalary),
    downloadUrl: `/api/hr/payroll/${s.payrollRun.id}/slip/${s.staffProfileId}/pdf`,
  })));
}
