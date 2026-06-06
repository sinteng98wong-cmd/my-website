import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/commission/daily-signoff?date=2026-06-01
 * Returns the doctor's treatments for that date + existing sign-off if any.
 * Doctors see their own; Finance/CM/SA can pass &doctorId= to view any.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role   = (session.user as any).role   as string;
  const userId = (session.user as any).id     as string;

  const dateStr  = req.nextUrl.searchParams.get("date");
  if (!dateStr) return NextResponse.json({ error: "date is required" }, { status: 422 });

  const date    = new Date(dateStr);
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  // Resolve which doctor profile to query
  let doctorProfile: { id: string; userId: string } | null = null;

  if (role === "DOCTOR") {
    doctorProfile = await prisma.doctorProfile.findUnique({
      where:  { userId },
      select: { id: true, userId: true },
    });
    if (!doctorProfile) return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
  } else if (["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) {
    const did = req.nextUrl.searchParams.get("doctorId");
    if (!did) return NextResponse.json({ error: "doctorId is required" }, { status: 422 });
    doctorProfile = await prisma.doctorProfile.findUnique({
      where:  { id: did },
      select: { id: true, userId: true },
    });
    if (!doctorProfile) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [treatments, signoff] = await Promise.all([
    prisma.treatment.findMany({
      where: {
        doctorId: doctorProfile.id,
        visit: { visitDate: { gte: date, lt: nextDay }, deletedAt: null },
      },
      include: {
        treatmentType: { select: { name: true, code: true } },
        visit: {
          include: {
            clinic:   { select: { name: true } },
            patient:  { select: { name: true, patientRef: true } },
          },
        },
      },
      orderBy: { visit: { visitDate: "asc" } },
    }),

    (prisma as any).doctorDailySignoff.findFirst({
      where: {
        doctorId: doctorProfile.id,
        date,
      },
    }),
  ]);

  const rows = treatments.map(t => ({
    id:              t.id,
    patientName:     t.visit.patient.name,
    patientRef:      t.visit.patient.patientRef,
    clinicId:        t.visit.clinicId,
    clinicName:      t.visit.clinic.name,
    treatmentName:   t.treatmentType.name,
    treatmentCode:   t.treatmentType.code,
    billedAmount:    Number(t.billedAmount),
    labFee:          Number(t.labFee),
    sst:             Number(t.sst),
    doctorSplit:     Number(t.doctorSplit),
    commission:      Number(
      ((Number(t.billedAmount) - Number(t.labFee) - Number(t.sst)) * Number(t.doctorSplit)) / 100
    ).toFixed(2),
  }));

  return NextResponse.json({
    date:     dateStr,
    doctorId: doctorProfile.id,
    treatments: rows,
    total:    rows.reduce((s, r) => s + r.billedAmount, 0),
    signoff:  signoff ?? null,
  });
}

/**
 * POST /api/commission/daily-signoff
 * Body: { date: "2026-06-01" }
 * Doctor signs off on their treatments for the given date.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role   = (session.user as any).role   as string;
  const userId = (session.user as any).id     as string;

  if (role !== "DOCTOR")
    return NextResponse.json({ error: "Only doctors can sign off on daily treatments" }, { status: 403 });

  const body    = await req.json().catch(() => ({})) as { date?: string };
  const dateStr = body.date;
  if (!dateStr) return NextResponse.json({ error: "date is required" }, { status: 422 });

  const date    = new Date(dateStr);
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  const doctorProfile = await prisma.doctorProfile.findUnique({
    where:  { userId },
    select: { id: true },
  });
  if (!doctorProfile) return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });

  // Snapshot all treatments for this day
  const treatments = await prisma.treatment.findMany({
    where: {
      doctorId: doctorProfile.id,
      visit: { visitDate: { gte: date, lt: nextDay }, deletedAt: null },
    },
    include: {
      treatmentType: { select: { name: true, code: true } },
      visit: {
        include: {
          patient: { select: { name: true, patientRef: true } },
        },
      },
    },
  });

  if (treatments.length === 0)
    return NextResponse.json({ error: "No treatments found for this date" }, { status: 404 });

  const clinicId = treatments[0].visit.clinicId;

  const snapshot = treatments.map(t => ({
    id:            t.id,
    patientName:   t.visit.patient.name,
    patientRef:    t.visit.patient.patientRef,
    treatmentName: t.treatmentType.name,
    treatmentCode: t.treatmentType.code,
    billedAmount:  Number(t.billedAmount),
    labFee:        Number(t.labFee),
    sst:           Number(t.sst),
    doctorSplit:   Number(t.doctorSplit),
  }));

  const signoff = await (prisma as any).doctorDailySignoff.upsert({
    where:  { doctorId_clinicId_date: { doctorId: doctorProfile.id, clinicId, date } },
    create: {
      doctorId:          doctorProfile.id,
      clinicId,
      date,
      signedAt:          new Date(),
      treatmentSnapshot: snapshot,
    },
    update: {
      signedAt:          new Date(),
      treatmentSnapshot: snapshot,
    },
  });

  return NextResponse.json(signoff);
}
