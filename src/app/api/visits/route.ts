import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CreateSchema = z.object({
  patientId:      z.string().min(1),
  clinicId:       z.string().min(1),
  chiefComplaint: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body   = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const d        = parsed.data;
  const count    = await prisma.visit.count();
  const visitRef = `V-${String(count + 1).padStart(5, "0")}`;

  const visit = await prisma.visit.create({
    data: {
      visitRef,
      patientId:      d.patientId,
      clinicId:       d.clinicId,
      visitDate:      new Date(),
      chiefComplaint: d.chiefComplaint,
    },
  });

  return NextResponse.json(visit, { status: 201 });
}
