import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  const userId = (session.user as any).id as string;
  const isManager = ["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role);

  const sp = req.nextUrl.searchParams;

  if (!isManager) {
    const profile = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
    const staffProfileId = profile?.id ?? "__none__";
    const trainings = await prisma.staffTraining.findMany({
      where: { staffProfileId },
      include: { training: true },
      orderBy: { training: { startDate: "desc" } },
    });
    return NextResponse.json(trainings);
  }

  const where: any = {};
  if (sp.get("clinicId")) {
    // Filter trainings where at least one participant is from the clinic
    where.participants = { some: { staffProfile: { clinicId: sp.get("clinicId") } } };
  }
  if (sp.get("staffProfileId")) {
    where.participants = { some: { staffProfileId: sp.get("staffProfileId") } };
  }

  const trainings = await prisma.training.findMany({
    where,
    include: { _count: { select: { participants: true } }, participants: { where: { status: "COMPLETED" }, select: { id: true } } },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(trainings.map((t) => ({ ...t, completedCount: t.participants.length })));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    title: string; provider?: string; type?: string; startDate: string; endDate: string;
    venue?: string; cost?: number; maxSlots?: number; description?: string;
  };
  if (!body.title || !body.startDate || !body.endDate) return NextResponse.json({ error: "title, startDate and endDate are required" }, { status: 422 });

  const training = await prisma.training.create({
    data: {
      title: body.title, provider: body.provider, type: body.type,
      startDate: new Date(body.startDate), endDate: new Date(body.endDate),
      venue: body.venue, cost: body.cost, maxSlots: body.maxSlots, description: body.description,
    },
  });
  return NextResponse.json(training, { status: 201 });
}
