import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope");

  const types = await prisma.licenseType.findMany({
    where: {
      isActive: true,
      ...(scope ? { scope: scope as any } : {}),
    },
    orderBy: [{ scope: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(types);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

  const body = await req.json();
  const type = await prisma.licenseType.create({
    data: {
      name:        body.name,
      code:        body.code ?? null,
      scope:       body.scope,
      issuingBody: body.issuingBody ?? null,
      description: body.description ?? null,
      order:       body.order ?? 0,
    },
  });
  return NextResponse.json(type, { status: 201 });
}
