import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    include: {
      entity:   { select: { id: true, legalName: true, name: true } },
      director: { select: { id: true, name: true, role: true } },
      pic:      { select: { id: true, name: true, role: true } },
      _count:   { select: { visits: true, userClinics: true, patients: true } },
    },
  });

  if (!clinic) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(clinic);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

  const existing = await prisma.clinic.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // If slug is changing, check uniqueness
  if (body.slug && body.slug !== existing.slug) {
    const slugExists = await prisma.clinic.findUnique({ where: { slug: body.slug } });
    if (slugExists) return NextResponse.json({ error: `Slug "${body.slug}" is already taken` }, { status: 409 });
  }

  const data: Record<string, unknown> = {};
  const fields = ["name", "slug", "isHQ", "address", "city", "state", "postcode", "phone", "email",
                  "bankName", "bankAccountNo", "bankAccountName", "pvGroupTag"];
  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f] === "" ? null : body[f];
  }
  // Nullable foreign keys
  if ("directorId" in body) data.directorId = body.directorId || null;
  if ("picId"       in body) data.picId      = body.picId      || null;
  // Allow moving clinic to another entity (with explicit entityId)
  if (body.entityId) data.entityId = body.entityId;

  const updated = await prisma.clinic.update({
    where: { id: params.id },
    data,
    include: {
      entity:   { select: { id: true, legalName: true, name: true } },
      director: { select: { id: true, name: true } },
      pic:      { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}
