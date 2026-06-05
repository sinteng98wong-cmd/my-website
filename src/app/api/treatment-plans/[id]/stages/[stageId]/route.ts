import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; stageId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.name         !== undefined) data.name         = body.name;
  if (body.description  !== undefined) data.description  = body.description;
  if (body.cost         !== undefined) data.cost         = body.cost;
  if (body.order        !== undefined) data.order        = body.order;
  if (body.clinicalNotes !== undefined) data.clinicalNotes = body.clinicalNotes;
  if (body.nextStageDate !== undefined) data.nextStageDate = body.nextStageDate ? new Date(body.nextStageDate) : null;

  const stage = await prisma.treatmentStage.update({ where: { id: params.stageId }, data });
  return NextResponse.json(stage);
}
