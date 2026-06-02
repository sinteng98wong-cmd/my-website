import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const role    = (session?.user as any)?.role;
    if (!["SUPER_ADMIN","CLINIC_MANAGER"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { clinicId, roleOverride } = await req.json();
    if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 422 });

    // Ensure the UserClinic row exists first
    await prisma.userClinic.upsert({
      where: { userId_clinicId: { userId: params.id, clinicId } },
      update: { roleOverride: roleOverride || null },
      create: { userId: params.id, clinicId, roleOverride: roleOverride || null },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
