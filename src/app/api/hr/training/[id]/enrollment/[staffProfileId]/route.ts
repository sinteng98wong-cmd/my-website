import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailTrainingCompleted } from "@/lib/hr-email";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; staffProfileId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.staffTraining.findUnique({ where: { staffProfileId_trainingId: { staffProfileId: params.staffProfileId, trainingId: params.id } } });
  if (!existing) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });

  const body = await req.json() as { status?: string; completedAt?: string; score?: number; certificateUrl?: string; notes?: string };
  const data: any = {};
  if (body.status) data.status = body.status;
  if (body.completedAt) data.completedAt = new Date(body.completedAt);
  if (body.score !== undefined) data.score = body.score;
  if (body.certificateUrl) data.certificateUrl = body.certificateUrl;
  if (body.notes) data.notes = body.notes;

  const updated = await prisma.staffTraining.update({
    where: { staffProfileId_trainingId: { staffProfileId: params.staffProfileId, trainingId: params.id } },
    data,
    include: { training: { select: { title: true } } },
  });

  if (body.status === "COMPLETED") {
    emailTrainingCompleted(params.staffProfileId, updated.training.title).catch(console.error);
  }

  return NextResponse.json(updated);
}
