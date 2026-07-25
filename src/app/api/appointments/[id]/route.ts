import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH — update status; action=checkin creates a Visit and links it
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { action, status } = body;

  const appt = await prisma.appointment.findUnique({ where: { id: params.id } });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reschedule (calendar drag / resize): move start, change duration or doctor
  if (action === "reschedule" || body.startTime || body.duration || body.doctorId) {
    const startTime = body.startTime ? new Date(body.startTime) : appt.startTime;
    const duration  = body.duration ? Number(body.duration) : appt.duration;
    const doctorId  = body.doctorId ?? appt.doctorId;
    const endTime   = new Date(startTime.getTime() + duration * 60_000);

    // Conflict: the doctor must be free in the new slot (excluding this appt)
    const clashes = await prisma.appointment.findMany({
      where: {
        id:       { not: params.id },
        doctorId,
        status:   { notIn: ["CANCELLED", "NO_SHOW"] },
        startTime:{ gte: new Date(startTime.getTime() - 4 * 60 * 60_000), lt: endTime },
      },
      select: { startTime: true, duration: true, patient: { select: { name: true } } },
    });
    for (const c of clashes) {
      const cEnd = new Date(new Date(c.startTime).getTime() + c.duration * 60_000);
      if (cEnd > startTime) {
        return NextResponse.json(
          { error: `Doctor already has an appointment then (${c.patient.name})`, conflict: true },
          { status: 409 },
        );
      }
    }

    const moved = await prisma.appointment.update({
      where: { id: params.id },
      data:  { startTime, duration, doctorId },
      include: {
        patient: { select: { id: true, name: true, patientRef: true } },
        doctor:  { select: { id: true, name: true } },
        clinic:  { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(moved);
  }

  // Check-in: create a Visit and link it
  if (action === "checkin") {
    if (appt.visitId) {
      return NextResponse.json({ visitId: appt.visitId });
    }

    const count   = await prisma.visit.count();
    const visitRef = `V-${String(count + 1).padStart(5, "0")}`;

    const visit = await prisma.visit.create({
      data: {
        visitRef,
        patientId:      appt.patientId,
        clinicId:       appt.clinicId,
        visitDate:      new Date(),
        chiefComplaint: appt.chiefComplaint ?? undefined,
      },
    });

    await prisma.appointment.update({
      where: { id: params.id },
      data:  { status: "CHECKED_IN", visitId: visit.id },
    });

    return NextResponse.json({ visitId: visit.id });
  }

  // General status update
  const updated = await prisma.appointment.update({
    where: { id: params.id },
    data:  { status: status ?? appt.status },
    include: {
      patient: { select: { id: true, name: true, patientRef: true } },
      doctor:  { select: { id: true, name: true } },
      clinic:  { select: { id: true, name: true } },
      visit:   { select: { id: true, visitRef: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  await prisma.appointment.update({
    where: { id: params.id },
    data:  { status: "CANCELLED" },
  });

  return NextResponse.json({ ok: true });
}
