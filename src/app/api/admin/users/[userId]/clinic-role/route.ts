import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** DELETE — remove a user from a clinic entirely */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { clinicId } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 422 });

  await prisma.userClinic.deleteMany({
    where: { userId: params.userId, clinicId },
  });
  return NextResponse.json({ success: true });
}

/** PUT — set (or clear) roleOverride for a user at a specific clinic.
 *  Also used to ADD a user to a clinic (upsert). */
export async function PUT(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clinicId, roleOverride } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 422 });

  await prisma.userClinic.upsert({
    where:  { userId_clinicId: { userId: params.userId, clinicId } },
    update: { roleOverride: roleOverride ?? null },
    create: { userId: params.userId, clinicId, roleOverride: roleOverride ?? null },
  });

  return NextResponse.json({ success: true });
}
