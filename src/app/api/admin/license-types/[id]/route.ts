import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

  const body = await req.json();
  const type = await prisma.licenseType.update({
    where: { id: params.id },
    data: {
      ...(body.name        !== undefined && { name: body.name }),
      ...(body.code        !== undefined && { code: body.code }),
      ...(body.issuingBody !== undefined && { issuingBody: body.issuingBody }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.order       !== undefined && { order: body.order }),
      ...(body.isActive    !== undefined && { isActive: body.isActive }),
    },
  });
  return NextResponse.json(type);
}
