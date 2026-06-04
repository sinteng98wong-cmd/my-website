import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeLicenseStatus } from "@/lib/license";

const ALLOWED = ["SUPER_ADMIN", "CLINIC_MANAGER"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: Record<string, any> = {};

  if (body.licenseNo    !== undefined) data.licenseNo    = body.licenseNo;
  if (body.issuedDate   !== undefined) data.issuedDate   = body.issuedDate ? new Date(body.issuedDate) : null;
  if (body.documentUrl  !== undefined) data.documentUrl  = body.documentUrl;
  if (body.documentName !== undefined) data.documentName = body.documentName;
  if (body.notes        !== undefined) data.notes        = body.notes;
  if (body.expiryDate   !== undefined) {
    data.expiryDate = new Date(body.expiryDate);
    data.status     = computeLicenseStatus(data.expiryDate);
  }

  const license = await prisma.license.update({ where: { id: params.id }, data });
  return NextResponse.json(license);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session?.user || role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Super Admin only" }, { status: 403 });

  await prisma.license.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
