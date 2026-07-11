/**
 * GET  /api/locum-payout?doctorProfileId=X&month=YYYY-MM
 *   → list all payout lines for a doctor + month
 *
 * POST /api/locum-payout
 *   { treatmentId, doctorProfileId, clinicId, month,
 *     treatmentPlanId?, treatmentStageId?, orthoPaymentTrackEnabled? }
 *   → create / recalculate a payout line for a treatment
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { authOptions }               from "@/lib/auth";
import { prisma }                    from "@/lib/prisma";
import { createPayoutLine, WorkflowError } from "@/services/locum-payout.service";

const MANAGE_ROLES = ["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role           = (session.user as any).role as string;
  const sessionDoctorId = (session.user as any).id  as string;

  const { searchParams } = new URL(req.url);
  const doctorProfileId  = searchParams.get("doctorProfileId") ?? "";
  const month            = searchParams.get("month") ?? "";

  if (!doctorProfileId || !month) {
    return NextResponse.json({ error: "doctorProfileId and month are required" }, { status: 400 });
  }

  // Doctors may only view their own lines
  if (role === "DOCTOR") {
    const profile = await prisma.doctorProfile.findUnique({
      where:  { userId: sessionDoctorId },
      select: { id: true },
    });
    if (!profile || profile.id !== doctorProfileId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (!MANAGE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lines = await (prisma as any).locumPayoutLine.findMany({
    where:   { doctorProfileId, month },
    include: {
      treatment: {
        include: {
          treatmentType: { select: { code: true, name: true } },
          visit:         { include: { patient: { select: { name: true, patientRef: true } } } },
          labJob:        { select: { id: true, status: true, invoiceAmount: true } },
        },
      },
      treatmentPlan: {
        select: { id: true, planRef: true, title: true, status: true, totalAmount: true, totalPaid: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(lines);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role = (session.user as any).role as string;
  if (!MANAGE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { treatmentId, doctorProfileId, clinicId, month,
          treatmentPlanId, treatmentStageId, orthoPaymentTrackEnabled } = body;

  if (!treatmentId || !doctorProfileId || !clinicId || !month) {
    return NextResponse.json(
      { error: "treatmentId, doctorProfileId, clinicId, and month are required" },
      { status: 400 },
    );
  }

  try {
    const lineId = await createPayoutLine({
      treatmentId,
      doctorProfileId,
      clinicId,
      month,
      treatmentPlanId,
      treatmentStageId,
      orthoPaymentTrackEnabled,
    });
    return NextResponse.json({ id: lineId }, { status: 201 });
  } catch (err) {
    if (err instanceof WorkflowError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
    }
    throw err;
  }
}
