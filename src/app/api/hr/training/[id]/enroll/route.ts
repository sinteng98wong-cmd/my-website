import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emailTrainingEnrolled } from "@/lib/hr-email";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const training = await prisma.training.findUnique({ where: { id: params.id }, include: { _count: { select: { participants: true } } } });
  if (!training) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { staffProfileIds } = await req.json() as { staffProfileIds: string[] };
  if (!staffProfileIds?.length) return NextResponse.json({ error: "staffProfileIds is required" }, { status: 422 });

  if (training.maxSlots) {
    const current = training._count.participants;
    if (current + staffProfileIds.length > training.maxSlots) {
      return NextResponse.json({ error: `Only ${training.maxSlots - current} slot(s) remaining` }, { status: 422 });
    }
  }

  const created: string[] = [];
  for (const staffProfileId of staffProfileIds) {
    try {
      await prisma.staffTraining.create({ data: { staffProfileId, trainingId: params.id, status: "PLANNED" } });
      created.push(staffProfileId);
      emailTrainingEnrolled(staffProfileId, training.title, training.startDate, training.endDate, training.venue ?? undefined).catch(console.error);
    } catch {
      // Duplicate — already enrolled, skip
    }
  }

  return NextResponse.json({ enrolled: created.length });
}
