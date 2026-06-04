import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { renewLicense } from "@/lib/license";

const ALLOWED = ["SUPER_ADMIN", "CLINIC_MANAGER"];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role   = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!session?.user || !ALLOWED.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.newExpiryDate)
    return NextResponse.json({ error: "newExpiryDate required" }, { status: 400 });

  const newLicense = await renewLicense(
    params.id,
    new Date(body.newExpiryDate),
    body.newLicenseNo    ?? undefined,
    body.newDocumentUrl  ?? undefined,
    body.newDocumentName ?? undefined,
    userId
  );

  return NextResponse.json(newLicense, { status: 201 });
}
