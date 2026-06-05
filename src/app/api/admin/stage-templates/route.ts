import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const treatmentTypeId = new URL(req.url).searchParams.get("treatmentTypeId") ?? undefined;
  const templates = await prisma.treatmentStageTemplate.findMany({
    where: { ...(treatmentTypeId ? { treatmentTypeId } : {}), isActive: true },
    include: { treatmentType: { select: { id: true, name: true } } },
    orderBy: [{ treatmentTypeId: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const template = await prisma.treatmentStageTemplate.create({
    data: {
      treatmentTypeId: body.treatmentTypeId,
      name:            body.name,
      description:     body.description ?? null,
      order:           body.order ?? 0,
      defaultCost:     body.defaultCost ?? null,
      estimatedDays:   body.estimatedDays ?? null,
    },
  });
  return NextResponse.json(template, { status: 201 });
}
