import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entityId = new URL(req.url).searchParams.get("entityId") ?? undefined;

  const clinics = await prisma.clinic.findMany({
    where:   { ...(entityId ? { entityId } : {}) },
    select: {
      id: true, name: true, slug: true, isHQ: true, entityId: true,
      address: true, city: true, state: true, postcode: true, phone: true, email: true,
      directorId: true, picId: true,
      director: { select: { id: true, name: true } },
      pic:      { select: { id: true, name: true } },
      entity:   { select: { id: true, legalName: true, name: true } },
      _count:   { select: { visits: true, userClinics: true } },
    },
    orderBy: [{ isHQ: "desc" }, { name: "asc" }],
  });

  return NextResponse.json(clinics);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string;
  if (!session?.user || role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

  const body = await req.json();
  if (!body.name)     return NextResponse.json({ error: "name is required" }, { status: 422 });
  if (!body.entityId) return NextResponse.json({ error: "entityId is required" }, { status: 422 });

  // Validate entity exists
  const entity = await prisma.entity.findUnique({ where: { id: body.entityId } });
  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  // Auto-generate slug if not provided
  const slug = body.slug || body.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  // Check slug uniqueness
  const slugExists = await prisma.clinic.findUnique({ where: { slug } });
  if (slugExists) return NextResponse.json({ error: `Slug "${slug}" is already taken` }, { status: 409 });

  const clinic = await prisma.clinic.create({
    data: {
      name:      body.name,
      slug,
      entityId:  body.entityId,
      isHQ:      body.isHQ ?? false,
      address:   body.address   || null,
      city:      body.city      || null,
      state:     body.state     || null,
      postcode:  body.postcode  || null,
      phone:     body.phone     || null,
      email:     body.email     || null,
      directorId:      body.directorId      || null,
      picId:           body.picId           || null,
      bankName:        body.bankName        || null,
      bankAccountNo:   body.bankAccountNo   || null,
      bankAccountName: body.bankAccountName || null,
      pvGroupTag:      body.pvGroupTag      || null,
    },
    include: {
      director: { select: { id: true, name: true } },
      pic:      { select: { id: true, name: true } },
      entity:   { select: { id: true, legalName: true } },
    },
  });

  return NextResponse.json(clinic, { status: 201 });
}
