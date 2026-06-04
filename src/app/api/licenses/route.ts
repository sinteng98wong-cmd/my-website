import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeLicenseStatus, daysUntilExpiry } from "@/lib/license";

const ALLOWED = ["SUPER_ADMIN", "CLINIC_MANAGER"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const scope          = searchParams.get("scope");
  const clinicId       = searchParams.get("clinicId");
  const staffProfileId = searchParams.get("staffProfileId");
  const status         = searchParams.get("status");

  const licenses = await prisma.license.findMany({
    where: {
      ...(scope          ? { scope: scope as any }                 : {}),
      ...(clinicId       ? { clinicId }                            : {}),
      ...(staffProfileId ? { staffProfileId }                      : {}),
      ...(status         ? { status: status as any }               : { status: { not: "ARCHIVED" } }),
    },
    include: {
      licenseType:  { select: { name: true, code: true, issuingBody: true } },
      clinic:       { select: { name: true } },
      staffProfile: { select: { user: { select: { name: true } } } },
    },
    orderBy: { expiryDate: "asc" },
  });

  const result = licenses.map((l) => ({
    ...l,
    daysUntilExpiry: daysUntilExpiry(l.expiryDate),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  const userId  = (session?.user as any)?.id;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const status = computeLicenseStatus(new Date(body.expiryDate));

  const license = await prisma.license.create({
    data: {
      licenseTypeId:   body.licenseTypeId,
      scope:           body.scope,
      clinicId:        body.clinicId       ?? null,
      staffProfileId:  body.staffProfileId ?? null,
      licenseNo:       body.licenseNo      ?? null,
      issuedDate:      body.issuedDate     ? new Date(body.issuedDate) : null,
      expiryDate:      new Date(body.expiryDate),
      status,
      documentUrl:     body.documentUrl    ?? null,
      documentName:    body.documentName   ?? null,
      notes:           body.notes          ?? null,
      createdById:     userId,
    },
    include: { licenseType: true },
  });

  return NextResponse.json(license, { status: 201 });
}
