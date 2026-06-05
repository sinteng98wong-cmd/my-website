import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const t = await prisma.treatmentStageTemplate.update({
    where: { id: params.id },
    data: {
      ...(body.name          !== undefined && { name: body.name }),
      ...(body.description   !== undefined && { description: body.description }),
      ...(body.order         !== undefined && { order: body.order }),
      ...(body.defaultCost   !== undefined && { defaultCost: body.defaultCost }),
      ...(body.estimatedDays !== undefined && { estimatedDays: body.estimatedDays }),
      ...(body.isActive      !== undefined && { isActive: body.isActive }),
    },
  });
  return NextResponse.json(t);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

  await prisma.treatmentStageTemplate.update({ where: { id: params.id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
