import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/commission/doctor/treatment/:treatmentId
 *
 * Returns all DoctorCommission rows for the same treatment across all doctors.
 * Used by the adjustment modal to show the full split picture and validate
 * that all doctors' shares sum to 100%.
 *
 * Roles: SUPER_ADMIN, FINANCE, CLINIC_MANAGER
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { treatmentId: string } },
) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string | undefined;

  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.doctorCommission.findMany({
    where:   { treatmentId: params.treatmentId, status: { not: "REVERSED" } },
    include: {
      treatment: {
        select: {
          billedAmount:  true,
          labFee:        true,
          sst:           true,
          treatmentType: { select: { name: true, code: true } },
          visit: {
            select: {
              patient: { select: { id: true, name: true } },
            },
          },
          labJob: {
            select: {
              invoiceNumber: true,
              invoiceAmount: true,
              estimatedFee:  true,
              vendor:        { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Resolve each doctorId → doctor name via DoctorProfile → User
  const enriched = await Promise.all(rows.map(async row => {
    const profile = await prisma.doctorProfile.findUnique({
      where:  { id: row.doctorId },
      select: { user: { select: { name: true } } },
    });
    return {
      id:          row.id,
      doctorId:    row.doctorId,
      doctorName:  profile?.user?.name ?? "Unknown",
      doctorSplit: Number(row.doctorSplit),
      doctorRate:  Number(row.doctorRate),
      labFee:      Number(row.labFee),
      txAmount:    Number(row.txAmount),
      commission:  Number(row.commission),
      finalPayout: Number(row.finalPayout),
      status:      row.status,
    };
  }));

  const totalSplit = enriched.reduce((s, r) => s + r.doctorSplit, 0);

  const firstTreatment = rows[0]?.treatment;
  return NextResponse.json({
    treatmentId:   params.treatmentId,
    treatmentName: firstTreatment?.treatmentType.name ?? "",
    patientId:     firstTreatment?.visit.patient.id   ?? "",
    patientName:   firstTreatment?.visit.patient.name ?? "",
    txAmount:      Number(firstTreatment?.billedAmount ?? 0),
    labFee:        Number(firstTreatment?.labFee       ?? 0),
    sst:           Number(firstTreatment?.sst          ?? 0),
    labJob:        firstTreatment?.labJob ?? null,
    rows:          enriched,
    totalSplit,
    splitValid:    Math.abs(totalSplit - 100) < 0.01,
  });
}

/**
 * POST /api/commission/doctor/treatment/:treatmentId
 * Body: { doctorProfileId, doctorSplit, doctorRate, month }
 *
 * Creates a new DoctorCommission DRAFT row for a co-doctor on this treatment.
 * Validates that the new total split will not exceed 100%.
 *
 * Roles: SUPER_ADMIN, FINANCE, CLINIC_MANAGER
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { treatmentId: string } },
) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string | undefined;

  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as {
    doctorProfileId?:    string;
    doctorSplit?:        number;
    doctorRate?:         number;
    month?:              string;
    /** Unsaved in-modal changes to existing rows — applied before validating the total. */
    pendingAdjustments?: { rowId: string; newSplit: number }[];
  };

  const { doctorProfileId, doctorSplit, doctorRate, month, pendingAdjustments = [] } = body;

  if (!doctorProfileId || doctorSplit === undefined || doctorRate === undefined || !month)
    return NextResponse.json(
      { error: "doctorProfileId, doctorSplit, doctorRate, and month are required" },
      { status: 422 },
    );

  if (doctorSplit <= 0 || doctorSplit > 100)
    return NextResponse.json({ error: "doctorSplit must be between 1 and 100" }, { status: 422 });
  if (doctorRate < 0 || doctorRate > 100)
    return NextResponse.json({ error: "doctorRate must be between 0 and 100" }, { status: 422 });

  // Verify the doctor profile exists
  const profile = await prisma.doctorProfile.findUnique({
    where: { id: doctorProfileId },
    select: { id: true },
  });
  if (!profile)
    return NextResponse.json({ error: `No DoctorProfile found for id "${doctorProfileId}"` }, { status: 404 });

  // Check for duplicate — this doctor already has a row for this treatment
  const existing = await prisma.doctorCommission.findFirst({
    where: { treatmentId: params.treatmentId, doctorId: doctorProfileId, status: { not: "REVERSED" } },
  });
  if (existing)
    return NextResponse.json({ error: "This doctor already has a commission row for this treatment" }, { status: 409 });

  // Check total split won't exceed 100.
  // Apply any pending (unsaved) adjustments from the modal before calculating.
  const existingRows = await prisma.doctorCommission.findMany({
    where:  { treatmentId: params.treatmentId, status: { not: "REVERSED" } },
    select: { id: true, doctorSplit: true },
  });
  const existingTotal = existingRows.reduce((s, r) => {
    const pending = pendingAdjustments.find(a => a.rowId === r.id);
    return s + (pending !== undefined ? pending.newSplit : Number(r.doctorSplit));
  }, 0);
  if (existingTotal + doctorSplit > 100.01)
    return NextResponse.json(
      { error: `Adding ${doctorSplit}% would bring total split to ${Math.round((existingTotal + doctorSplit) * 100) / 100}% — exceeds 100%` },
      { status: 422 },
    );

  // Pull treatment figures to populate the new row
  const treatment = await prisma.treatment.findUnique({
    where:  { id: params.treatmentId },
    select: { billedAmount: true, labFee: true, sst: true },
  });
  if (!treatment)
    return NextResponse.json({ error: "Treatment not found" }, { status: 404 });

  const txAmount = Number(treatment.billedAmount);
  const labFee   = Number(treatment.labFee);
  const sst      = Number(treatment.sst);
  const net      = Math.max(txAmount - labFee - sst, 0);
  const commission = Math.round(net * (doctorSplit / 100) * (doctorRate / 100) * 100) / 100;

  const row = await prisma.doctorCommission.create({
    data: {
      treatmentId:  params.treatmentId,
      doctorId:     doctorProfileId,
      month,
      txAmount,
      labFee,
      doctorSplit,
      doctorRate,
      commission,
      finalPayout:  commission,
      isTopUp:      false,
      status:       "DRAFT",
    },
  });

  // Apply pending split adjustments from the modal to the existing doctor rows
  if (pendingAdjustments.length > 0) {
    for (const adj of pendingAdjustments) {
      const existing = await prisma.doctorCommission.findUnique({
        where:   { id: adj.rowId },
        include: { treatment: { select: { billedAmount: true, sst: true } } },
      });
      if (!existing) continue;
      const newNet   = Math.max(Number(existing.txAmount) - Number(existing.labFee) - Number(existing.treatment.sst), 0);
      const newComm  = Math.round(newNet * (adj.newSplit / 100) * (Number(existing.doctorRate) / 100) * 100) / 100;
      await prisma.doctorCommission.update({
        where: { id: adj.rowId },
        data:  { doctorSplit: adj.newSplit, commission: newComm, finalPayout: newComm },
      });
    }
  }

  return NextResponse.json(row, { status: 201 });
}
