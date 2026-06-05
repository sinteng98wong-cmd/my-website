import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPlanFromTemplate } from "@/lib/treatment-plan";
import { generateTreatmentPlanRef } from "@/lib/ref-generator";
import { z } from "zod";

const ALLOWED = ["SUPER_ADMIN", "CLINIC_MANAGER", "DOCTOR", "RECEPTIONIST"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const patientId  = sp.get("patientId")  ?? undefined;
  const clinicId   = sp.get("clinicId")   ?? undefined;
  const status     = sp.get("status")     ?? undefined;
  const dentistId  = sp.get("dentistId")  ?? undefined;

  const plans = await prisma.treatmentPlan.findMany({
    where: {
      ...(patientId ? { patientId } : {}),
      ...(clinicId  ? { clinicId  } : {}),
      ...(status    ? { status: status as any } : {}),
      ...(dentistId ? { dentistId } : {}),
    },
    include: {
      patient:  { select: { name: true, patientRef: true } },
      dentist:  { select: { name: true } },
      clinic:   { select: { name: true } },
      stages:   { select: { status: true, cost: true } },
      payments: { select: { amount: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(plans);
}

const CreateSchema = z.object({
  patientId:       z.string().min(1),
  clinicId:        z.string().min(1),
  dentistId:       z.string().min(1),
  title:           z.string().min(1),
  toothCodes:      z.array(z.string()).default([]),
  treatmentTypeId: z.string().optional(),
  stages:          z.array(z.object({
    name:        z.string().min(1),
    description: z.string().optional(),
    order:       z.number().int(),
    cost:        z.number().nonnegative(),
  })).optional(),
  paymentMode:     z.enum(["DEPOSIT_BALANCE", "PAY_PER_STAGE", "FULL_UPFRONT"]).default("DEPOSIT_BALANCE"),
  discount:        z.number().nonnegative().default(0),
  depositRequired: z.number().nonnegative().default(0),
  notes:           z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  const userId  = (session?.user as any)?.id;
  if (!session?.user || !["SUPER_ADMIN", "CLINIC_MANAGER", "DOCTOR"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;

  // If treatmentTypeId provided → create from templates
  if (d.treatmentTypeId) {
    const plan = await createPlanFromTemplate({
      patientId:       d.patientId,
      clinicId:        d.clinicId,
      dentistId:       d.dentistId,
      title:           d.title,
      toothCodes:      d.toothCodes,
      treatmentTypeId: d.treatmentTypeId,
      paymentMode:     d.paymentMode,
      discount:        d.discount,
      depositRequired: d.depositRequired,
      notes:           d.notes,
      createdById:     userId,
    });
    return NextResponse.json(plan, { status: 201 });
  }

  // Manual stages
  const stages = d.stages ?? [];
  const subtotal = stages.reduce((s, st) => s + st.cost, 0);
  const total    = Math.max(0, subtotal - d.discount);
  const planRef  = await generateTreatmentPlanRef();

  const plan = await prisma.treatmentPlan.create({
    data: {
      planRef,
      patientId:       d.patientId,
      clinicId:        d.clinicId,
      dentistId:       d.dentistId,
      title:           d.title,
      toothCodes:      d.toothCodes,
      paymentMode:     d.paymentMode,
      subtotal,
      discount:        d.discount,
      sstAmount:       0,
      totalAmount:     total,
      depositRequired: d.depositRequired,
      notes:           d.notes,
      createdById:     userId,
      stages: { create: stages },
    },
    include: { stages: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(plan, { status: 201 });
}
