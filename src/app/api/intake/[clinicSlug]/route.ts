import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";

async function generatePatientRef(clinicId: string): Promise<string> {
  const count = await prisma.patient.count({ where: notDeleted({ homeClinicId: clinicId }) });
  return `P-${clinicId.slice(-6).toUpperCase()}-${String(count + 1).padStart(5, "0")}`;
}

/** Public self-registration. No auth. Creates a PENDING patient. */
export async function POST(req: NextRequest, { params }: { params: { clinicSlug: string } }) {
  const clinic = await prisma.clinic.findUnique({ where: { slug: params.clinicSlug } });
  if (!clinic) return NextResponse.json({ error: "Clinic not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim() || !body?.phone?.trim()) {
    return NextResponse.json({ error: "Name and phone are required" }, { status: 422 });
  }

  // Referral from intake is always stored as EXTERNAL free text (staff links later)
  let referralData: any = {};
  if (body.sourceId) {
    const src = await prisma.patientSource.findUnique({ where: { id: body.sourceId } });
    if (src?.name.toLowerCase().includes("referral") && body.referrerName?.trim()) {
      referralData = {
        referralType: "EXTERNAL",
        externalReferrerType: body.referrerType || "person",  // doctor | clinic | person
        externalReferrerName: body.referrerName.trim(),
      };
    }
  }

  const patientRef = await generatePatientRef(clinic.id);

  await prisma.patient.create({
    data: {
      patientRef,
      name:         body.name.trim(),
      homeClinicId: clinic.id,
      phone:        body.phone.trim(),
      email:        body.email?.trim() || null,
      dateOfBirth:  body.dateOfBirth ? new Date(body.dateOfBirth) : null,
      gender:       body.gender || null,
      address:      body.address?.trim()  || null,
      city:         body.city?.trim()     || null,
      state:        body.state            || null,
      postcode:     body.postcode?.trim() || null,
      medicalNotes: body.medicalNotes?.trim() || null,
      sourceId:     body.sourceId || null,
      status:       "PENDING",
      ...referralData,
    },
  });

  return NextResponse.json({ ok: true });
}
