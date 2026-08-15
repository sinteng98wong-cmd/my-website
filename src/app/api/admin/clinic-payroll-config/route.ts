/**
 * GET /api/admin/clinic-payroll-config?clinicId=xxx
 * PUT /api/admin/clinic-payroll-config
 *
 * Per-clinic payroll settings: the 1st and 2nd payment approvers, the branch
 * Head Nurse who may submit monthly attendance, and the Lunch OT permission.
 * Approvers are chosen per clinic — the Payment Voucher director/PIC are only
 * offered as a convenience, never applied automatically.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAYROLL_SETTINGS, checkApproverPair } from "@/lib/payroll-workflow";

const MANAGE_ROLES = ["SUPER_ADMIN", "FINANCE"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clinicId = req.nextUrl.searchParams.get("clinicId");
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 422 });

  const [cfg, candidates, nurses] = await Promise.all([
    prisma.clinicPayrollConfig.findUnique({
      where: { clinicId },
      include: {
        firstApprover: { select: { id: true, name: true } },
        secondApprover: { select: { id: true, name: true } },
        headNurse: { select: { id: true, user: { select: { name: true } } } },
      },
    }),
    // Anyone attached to the clinic can be named as an approver.
    prisma.user.findMany({
      where: { active: true, userClinics: { some: { clinicId } } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.staffProfile.findMany({
      where: { clinicId },
      select: { id: true, employeeId: true, jobTitle: true, user: { select: { name: true, role: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  return NextResponse.json({
    clinicId,
    ...DEFAULT_PAYROLL_SETTINGS,
    ...(cfg
      ? {
          firstApproverId: cfg.firstApproverId,
          secondApproverId: cfg.secondApproverId,
          headNurseStaffProfileId: cfg.headNurseStaffProfileId,
          lunchOtAllowed: cfg.lunchOtAllowed,
          lunchOtMaxMinutes: cfg.lunchOtMaxMinutes,
        }
      : {}),
    firstApproverName: cfg?.firstApprover?.name ?? null,
    secondApproverName: cfg?.secondApprover?.name ?? null,
    headNurseName: cfg?.headNurse?.user.name ?? null,
    candidates,
    nurses: nurses.map((n) => ({
      id: n.id,
      name: n.user.name,
      role: n.user.role,
      employeeId: n.employeeId,
      jobTitle: n.jobTitle,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!MANAGE_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    clinicId?: string;
    firstApproverId?: string | null;
    secondApproverId?: string | null;
    headNurseStaffProfileId?: string | null;
    lunchOtAllowed?: boolean;
    lunchOtMaxMinutes?: number;
  };
  if (!body.clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 422 });

  const pair = checkApproverPair(body.firstApproverId, body.secondApproverId);
  if (!pair.ok) return NextResponse.json({ error: pair.error }, { status: pair.status });

  if (body.lunchOtMaxMinutes !== undefined && (body.lunchOtMaxMinutes < 0 || body.lunchOtMaxMinutes > 480))
    return NextResponse.json({ error: "Lunch OT cap must be between 0 and 480 minutes" }, { status: 422 });

  const data = {
    firstApproverId: body.firstApproverId || null,
    secondApproverId: body.secondApproverId || null,
    headNurseStaffProfileId: body.headNurseStaffProfileId || null,
    lunchOtAllowed: body.lunchOtAllowed ?? false,
    lunchOtMaxMinutes: body.lunchOtMaxMinutes ?? 60,
  };

  const cfg = await prisma.clinicPayrollConfig.upsert({
    where: { clinicId: body.clinicId },
    create: { clinicId: body.clinicId, ...data },
    update: data,
  });

  return NextResponse.json(cfg);
}
