import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ALLOWED = ["SUPER_ADMIN", "CLINIC_MANAGER", "DOCTOR"];

const AddStageSchema = z.object({
  name:        z.string().min(1),
  description: z.string().optional(),
  order:       z.number().int(),
  cost:        z.number().nonnegative().default(0),
  templateId:  z.string().optional(),
});

async function recalcPlan(planId: string, discount: number) {
  const stages = await prisma.treatmentStage.findMany({
    where: { planId },
    select: { cost: true },
  });
  const subtotal = stages.reduce((s, st) => s + Number(st.cost), 0);
  const totalAmount = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  await prisma.treatmentPlan.update({
    where: { id: planId },
    data: { subtotal: Math.round(subtotal * 100) / 100, totalAmount },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const plan = await prisma.treatmentPlan.findUnique({ where: { id: params.id } });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (plan.status !== "DRAFT")
    return NextResponse.json({ error: "Only DRAFT plans can be edited" }, { status: 409 });

  const body = await req.json().catch(() => null);
  const parsed = AddStageSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });

  const d = parsed.data;
  const stage = await prisma.treatmentStage.create({
    data: {
      planId:      params.id,
      name:        d.name,
      description: d.description ?? null,
      order:       d.order,
      cost:        d.cost,
      templateId:  d.templateId ?? null,
    },
  });

  await recalcPlan(params.id, Number(plan.discount));
  return NextResponse.json(stage, { status: 201 });
}
