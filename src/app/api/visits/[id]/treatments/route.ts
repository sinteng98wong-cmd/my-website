import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const AddSchema = z.object({
  treatmentTypeId: z.string().min(1),
  doctorId:        z.string().min(1).optional(),
  billedAmount:    z.number().nonnegative(),
  subType:         z.string().optional(), // material / variant, e.g. PFM, Valplast
  hasLab:          z.boolean().optional(), // category requires lab work (vendor may be TBD)
  labFee:          z.number().nonnegative().default(0),
  // Lab job fields — vendor is optional; the doctor assigns it after assessing the case
  labVendorId:     z.string().min(1).optional(),
  labDescription:  z.string().optional(),
  labExpectedDate: z.string().optional(),
  labEstimatedFee: z.number().nonnegative().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body   = await req.json().catch(() => null);
  const parsed = AddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const visit = await prisma.visit.findUnique({ where: { id: params.id } });
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

  const d = parsed.data;

  // Get doctor profile id from user id
  let doctorProfileId: string | undefined;
  if (d.doctorId) {
    const dp = await prisma.doctorProfile.findUnique({ where: { userId: d.doctorId } });
    doctorProfileId = dp?.id;
  }

  // Create treatment
  const treatment = await prisma.treatment.create({
    data: {
      visitId:         params.id,
      treatmentTypeId: d.treatmentTypeId,
      doctorId:        doctorProfileId ?? null,
      billedAmount:    d.billedAmount,
      collectedAmount: 0,
      labFee:          d.labFee,
    },
    include: {
      treatmentType: { select: { id: true, name: true } },
      doctor: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  // Lab-work categories always get a LabJob — even without a vendor yet.
  // The job tracks the pending invoice; the doctor assigns the vendor after
  // assessing the case (Lab section).
  if (d.hasLab || d.labFee > 0 || d.labVendorId) {
    const count  = await prisma.labJob.count();
    const labJobRef = `LJ-${String(count + 1).padStart(5, "0")}`;

    const labJob = await prisma.labJob.create({
      data: {
        labJobRef,
        visitId:         params.id,
        clinicId:        visit.clinicId,
        vendorId:        d.labVendorId ?? null,
        estimatedFee:    d.labEstimatedFee ?? d.labFee,
        workDescription: d.labDescription ?? null,
        expectedDate:    d.labExpectedDate ? new Date(d.labExpectedDate) : null,
        status:          "ORDERED",
        treatments:      { connect: [{ id: treatment.id }] },
      },
      include: {
        vendor: { select: { id: true, name: true } },
      },
    });

    // Also update labFee on treatment and link labJob
    await prisma.treatment.update({
      where: { id: treatment.id },
      data:  { labJobId: labJob.id },
    });

    await createPayoutLineBestEffort(treatment.id, d.subType);
    return NextResponse.json({ treatment: { ...treatment, labJob }, labJob }, { status: 201 });
  }

  await createPayoutLineBestEffort(treatment.id, d.subType);
  return NextResponse.json({ treatment }, { status: 201 });
}

/** Daily sales → payout: create the doctor's payout line for this treatment.
 *  Best-effort — a payout failure must never block treatment recording. */
async function createPayoutLineBestEffort(treatmentId: string, subType?: string) {
  try {
    const { ensurePayoutLineForTreatment } = await import("@/services/locum-payout.service");
    await ensurePayoutLineForTreatment(treatmentId, undefined, { subType });
  } catch (e) {
    console.error("Payout line auto-create failed:", e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const treatmentId = new URL(req.url).searchParams.get("treatmentId");
  if (!treatmentId) return NextResponse.json({ error: "Missing treatmentId" }, { status: 400 });

  await prisma.treatment.delete({ where: { id: treatmentId } });
  return NextResponse.json({ ok: true });
}
