import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CreateSchema = z.object({
  clinicId:       z.string().min(1),
  doctorId:       z.string().min(1),
  nurseId:        z.string().min(1).optional(),
  receptionistId: z.string().min(1).optional(),
  startTime:      z.string().refine(s => !isNaN(Date.parse(s)), { message: "Invalid start datetime" }),
  endTime:        z.string().refine(s => !isNaN(Date.parse(s)), { message: "Invalid end datetime" }),
  notes:          z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const d = parsed.data;
    const startTime = new Date(d.startTime);
    const endTime   = new Date(d.endTime);

    if (endTime <= startTime) {
      return NextResponse.json({ error: "End time must be after start time" }, { status: 422 });
    }

    // date field = midnight UTC of the startTime day (for range queries)
    const date = new Date(startTime);
    date.setUTCHours(0, 0, 0, 0);

    const schedule = await prisma.schedule.create({
      data: {
        clinicId:       d.clinicId,
        doctorId:       d.doctorId,
        nurseId:        d.nurseId        || null,
        receptionistId: d.receptionistId || null,
        date,
        startTime,
        endTime,
        notes: d.notes || null,
      },
      include: {
        clinic:       { select: { name: true } },
        doctor:       { select: { name: true } },
        nurse:        { select: { name: true } },
        receptionist: { select: { name: true } },
      },
    });

    return NextResponse.json(schedule, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "This slot already exists" }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const { id } = await req.json();
    await prisma.schedule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
