import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED = ["SUPER_ADMIN", "CLINIC_MANAGER", "DOCTOR"];

async function recalcPlan(planId: string, discount: number) {
  const stages = await prisma.treatmentStage.findMany({
    where: { planId },
    select: { cost: true },
  });
  const subtotal    = stages.reduce((s, st) => s + Number(st.cost), 0);
  const totalAmount = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  await prisma.treatmentPlan.update({
    where: { id: planId },
    data: { subtotal: Math.round(subtotal * 100) / 100, totalAmount },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; stageId: string } },
) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stage = await prisma.treatmentStage.findUnique({
    where:   { id: params.stageId },
    include: { plan: { select: { status: true, discount: true } } },
  });
  if (!stage || stage.planId !== params.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (stage.plan.status !== "DRAFT")
    return NextResponse.json({ error: "Only DRAFT plans can be edited" }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.name          !== undefined) data.name          = body.name;
  if (body.description   !== undefined) data.description   = body.description;
  if (body.cost          !== undefined) data.cost          = body.cost;
  if (body.order         !== undefined) data.order         = body.order;
  if (body.clinicalNotes !== undefined) data.clinicalNotes = body.clinicalNotes;
  if (body.nextStageDate !== undefined) data.nextStageDate = body.nextStageDate ? new Date(body.nextStageDate) : null;

  const updated = await prisma.treatmentStage.update({ where: { id: params.stageId }, data });

  if (body.cost !== undefined) {
    await recalcPlan(params.id, Number(stage.plan.discount));
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; stageId: string } },
) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stage = await prisma.treatmentStage.findUnique({
    where:   { id: params.stageId },
    include: { plan: { select: { status: true, discount: true } } },
  });
  if (!stage || stage.planId !== params.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (stage.plan.status !== "DRAFT")
    return NextResponse.json({ error: "Only DRAFT plans can be edited" }, { status: 409 });

  await prisma.treatmentStage.delete({ where: { id: params.stageId } });
  await recalcPlan(params.id, Number(stage.plan.discount));

  return new NextResponse(null, { status: 204 });
}
