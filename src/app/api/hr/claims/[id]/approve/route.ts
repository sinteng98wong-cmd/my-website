import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!["SUPER_ADMIN", "FINANCE", "CLINIC_MANAGER"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const claim = await prisma.staffClaim.findUnique({ where: { id: params.id } });
  if (!claim) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (claim.status !== "SUBMITTED") return NextResponse.json({ error: `Cannot approve a ${claim.status} claim` }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  await prisma.staffClaim.update({
    where: { id: params.id },
    data: { status: "APPROVED", reviewedById: userId, reviewedAt: new Date(), reviewNote: b.reviewNote || null },
  });
  return NextResponse.json({ ok: true, status: "APPROVED" });
}
