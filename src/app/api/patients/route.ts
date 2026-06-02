import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { notDeleted } from "@/lib/soft-delete";

const referralFields = {
  referralType:          z.enum(["PATIENT", "INTERNAL_DOCTOR", "INTERNAL_CLINIC", "EXTERNAL"]).optional(),
  referredByPatientId:   z.string().optional(),
  referredByDoctorId:    z.string().optional(),
  referredByClinicId:    z.string().optional(),
  externalReferrerName:  z.string().optional(),
  externalReferrerType:  z.string().optional(),
  externalReferrerPhone: z.string().optional(),
  externalReferrerEmail: z.string().optional(),
};

const CreatePatientSchema = z.object({
  name: z.string().min(1),
  homeClinicId: z.string().cuid(),
  isForeigner: z.boolean().default(false),
  icNumber: z.string().optional(),
  passportNo: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  medicalNotes: z.string().optional(),
  sourceId: z.string().optional(),
  ...referralFields,
});

/** Strip referral references that don't match the chosen referralType, normalise empties. */
function buildReferralData(d: any) {
  const t = d.referralType;
  return {
    referralType:          t ?? null,
    referredByPatientId:   t === "PATIENT"         ? d.referredByPatientId || null : null,
    referredByDoctorId:    t === "INTERNAL_DOCTOR" ? d.referredByDoctorId  || null : null,
    referredByClinicId:    t === "INTERNAL_CLINIC" ? d.referredByClinicId  || null : null,
    externalReferrerName:  t === "EXTERNAL" ? d.externalReferrerName  || null : null,
    externalReferrerType:  t === "EXTERNAL" ? d.externalReferrerType  || null : null,
    externalReferrerPhone: t === "EXTERNAL" ? d.externalReferrerPhone || null : null,
    externalReferrerEmail: t === "EXTERNAL" ? d.externalReferrerEmail || null : null,
  };
}

// Generate sequential patient ref per clinic: e.g. P-CLINIC-A-00123
async function generatePatientRef(clinicId: string): Promise<string> {
  const count = await prisma.patient.count({ where: notDeleted({ homeClinicId: clinicId }) });
  const seq = String(count + 1).padStart(5, "0");
  return `P-${clinicId.slice(-6).toUpperCase()}-${seq}`;
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission("patient:manage");
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreatePatientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const data = parsed.data;

  // Foreigners must have a passport; locals must have an IC
  if (data.isForeigner && !data.passportNo) {
    return NextResponse.json(
      { error: "Foreign patients require a passport number" },
      { status: 422 }
    );
  }
  if (!data.isForeigner && !data.icNumber) {
    return NextResponse.json(
      { error: "Local patients require an IC number" },
      { status: 422 }
    );
  }

  const clinic = await prisma.clinic.findUnique({ where: { id: data.homeClinicId } });
  if (!clinic) {
    return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  }

  const patientRef = await generatePatientRef(data.homeClinicId);

  const { referralType, referredByPatientId, referredByDoctorId, referredByClinicId,
          externalReferrerName, externalReferrerType, externalReferrerPhone, externalReferrerEmail,
          email, dateOfBirth, ...rest } = data;

  const patient = await prisma.patient.create({
    data: {
      ...rest,
      patientRef,
      email: email || null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      ...buildReferralData(data),
    },
  });

  return NextResponse.json(patient, { status: 201 });
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission("patient:manage");
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const clinicId = searchParams.get("clinicId");
  const search = searchParams.get("q");

  const patients = await prisma.patient.findMany({
    where: notDeleted({
      ...(clinicId ? { homeClinicId: clinicId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { icNumber: { contains: search } },
              { passportNo: { contains: search } },
              { patientRef: { contains: search } },
            ],
          }
        : {}),
    }),
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(patients);
}
