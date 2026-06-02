import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// startTime is an ISO-8601 datetime string, e.g. "2026-05-30T09:00:00+08:00"
const CreateSchema = z.object({
  patientId:      z.string().min(1),
  clinicId:       z.string().min(1),
  doctorId:       z.string().min(1),
  startTime:      z.string().refine(s => !isNaN(Date.parse(s)), { message: "Invalid datetime" }),
  duration:       z.number().int().positive().default(30),
  type:           z.enum(["CHECKUP","CONSULTATION","TREATMENT","FOLLOWUP","CLEANING","EXTRACTION","OTHER"]).default("CHECKUP"),
  chiefComplaint: z.string().optional(),
  notes:          z.string().optional(),
});

async function genRef(): Promise<string> {
  const count = await prisma.appointment.count();
  return `APT-${String(count + 1).padStart(5, "0")}`;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const sp       = new URL(req.url).searchParams;
  const clinicId = sp.get("clinicId") ?? undefined;
  const date     = sp.get("date");
  const month    = sp.get("month");

  let timeFilter: any = {};
  if (date) {
    const dayStart = new Date(date + "T00:00:00+08:00");
    const dayEnd   = new Date(date + "T23:59:59+08:00");
    timeFilter = { gte: dayStart, lte: dayEnd };
  } else if (month) {
    const [y, m] = month.split("-").map(Number);
    // MYT start/end of month
    timeFilter = {
      gte: new Date(`${month}-01T00:00:00+08:00`),
      lt:  new Date(`${y}-${String(m + 1).padStart(2,"0")}-01T00:00:00+08:00`),
    };
  }

  const appts = await prisma.appointment.findMany({
    where: {
      ...(clinicId ? { clinicId } : {}),
      ...(Object.keys(timeFilter).length ? { startTime: timeFilter } : {}),
    },
    include: {
      patient: { select: { id: true, name: true, patientRef: true, phone: true } },
      doctor:  { select: { id: true, name: true } },
      clinic:  { select: { id: true, name: true } },
      visit:   { select: { id: true, visitRef: true } },
    },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json(appts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const d = parsed.data;
  const startTime = new Date(d.startTime);
  const endTime   = new Date(startTime.getTime() + d.duration * 60_000);

  // Overlap check: doctor must not have another appointment in this slot
  const overlap = await prisma.appointment.findFirst({
    where: {
      doctorId: d.doctorId,
      status:   { notIn: ["CANCELLED", "NO_SHOW"] },
      startTime: { lt: endTime },
      // appointment ends after new start: startTime + duration * 60s > startTime
      // We can't filter endTime directly (not stored), so we check overlapping window:
      // existing.start < newEnd  AND  existing.start + existing.duration*60s > newStart
      // Approximation using Prisma: existing.start in [newStart - maxDuration, newEnd)
      AND: [
        { startTime: { gte: new Date(startTime.getTime() - 4 * 60 * 60_000) } }, // look back 4h max
        { startTime: { lt: endTime } },
      ],
    },
    select: { id: true, startTime: true, duration: true, patient: { select: { name: true } } },
  });

  // Refine check in JS (since endTime isn't stored)
  if (overlap) {
    const existingEnd = new Date(new Date(overlap.startTime).getTime() + overlap.duration * 60_000);
    if (existingEnd > startTime) {
      return NextResponse.json(
        { error: `Doctor already has an appointment at this time (${overlap.patient.name}, ends ${existingEnd.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })})` },
        { status: 409 }
      );
    }
  }

  const appt = await prisma.appointment.create({
    data: {
      apptRef:        await genRef(),
      patientId:      d.patientId,
      clinicId:       d.clinicId,
      doctorId:       d.doctorId,
      startTime,
      duration:       d.duration,
      type:           d.type,
      chiefComplaint: d.chiefComplaint,
      notes:          d.notes,
    },
    include: {
      patient: { select: { id: true, name: true, patientRef: true } },
      doctor:  { select: { id: true, name: true } },
      clinic:  { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(appt, { status: 201 });
}
