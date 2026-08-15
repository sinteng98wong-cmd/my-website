import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const run = await prisma.payrollRun.findUnique({
    where: { id: params.id },
    include: {
      clinic: { select: { name: true } },
      runBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      lockedBy: { select: { name: true } },
      slips: {
        include: {
          staffProfile: { select: { id: true, employeeId: true, user: { select: { name: true } } } },
          approvedBy: { select: { name: true } },
          releasedBy: { select: { name: true } },
          bankPayment: { select: { id: true, paymentRef: true, status: true } },
        },
        orderBy: { staffProfile: { user: { name: "asc" } } },
      },
    },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cfg = await prisma.clinicPayrollConfig.findUnique({
    where: { clinicId: run.clinicId },
    include: { firstApprover: { select: { id: true, name: true } }, secondApprover: { select: { id: true, name: true } } },
  });
  const userId = (session?.user as any)?.id as string;

  return NextResponse.json({
    ...run,
    payrollConfig: {
      firstApproverId: cfg?.firstApproverId ?? null,
      firstApproverName: cfg?.firstApprover?.name ?? null,
      secondApproverId: cfg?.secondApproverId ?? null,
      secondApproverName: cfg?.secondApprover?.name ?? null,
    },
    viewer: {
      userId,
      isFirstApprover: !!cfg?.firstApproverId && cfg.firstApproverId === userId,
      isSecondApprover: !!cfg?.secondApproverId && cfg.secondApproverId === userId,
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const run = await prisma.payrollRun.findUnique({ where: { id: params.id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status !== "DRAFT") return NextResponse.json({ error: "Only DRAFT runs can be deleted" }, { status: 400 });

  await prisma.paySlip.deleteMany({ where: { payrollRunId: params.id } });
  await prisma.payrollRun.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
