import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const role = (session.user as any).role as string;
  if (!["SUPER_ADMIN", "CLINIC_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pool = await prisma.poolOrder.findUnique({ where: { id: params.id } });
  if (!pool) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pool.status !== "CLOSED") {
    return NextResponse.json({ error: "Pool order must be CLOSED to reopen" }, { status: 400 });
  }

  const userId = (session.user as any).id as string;

  // Verify user is from initiating clinic (unless SUPER_ADMIN)
  if (role === "CLINIC_MANAGER") {
    const uc = await prisma.userClinic.findFirst({
      where: { userId, clinicId: pool.initiatingClinicId },
    });
    if (!uc) return NextResponse.json({ error: "Forbidden: not from initiating clinic" }, { status: 403 });
  }

  const updated = await prisma.poolOrder.update({
    where: { id: params.id },
    data: { status: "REOPENED", reopenedAt: new Date(), reopenedById: userId },
  });

  return NextResponse.json(updated);
}
