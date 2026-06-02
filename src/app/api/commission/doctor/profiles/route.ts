import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/commission/doctor/profiles
 * Returns all active doctor profiles with their default commission rates.
 * Used by the co-doctor picker in the commission adjustment modal.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role as string | undefined;

  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profiles = await prisma.doctorProfile.findMany({
    include: { user: { select: { name: true, active: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return NextResponse.json(
    profiles
      .filter(p => p.user.active)
      .map(p => ({
        id:          p.id,
        name:        p.user.name,
        type:        p.type,
        defaultRate: Number(p.defaultRate),
      })),
  );
}
