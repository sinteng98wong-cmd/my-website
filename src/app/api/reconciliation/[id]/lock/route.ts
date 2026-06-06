import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  const role    = (session?.user as any)?.role;
  const userId  = (session?.user as any)?.id;
  if (!session?.user || !["SUPER_ADMIN", "FINANCE"].includes(role))
    return NextResponse.json({ error: "Forbidden — Finance or Super Admin only" }, { status: 403 });

  const recon = await prisma.monthlyRecon.findUnique({ where: { id: params.id } });
  if (!recon) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const toggled = recon.status === "OPEN" ? "LOCKED" : "OPEN";
  const updated = await prisma.monthlyRecon.update({
    where: { id: params.id },
    data:  {
      status:    toggled,
      lockedAt:  toggled === "LOCKED" ? new Date() : null,
      lockedById: toggled === "LOCKED" ? userId : null,
    },
  });

  return NextResponse.json({ status: updated.status, lockedAt: updated.lockedAt });
}
