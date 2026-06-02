import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateDoctorComprehensivePayroll } from "@/services/doctor-payroll.service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { doctorId?: string; month?: string; commit?: boolean };
  const { doctorId: rawId, month, commit = false } = body;

  if (!rawId || !month)
    return NextResponse.json({ error: "doctorId and month are required (month = YYYY-MM)" }, { status: 422 });

  if (!/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 422 });

  // rawId may be a User.id — resolve to DoctorProfile.id
  let doctorProfileId = rawId;
  const maybeProfile = await prisma.doctorProfile.findUnique({
    where: { id: rawId }, select: { id: true },
  });
  if (!maybeProfile) {
    // Try treating it as a User.id
    const byUser = await prisma.doctorProfile.findUnique({
      where: { userId: rawId }, select: { id: true },
    });
    if (!byUser)
      return NextResponse.json({ error: `No DoctorProfile found for id "${rawId}"` }, { status: 404 });
    doctorProfileId = byUser.id;
  }

  try {
    const result = await calculateDoctorComprehensivePayroll(doctorProfileId, month);

    // Serialise Decimal values to numbers for JSON
    const payload = {
      doctorId:              result.doctorId,
      contractType:          result.contractType,
      grossCalculatedTarget: result.grossCalculatedTarget.toNumber(),
      disbursement: {
        salarySlip: Object.fromEntries(
          Object.entries(result.disbursement.salarySlip).map(([k, v]) => [k, (v as any).toNumber()])
        ),
        serviceVoucher: {
          professionalFees: result.disbursement.serviceVoucher.professionalFees.toNumber(),
        },
      },
      opsCount: result.ops.length,
    };

    // Only write to DB when commit=true (preview mode by default)
    if (commit && result.ops.length > 0) {
      await prisma.$transaction(result.ops);
      return NextResponse.json({ ...payload, committed: true });
    }

    return NextResponse.json({ ...payload, committed: false });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}
