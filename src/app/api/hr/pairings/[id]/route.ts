import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pairing = await prisma.dentistNursePairing.findUnique({ where: { id: params.id } });
  if (!pairing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.dentistNursePairing.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true, wasDefault: pairing.isDefault });
}
