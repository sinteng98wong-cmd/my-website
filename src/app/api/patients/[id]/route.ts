import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";

/** GET — full patient detail with source + referral relations. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: {
      source:           { select: { id: true, name: true } },
      homeClinic:       { select: { id: true, name: true } },
      referredByPatient:{ select: { id: true, name: true, patientRef: true } },
      referredByDoctor: { select: { id: true, name: true } },
      referredByClinic: { select: { id: true, name: true } },
    },
  });
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  return NextResponse.json(patient);
}

/** PATCH — update patient including source, referral, demographics, address, status. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any)?.role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const data: Record<string, any> = {};

  const scalar = ["name", "phone", "email", "icNumber", "passportNo", "gender",
                  "address", "city", "state", "postcode", "medicalNotes", "sourceId", "status"];
  for (const k of scalar) if (body[k] !== undefined) data[k] = body[k] || null;
  if (body.dateOfBirth !== undefined) data.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null;

  // Referral block (mutually exclusive references)
  if (body.referralType !== undefined) {
    const t = body.referralType || null;
    data.referralType          = t;
    data.referredByPatientId   = t === "PATIENT"         ? body.referredByPatientId || null : null;
    data.referredByDoctorId    = t === "INTERNAL_DOCTOR" ? body.referredByDoctorId  || null : null;
    data.referredByClinicId    = t === "INTERNAL_CLINIC" ? body.referredByClinicId  || null : null;
    data.externalReferrerName  = t === "EXTERNAL" ? body.externalReferrerName  || null : null;
    data.externalReferrerType  = t === "EXTERNAL" ? body.externalReferrerType  || null : null;
    data.externalReferrerPhone = t === "EXTERNAL" ? body.externalReferrerPhone || null : null;
    data.externalReferrerEmail = t === "EXTERNAL" ? body.externalReferrerEmail || null : null;
  }

  const patient = await prisma.patient.update({ where: { id: params.id }, data });
  return NextResponse.json(patient);
}

/** Soft-delete a patient. Hard delete is never used. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const userId = (session.user as any)?.id as string;
  const role   = (session.user as any)?.role as string;

  if (!["SUPER_ADMIN","CLINIC_MANAGER","RECEPTIONIST"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patient = await prisma.patient.findUnique({
    where: notDeleted({ id: params.id }),
    select: { id: true, status: true },
  });
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const reason = await req.json().then((b) => b?.reason).catch(() => null);

  await prisma.patient.update({
    where: { id: params.id },
    data:  {
      deletedAt: new Date(),
      deletedBy: userId,
      deletedReason: reason || null,
      // mark rejected if it was a pending self-registration
      ...(patient.status === "PENDING" ? { status: "REJECTED" } : {}),
    } as any,
  });

  return NextResponse.json({ ok: true });
}
